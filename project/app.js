// ════════════════════════════════════════════════════════════
//   VADODARA CONNECT — Frontend API Client (app.js)
//   All data now stored in NeonDB via a REST API.
//   Session is kept in sessionStorage (survives refresh, 
//   cleared on browser close).
// ════════════════════════════════════════════════════════════

const API = {
    BASE: '',   // Same origin — served by server.js
    async call(method, path, body) {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(this.BASE + path, opts);
        return res.json();
    },
    get:    (path)        => API.call('GET',    path),
    post:   (path, body)  => API.call('POST',   path, body),
    patch:  (path, body)  => API.call('PATCH',  path, body),
    delete: (path)        => API.call('DELETE', path)
};

// ─── SESSION HELPERS ──────────────────────────────────────────────────────────
const Session = {
    get:  ()      => { const d = sessionStorage.getItem('currentUser'); return d ? JSON.parse(d) : null; },
    set:  (user)  => sessionStorage.setItem('currentUser', JSON.stringify(user)),
    clear:()      => sessionStorage.removeItem('currentUser'),
    refresh: async () => {
        const u = Session.get();
        if (!u) return;
        const r = await API.get(`/api/users/${encodeURIComponent(u.email)}`);
        if (r.ok) { Session.set(r.data); return r.data; }
    }
};

// ─── AUTH GUARD ───────────────────────────────────────────────────────────────
if (!Session.get()) {
    window.location.href = 'index.html';
}

// ─── SECTION TITLES ───────────────────────────────────────────────────────────
const sectionTitles = {
    home:       'City Feed',
    complaints: 'Complaints',
    messages:   'Messages',
    rewards:    'Leaderboard',
    admin:      'Dashboard',
    profile:    'My Profile'
};

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function showSection(id, navItem) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const sec = document.getElementById(id);
    if (sec) sec.classList.add('active');

    if (navItem) {
        document.querySelectorAll('#navList li').forEach(li => li.classList.remove('active'));
        navItem.classList.add('active');
    }

    const titleEl = document.getElementById('topbarTitle');
    if (titleEl) titleEl.textContent = sectionTitles[id] || id;

    if (id === 'admin')      updateAdmin();
    if (id === 'rewards')    renderLeaderboard();
    if (id === 'messages')   renderMessages();
    if (id === 'complaints') {
        renderComplaints();
        setTimeout(() => { initMap(); refreshMap(); }, 50);
    }
    if (id === 'home') renderFeed();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
}

function logout() {
    Session.clear();
    window.location.href = 'index.html';
}

function showNotification(msg) {
    const n = document.getElementById('notification');
    if (!n) return;
    n.textContent = msg;
    n.style.display = 'block';
    clearTimeout(n._timer);
    n._timer = setTimeout(() => { n.style.display = 'none'; }, 2800);
}

// ─── COMPLAINTS ───────────────────────────────────────────────────────────────
async function submitComplaint() {
    const title     = document.getElementById('title').value.trim();
    const desc      = document.getElementById('description').value.trim();
    const location  = document.getElementById('location').value.trim();
    const category  = document.getElementById('category').value;
    const fileInput = document.getElementById('complaintImageInput');
    const file      = fileInput ? fileInput.files[0] : null;
    const user      = Session.get();
    const submitBtn = document.querySelector('#complaintForm button[type="submit"]');

    if (!title || !desc || !location) {
        showNotification('⚠️ Please fill in title, description, and location.');
        return;
    }

    // Show loading state
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

    // Wrap FileReader in a Promise so we can properly await it
    const readFileAsDataURL = (f) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror  = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(f);
    });

    try {
        const imageData = file ? await readFileAsDataURL(file) : null;

        const r = await API.post('/api/complaints', {
            title, description: desc, location, category,
            image: imageData || null,
            userEmail: user.email,
            author: user.fullName
        });

        if (r.ok) {
            prependComplaint(r.data);
            updateEmptyState('complaintList', 'complaintsEmpty');
            document.getElementById('complaintForm').reset();
            if (fileInput) fileInput.value = '';
            const disp = document.getElementById('complaintFileNameDisplay');
            if (disp) disp.textContent = '';
            showNotification('✅ Complaint filed successfully!');
            refreshMap();
        } else {
            showNotification('❌ ' + (r.error || 'Could not file complaint.'));
        }
    } catch (e) {
        showNotification('❌ Error: ' + e.message);
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Complaint →'; }
    }
}

