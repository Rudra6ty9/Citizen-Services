// ═══════════════════════════════════════════
//   VADODARA CONNECT — Express + NeonDB Server
// ═══════════════════════════════════════════
require('dotenv').config();

const express  = require('express');
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const cors     = require('cors');
const path     = require('path');
const multer   = require('multer');

const app  = express();
const port = process.env.PORT || 3000;

// ─── DB POOL ─────────────────────────────────────────────────────────────────
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '20mb' }));       // big limit for base64 images
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'project')));

// ─── DB INIT: run schema on startup ──────────────────────────────────────────
async function initDB() {
    const schema = `
        CREATE TABLE IF NOT EXISTS users (
            id          SERIAL PRIMARY KEY,
            full_name   TEXT          NOT NULL,
            email       TEXT          UNIQUE NOT NULL,
            mobile      TEXT,
            password    TEXT          NOT NULL,
            role        TEXT          DEFAULT 'Citizen',
            points      INTEGER       DEFAULT 0,
            join_date   TEXT,
            created_at  TIMESTAMPTZ   DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS complaints (
            id          SERIAL PRIMARY KEY,
            title       TEXT          NOT NULL,
            description TEXT          NOT NULL,
            location    TEXT          NOT NULL,
            category    TEXT,
            status      TEXT          DEFAULT 'pending',
            supports    INTEGER       DEFAULT 0,
            user_email  TEXT,
            author      TEXT,
            image       TEXT,
            date        TEXT,
            created_at  TIMESTAMPTZ   DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS posts (
            id          SERIAL PRIMARY KEY,
            caption     TEXT,
            image       TEXT,
            author      TEXT,
            user_email  TEXT,
            likes       INTEGER       DEFAULT 0,
            time        TEXT,
            created_at  TIMESTAMPTZ   DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS comments (
            id          SERIAL PRIMARY KEY,
            post_id     INTEGER       REFERENCES posts(id) ON DELETE CASCADE,
            user_name   TEXT,
            text        TEXT          NOT NULL,
            created_at  TIMESTAMPTZ   DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS messages (
            id          SERIAL PRIMARY KEY,
            sender      TEXT          NOT NULL,
            sender_role TEXT          DEFAULT 'citizen',
            message     TEXT          NOT NULL,
            time        TEXT,
            created_at  TIMESTAMPTZ   DEFAULT NOW()
        );
    `;
    try {
        await pool.query(schema);
        console.log('✅ Database schema initialised');
    } catch (err) {
        console.error('❌ Failed to initialise database:', err.message);
    }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const ok  = (res, data, status = 200) => res.status(status).json({ ok: true,  data });
const err = (res, msg,  status = 400) => res.status(status).json({ ok: false, error: msg });

// ═══════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
    const { fullName, email, mobile, password, role } = req.body;
    if (!fullName || !email || !password) return err(res, 'Missing required fields');

    try {
        const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
        if (existing.rows.length) return err(res, 'Email already registered');

        const hashed   = await bcrypt.hash(password, 10);
        const joinDate = new Date().toLocaleDateString('en-IN');
        const result   = await pool.query(
            `INSERT INTO users (full_name, email, mobile, password, role, join_date)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, full_name, email, mobile, role, points, join_date`,
            [fullName, email, mobile || '', hashed, role || 'Citizen', joinDate]
        );
        return ok(res, result.rows[0], 201);
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return err(res, 'Email and password required');

    try {
        const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
        const user   = result.rows[0];
        if (!user) return err(res, 'Invalid email or password', 401);

        const match = await bcrypt.compare(password, user.password);
        if (!match) return err(res, 'Invalid email or password', 401);

        // Return safe user object (no password)
        const { password: _p, ...safeUser } = user;
        const userForClient = {
            id:       safeUser.id,
            fullName: safeUser.full_name,
            email:    safeUser.email,
            mobile:   safeUser.mobile,
            role:     safeUser.role,
            points:   safeUser.points,
            joinDate: safeUser.join_date
        };
        return ok(res, userForClient);
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// ═══════════════════════════════════════════
//  COMPLAINTS ROUTES
// ═══════════════════════════════════════════

// GET /api/complaints — returns all, newest first
app.get('/api/complaints', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM complaints ORDER BY created_at DESC');
        const rows = result.rows.map(r => ({
            id:          r.id,
            title:       r.title,
            description: r.description,
            location:    r.location,
            category:    r.category,
            status:      r.status,
            supports:    r.supports,
            userId:      r.user_email,
            author:      r.author,
            image:       r.image,
            date:        r.date
        }));
        return ok(res, rows);
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// POST /api/complaints — create
app.post('/api/complaints', async (req, res) => {
    const { title, description, location, category, image, userEmail, author } = req.body;
    if (!title || !description || !location) return err(res, 'Missing required fields');

    try {
        const date = new Date().toLocaleDateString('en-IN');
        const result = await pool.query(
            `INSERT INTO complaints (title, description, location, category, image, user_email, author, date)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING *`,
            [title, description, location, category || 'Other', image || null, userEmail, author, date]
        );
        const r = result.rows[0];
        return ok(res, {
            id: r.id, title: r.title, description: r.description, location: r.location,
            category: r.category, status: r.status, supports: r.supports,
            userId: r.user_email, author: r.author, image: r.image, date: r.date
        }, 201);
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// PATCH /api/complaints/:id/status — resolve or change status
app.patch('/api/complaints/:id/status', async (req, res) => {
    const { status } = req.body;
    const { id } = req.params;
    try {
        const result = await pool.query(
            'UPDATE complaints SET status=$1 WHERE id=$2 RETURNING user_email, author',
            [status, id]
        );
        if (!result.rows.length) return err(res, 'Complaint not found', 404);

        if (status === 'resolved') {
            // Award 10 points to the user
            const userEmail = result.rows[0].user_email;
            if (userEmail) {
                await pool.query('UPDATE users SET points = points + 10 WHERE email=$1', [userEmail]);
            }
        }
        return ok(res, { updated: true });
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// PATCH /api/complaints/:id/support — increment support count
app.patch('/api/complaints/:id/support', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('UPDATE complaints SET supports = supports + 1 WHERE id=$1', [id]);
        return ok(res, { updated: true });
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// DELETE /api/complaints/:id
app.delete('/api/complaints/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM complaints WHERE id=$1', [req.params.id]);
        return ok(res, { deleted: true });
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// ═══════════════════════════════════════════
//  COMMUNITY POSTS ROUTES
// ═══════════════════════════════════════════

// GET /api/posts — returns all posts with their comments nested
app.get('/api/posts', async (req, res) => {
    try {
        const postsResult = await pool.query('SELECT * FROM posts ORDER BY created_at DESC');
        const posts = postsResult.rows;

        // Fetch all comments and group them by post id
        const commentsResult = await pool.query('SELECT * FROM comments ORDER BY created_at ASC');
        const commentsByPost = {};
        commentsResult.rows.forEach(c => {
            if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = [];
            commentsByPost[c.post_id].push({ user: c.user_name, text: c.text });
        });

        const result = posts.map(p => ({
            id:        p.id,
            caption:   p.caption,
            image:     p.image,
            author:    p.author,
            userEmail: p.user_email,
            likes:     p.likes,
            time:      p.time,
            comments:  commentsByPost[p.id] || []
        }));
        return ok(res, result);
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// POST /api/posts — create
app.post('/api/posts', async (req, res) => {
    const { caption, image, author, userEmail } = req.body;
    if (!caption && !image) return err(res, 'Post must have caption or image');

    try {
        const time = new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
        const result = await pool.query(
            'INSERT INTO posts (caption, image, author, user_email, time) VALUES ($1,$2,$3,$4,$5) RETURNING *',
            [caption || '', image || null, author, userEmail, time]
        );
        const p = result.rows[0];
        return ok(res, { id: p.id, caption: p.caption, image: p.image, author: p.author, userEmail: p.user_email, likes: p.likes, time: p.time, comments: [] }, 201);
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// PATCH /api/posts/:id/like — increment like count
app.patch('/api/posts/:id/like', async (req, res) => {
    try {
        const result = await pool.query('UPDATE posts SET likes = likes + 1 WHERE id=$1 RETURNING likes', [req.params.id]);
        if (!result.rows.length) return err(res, 'Post not found', 404);
        return ok(res, { likes: result.rows[0].likes });
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// POST /api/posts/:id/comment — add comment
app.post('/api/posts/:id/comment', async (req, res) => {
    const { userName, text } = req.body;
    if (!text) return err(res, 'Comment text required');
    try {
        await pool.query('INSERT INTO comments (post_id, user_name, text) VALUES ($1,$2,$3)', [req.params.id, userName, text]);
        return ok(res, { added: true }, 201);
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// DELETE /api/posts/:id
app.delete('/api/posts/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
        return ok(res, { deleted: true });
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// ═══════════════════════════════════════════
//  MESSAGES ROUTES
// ═══════════════════════════════════════════

// GET /api/messages
app.get('/api/messages', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM messages ORDER BY created_at ASC');
        const msgs = result.rows.map(r => ({
            id: r.id, sender: r.sender, senderRole: r.sender_role, message: r.message, time: r.time
        }));
        return ok(res, msgs);
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// POST /api/messages
app.post('/api/messages', async (req, res) => {
    const { sender, senderRole, message } = req.body;
    if (!sender || !message) return err(res, 'sender and message required');
    try {
        const time = new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
        const result = await pool.query(
            'INSERT INTO messages (sender, sender_role, message, time) VALUES ($1,$2,$3,$4) RETURNING *',
            [sender, senderRole || 'citizen', message, time]
        );
        const r = result.rows[0];
        return ok(res, { id: r.id, sender: r.sender, senderRole: r.sender_role, message: r.message, time: r.time }, 201);
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// ═══════════════════════════════════════════
//  USERS ROUTES
// ═══════════════════════════════════════════

// GET /api/users — all users (admin only)
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, full_name, email, mobile, role, points, join_date, created_at FROM users ORDER BY points DESC');
        const users = result.rows.map(u => ({
            id: u.id, fullName: u.full_name, email: u.email, mobile: u.mobile,
            role: u.role, points: u.points, joinDate: u.join_date
        }));
        return ok(res, users);
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// GET /api/users/:email — single user (for re-hydrating session)
app.get('/api/users/:email', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, full_name, email, mobile, role, points, join_date FROM users WHERE email=$1',
            [req.params.email]
        );
        if (!result.rows.length) return err(res, 'User not found', 404);
        const u = result.rows[0];
        return ok(res, { id: u.id, fullName: u.full_name, email: u.email, mobile: u.mobile, role: u.role, points: u.points, joinDate: u.join_date });
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// DELETE /api/users/:id — admin delete
app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
        return ok(res, { deleted: true });
    } catch (e) {
        return err(res, e.message, 500);
    }
});

// ─── CATCH-ALL: serve index.html for SPA navigation ──────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'project', 'index.html')));

// ─── START ────────────────────────────────────────────────────────────────────
initDB().then(() => {
    app.listen(port, () => {
        console.log(`\n🚀 Vadodara Connect server running at http://localhost:${port}`);
        console.log(`   Open your browser and navigate to http://localhost:${port}\n`);
    });
});

module.exports = app;
