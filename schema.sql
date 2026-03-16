-- ═══════════════════════════════════════════
--   VADODARA CONNECT — NeonDB Schema
-- ═══════════════════════════════════════════

-- USERS
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

-- COMPLAINTS
CREATE TABLE IF NOT EXISTS complaints (
    id          SERIAL PRIMARY KEY,
    title       TEXT          NOT NULL,
    description TEXT          NOT NULL,
    location    TEXT          NOT NULL,
    category    TEXT,
    status      TEXT          DEFAULT 'pending',
    supports    INTEGER       DEFAULT 0,
    user_email  TEXT          REFERENCES users(email) ON DELETE CASCADE,
    author      TEXT,
    image       TEXT,
    date        TEXT,
    created_at  TIMESTAMPTZ   DEFAULT NOW()
);

-- POSTS
CREATE TABLE IF NOT EXISTS posts (
    id          SERIAL PRIMARY KEY,
    caption     TEXT,
    image       TEXT,
    author      TEXT,
    user_email  TEXT          REFERENCES users(email) ON DELETE CASCADE,
    likes       INTEGER       DEFAULT 0,
    time        TEXT,
    created_at  TIMESTAMPTZ   DEFAULT NOW()
);

-- COMMENTS (on posts)
CREATE TABLE IF NOT EXISTS comments (
    id          SERIAL PRIMARY KEY,
    post_id     INTEGER       REFERENCES posts(id) ON DELETE CASCADE,
    user_name   TEXT,
    text        TEXT          NOT NULL,
    created_at  TIMESTAMPTZ   DEFAULT NOW()
);

-- MESSAGES (citizen ↔ admin)
CREATE TABLE IF NOT EXISTS messages (
    id          SERIAL PRIMARY KEY,
    sender      TEXT          NOT NULL,
    sender_role TEXT          DEFAULT 'citizen',
    message     TEXT          NOT NULL,
    time        TEXT,
    created_at  TIMESTAMPTZ   DEFAULT NOW()
);