function buildComplaintCard(c) {
    const div = document.createElement('div');
    div.className = 'complaint-card';
    div.dataset.id = c.id;
    div.innerHTML = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <h3>${escapeHTML(c.title)}</h3>
            <span class="status ${c.status}">${c.status === 'pending' ? 'Pending' : 'Resolved'}</span>
        </div>
        <p style="margin-top:6px;">${escapeHTML(c.description)}</p>
        ${c.image ? `<img src="${c.image}" alt="Complaint image" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin:10px 0;">` : ''}
        <div class="complaint-meta">
            <span class="location-tag">📍 ${escapeHTML(c.location)}</span>
            <span class="location-tag">${escapeHTML(c.category || '')}</span>
            <span class="location-tag">📅 ${c.date || ''}</span>
        </div>
        <div class="complaint-actions">
            <button class="support-btn ${c.supports > 0 ? 'supported' : ''}"
                ${c.supports > 0 ? 'disabled' : ''}
                onclick="supportComplaint(this, ${c.id})">
                👍 Support${c.supports > 0 ? ` (${c.supports})` : ''}
            </button>
        </div>
    `;
    return div;
}

function prependComplaint(c) {
    const list = document.getElementById('complaintList');
    if (!list) return;
    list.prepend(buildComplaintCard(c));
}

async function renderComplaints() {
    const list = document.getElementById('complaintList');
    if (!list) return;
    list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:12px;">Loading complaints…</p>';
    const user = Session.get();
    const r = await API.get('/api/complaints');
    if (!r.ok) { list.innerHTML = ''; updateEmptyState('complaintList', 'complaintsEmpty'); return; }
    // Show only current user's complaints in the citizen view
    const mine = r.data.filter(c => c.userId === user.email);
    list.innerHTML = '';
    mine.forEach(c => list.appendChild(buildComplaintCard(c)));
    updateEmptyState('complaintList', 'complaintsEmpty');
}

async function supportComplaint(btn, id) {
    if (btn.disabled) return;
    const r = await API.patch(`/api/complaints/${id}/support`);
    if (r.ok) {
        const current = parseInt(btn.textContent.match(/\d+/)?.[0] || '0') + 1;
        btn.textContent = `👍 Support (${current})`;
        btn.classList.add('supported');
        btn.disabled = true;
        showNotification('You supported this complaint!');
    }
}


// ─── CITY FEED ────────────────────────────────────────────────────────────────
async function createPost() {
    const fileInput = document.getElementById('uploadImage');
    const caption   = document.getElementById('postCaption').value.trim();
    const file      = fileInput ? fileInput.files[0] : null;
    const user      = Session.get();

    if (!caption && !file) {
        showNotification('Please write something or attach an image.');
        return;
    }

    const finalize = async (imageData) => {
        const r = await API.post('/api/posts', {
            caption, image: imageData || null,
            author: user.fullName || 'Citizen',
            userEmail: user.email
        });
        if (r.ok) {
            renderPost(r.data, true);
            if (fileInput) fileInput.value = '';
            document.getElementById('postCaption').value = '';
            const disp = document.getElementById('fileNameDisplay');
            if (disp) disp.textContent = '';
            updateEmptyState('feed', 'feedEmpty');
            showNotification('📢 Post shared with the community!');
        }
    };

    if (file) {
        const reader = new FileReader();
        reader.onload = e => finalize(e.target.result);
        reader.readAsDataURL(file);
    } else {
        await finalize(null);
    }
}

function renderPost(post, prepend = false) {
    const feed = document.getElementById('feed');
    if (!feed) return;
    const initials = (post.author || 'C').charAt(0).toUpperCase();
    const wrapper = document.createElement('div');
    wrapper.className = 'post';
    wrapper.id = `post-${post.id}`;
    wrapper.innerHTML = `
        <div class="post-header">
            <div class="post-author">
                <div class="post-avatar">${escapeHTML(initials)}</div>
                <div>
                    <div class="post-author-name">${escapeHTML(post.author)}</div>
                    <div class="post-time">${post.time || ''}</div>
                </div>
            </div>
        </div>
        ${post.caption ? `<div class="post-caption">${escapeHTML(post.caption)}</div>` : ''}
        ${post.image   ? `<img src="${post.image}" alt="Issue image" loading="lazy">` : ''}
        <div class="post-actions">
            <button class="like-btn" onclick="likePost(this, ${post.id})">❤️ Like</button>
            <span class="like-count">${post.likes} Like${post.likes !== 1 ? 's' : ''}</span>
        </div>
        <div class="comment-box">
            <input type="text" placeholder="Add a comment… (press Enter)" onkeypress="if(event.key==='Enter') addComment(this, ${post.id})">
            <div class="comments">
                ${(post.comments || []).map(c => `<p>💬 <strong>${escapeHTML(c.user)}:</strong> ${escapeHTML(c.text)}</p>`).join('')}
            </div>
        </div>
    `;
    if (prepend) feed.prepend(wrapper);
    else feed.appendChild(wrapper);
}

async function likePost(btn, id) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.style.opacity = '0.7';
    const r = await API.patch(`/api/posts/${id}/like`);
    if (r.ok) {
        btn.nextElementSibling.textContent = `${r.data.likes} Like${r.data.likes !== 1 ? 's' : ''}`;
    }
}

async function addComment(input, id) {
    const text = input.value.trim();
    if (!text) return;
    const user = Session.get();
    const r = await API.post(`/api/posts/${id}/comment`, { userName: user.fullName || 'Citizen', text });
    if (r.ok) {
        const commentsDiv = input.nextElementSibling;
        const p = document.createElement('p');
        p.innerHTML = `💬 <strong>${escapeHTML(user.fullName || 'Citizen')}:</strong> ${escapeHTML(text)}`;
        commentsDiv.appendChild(p);
        input.value = '';
    }
}

async function renderFeed() {
    const feed = document.getElementById('feed');
    if (!feed) return;
    feed.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:12px;">Loading posts…</p>';
    const r = await API.get('/api/posts');
    feed.innerHTML = '';
    if (r.ok) r.data.forEach(p => renderPost(p, false));
    updateEmptyState('feed', 'feedEmpty');
}

// ─── MESSAGES (two-way citizen ↔ admin) ──────────────────────────────────────
async function sendMessage() {
    const input = document.getElementById('chatInput');
    const text  = input.value.trim();
    if (!text) return;
    const user = Session.get();
    const r = await API.post('/api/messages', {
        sender: user.fullName || 'Citizen',
        senderRole: 'citizen',
        message: text
    });
    if (r.ok) {
        appendMessage(r.data);
        input.value = '';
    }
}

function appendMessage(msg) {
    const chat = document.getElementById('chatMessages');
    if (!chat) return;
    const isAdmin   = msg.senderRole === 'admin';
    const isCitizen = msg.senderRole === 'citizen';
    const curUser   = Session.get();
    const isMe      = isCitizen && msg.sender === (curUser?.fullName || '');

    const el = document.createElement('div');
    el.className = `message ${isMe ? 'sent' : 'received'}`;

    if (isAdmin) {
        el.innerHTML = `
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#FB923C;margin-bottom:4px;">⚙️ ${escapeHTML(msg.sender || 'City Admin')}</div>
            <div>${escapeHTML(msg.message)}</div>
            <div style="font-size:10px;opacity:0.55;margin-top:3px;">${msg.time || ''}</div>`;
        el.style.cssText += 'border-left:3px solid #FB923C;background:rgba(251,146,60,0.12);border-radius:4px 14px 14px 14px;';
    } else {
        el.innerHTML = `
            ${!isMe ? `<div style="font-size:10px;font-weight:600;color:var(--accent);margin-bottom:4px;">${escapeHTML(msg.sender)}</div>` : ''}
            <div>${escapeHTML(msg.message)}</div>
            <div style="font-size:10px;opacity:0.6;margin-top:3px;${isMe ? 'text-align:right;' : ''}">${msg.time || ''}</div>`;
    }
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
}

let _msgPollTimer = null;
let _lastMsgId    = 0;

async function pollMessages() {
    const r = await API.get('/api/messages');
    if (!r.ok) return;
    const newMsgs = r.data.filter(m => m.id > _lastMsgId);
    const user    = Session.get();
    newMsgs.forEach(m => {
        // Don't re-append our own citizen messages (already appended at send)
        if (!(m.senderRole === 'citizen' && m.sender === (user?.fullName || ''))) {
            appendMessage(m);
        }
        _lastMsgId = Math.max(_lastMsgId, m.id);
    });
}

async function renderMessages() {
    const chat = document.getElementById('chatMessages');
    if (!chat) return;
    chat.innerHTML = `<div class="message received" style="font-size:13px;">
        <div style="font-size:10px;font-weight:700;color:var(--green);margin-bottom:3px;">⚙️ VADODARA CONNECT</div>
        Hello citizens! 👋 Welcome to the community chat. City administrators can read and reply to your messages.
    </div>`;
    const r = await API.get('/api/messages');
    if (r.ok) {
        r.data.forEach(m => appendMessage(m));
        if (r.data.length) _lastMsgId = r.data[r.data.length - 1].id;
    }
    // Start polling for new messages
    if (_msgPollTimer) clearInterval(_msgPollTimer);
    _msgPollTimer = setInterval(pollMessages, 4000);
}

// ─── POINTS & STATS ───────────────────────────────────────────────────────────
function updatePointsUI() {
    const user = Session.get();
    if (!user) return;
    const pts = user.points || 0;
    ['points', 'profilePoints', 'leaderPoints'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = pts;
    });
}

async function updateAdmin() {
    const r = await API.get('/api/complaints');
    if (!r.ok) return;
    const user = Session.get();
    const freshUser = await Session.refresh() || user;
    const all  = r.data.filter(c => c.userId === freshUser.email);
    const res  = all.filter(c => c.status === 'resolved').length;
    const pend = all.length - res;

    setEl('totalComplaints', all.length);
    setEl('resolved', res);
    setEl('pending', pend);
    setEl('points', freshUser.points || 0);

    const bar   = document.getElementById('progressBar');
    const label = document.getElementById('progressLabel');
    const pct   = all.length ? Math.round((res / all.length) * 100) : 0;
    if (bar)   bar.style.width = pct + '%';
    if (label) label.textContent = `${res} of ${all.length} complaints resolved (${pct}%)`;
}

async function renderLeaderboard() {
    const list = document.getElementById('leaderboardList');
    if (!list) return;
    const ptsEl = document.getElementById('leaderPoints');

    const r = await API.get('/api/users');
    if (!r.ok) { list.innerHTML = '<p style="color:var(--text-muted);">Could not load leaderboard.</p>'; return; }

    const currentEmail = Session.get()?.email;
    const users  = r.data;
    const medals = ['🥇','🥈','🥉'];
    const avatarClasses = ['gold','silver','bronze'];

    if (ptsEl) {
        const me = users.find(u => u.email === currentEmail);
        if (me) ptsEl.textContent = me.points || 0;
    }

    list.innerHTML = users.length === 0
        ? '<p style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px 0;">No citizens have earned points yet.</p>'
        : users.map((u, i) => `
            <div class="leader-item" ${u.email === currentEmail ? 'style="border-color:rgba(79,142,247,0.35);background:rgba(79,142,247,0.06);"' : ''}>
                <div class="leader-rank">${medals[i] || `#${i+1}`}</div>
                <div class="leader-avatar ${avatarClasses[i] || 'default'}">${(u.fullName||'C').charAt(0).toUpperCase()}</div>
                <div class="leader-info">
                    <div class="leader-name">${escapeHTML(u.fullName)} ${u.email === currentEmail ? '<span style="font-size:10px;color:var(--accent);margin-left:6px;">YOU</span>' : ''}</div>
                    <div class="leader-role">${escapeHTML(u.role || 'Citizen')}</div>
                </div>
                <div>
                    <div class="leader-points">${u.points || 0}</div>
                    <div class="leader-pts-label">pts</div>
                </div>
            </div>
        `).join('');
}

async function renderProfile() {
    const user = Session.get();
    if (!user) return;
    // Re-fetch from DB for latest points
    const fresh = await Session.refresh() || user;

    const r = await API.get('/api/complaints');
    const myComplaints = r.ok ? r.data.filter(c => c.userId === fresh.email) : [];
    const myResolved   = myComplaints.filter(c => c.status === 'resolved').length;
    const initials     = (fresh.fullName || 'C').charAt(0).toUpperCase();

    setEl('profileName',       fresh.fullName || 'Citizen');
    setEl('profileEmail',      fresh.email || '');
    setEl('profileJoin',       `Joined: ${fresh.joinDate || '—'}`);
    setEl('profileRole',       fresh.role || 'Citizen');
    setEl('profilePoints',     fresh.points || 0);
    setEl('profileResolved',   myResolved);
    setEl('profileComplaints', myComplaints.length);

    const av = document.getElementById('profileAvatarBig');
    if (av) av.textContent = initials;
    const topAv = document.getElementById('userAvatar');
    if (topAv) topAv.textContent = initials;

    const greeting = document.getElementById('topbarGreeting');
    if (greeting) greeting.textContent = `Welcome back, ${fresh.fullName?.split(' ')[0] || 'Citizen'}`;
}

// ─── MAP (Leaflet.js) ─────────────────────────────────────────────────────────
let _leafletMap = null;
let _selectedMarker = null;

async function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl || _leafletMap) return;

    const VADODARA = [22.3072, 73.1812];
    _leafletMap = L.map('map', { center: VADODARA, zoom: 13, zoomControl: true });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd', maxZoom: 19
    }).addTo(_leafletMap);

    const cityIcon = L.divIcon({ html: '<div style="background:linear-gradient(135deg,#4F8EF7,#A259FF);width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px rgba(79,142,247,0.6);"></div>', className: '', iconSize: [14, 14], iconAnchor: [7, 7] });
    L.marker(VADODARA, { icon: cityIcon }).addTo(_leafletMap).bindPopup('<strong>Vadodara City Centre</strong>').openPopup();

    const pinIcon = L.divIcon({ html: '<div style="background:linear-gradient(135deg,#FB923C,#EF4444);width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 0 10px rgba(251,146,60,0.6);"></div>', className: '', iconSize: [16, 16], iconAnchor: [8, 16] });
    const selIcon  = L.divIcon({ html: '<div style="background:#34D399;width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 0 14px rgba(52,211,153,0.7);"></div>', className: '', iconSize: [18, 18], iconAnchor: [9, 18] });

    const spread = 0.025;
    const r = await API.get('/api/complaints');
    if (r.ok) {
        r.data.forEach((c, i) => {
            const lat = VADODARA[0] + (Math.sin(i * 1.2) * spread);
            const lng = VADODARA[1] + (Math.cos(i * 1.2) * spread);
            L.marker([lat, lng], { icon: pinIcon }).addTo(_leafletMap)
                .bindPopup(`<strong>${escapeHTML(c.title)}</strong><br><span style="color:${c.status==='resolved'?'#34D399':'#FB923C'}">${c.status.toUpperCase()}</span>`);
        });
    }

    _leafletMap.on('click', function(e) {
        const { lat, lng } = e.latlng;
        if (_selectedMarker) _leafletMap.removeLayer(_selectedMarker);
        _selectedMarker = L.marker([lat, lng], { icon: selIcon }).addTo(_leafletMap)
            .bindPopup('📍 <strong>Selected location</strong><br>This will be attached to your complaint.').openPopup();
        mapEl.dataset.lat = lat.toFixed(5);
        mapEl.dataset.lng = lng.toFixed(5);
        const locInput = document.getElementById('location');
        if (locInput && !locInput.value.trim()) locInput.value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    });

    const hint = document.createElement('p');
    hint.style.cssText = 'font-size:12px;color:var(--text-muted);margin-top:-18px;margin-bottom:20px;display:flex;align-items:center;gap:6px;';
    hint.innerHTML = '🖱️ Click anywhere on the map to pin your complaint location';
    mapEl.parentNode.insertBefore(hint, mapEl.nextSibling);
}

function refreshMap() {
    if (_leafletMap) setTimeout(() => _leafletMap.invalidateSize(), 100);
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function setEl(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function updateEmptyState(listId, emptyId) {
    const list  = document.getElementById(listId);
    const empty = document.getElementById(emptyId);
    if (!list || !empty) return;
    empty.style.display = list.children.length === 0 ? 'block' : 'none';
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (!Session.get()) { window.location.href = 'index.html'; return; }

    const cForm = document.getElementById('complaintForm');
    if (cForm) cForm.addEventListener('submit', e => { e.preventDefault(); submitComplaint(); });

    await renderProfile();
    await renderFeed();
    updatePointsUI();
    updateAdmin();
});