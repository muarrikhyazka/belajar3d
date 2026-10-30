-- Single-teacher app (per the user's scope). One `teacher` row exists,
-- created on first boot via env vars. Everything else keyed loosely, no
-- multi-tenant account_id scattered everywhere like Kinkit - ponytail:
-- add account_id columns + multi-tenant if this ever needs >1 teacher.

CREATE TABLE IF NOT EXISTS teacher (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT 'Guru',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A "gedung" (building) = one subject/topic, holds a question set.
CREATE TABLE IF NOT EXISTS subjects (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '📘',
    world TEXT NOT NULL DEFAULT 'kota',   -- which 3D world/map this building sits in
    position_x REAL NOT NULL DEFAULT 0,
    position_z REAL NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS questions (
    id BIGSERIAL PRIMARY KEY,
    subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'mc',        -- 'mc' (multiple choice) | 'short' (short answer)
    prompt TEXT NOT NULL,
    choices JSONB,                           -- ['a','b','c','d'] for mc
    correct_index INT,                       -- for mc
    correct_text TEXT,                       -- for short answer (case-insensitive match)
    explanation TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A student session is anonymous: just a nickname, no account, matching
-- ZuperVerse's "murid tanpa akun" model. Identified by a random client_id
-- stored in the browser (localStorage), so a replay/retake is a new row.
CREATE TABLE IF NOT EXISTS student_attempts (
    id BIGSERIAL PRIMARY KEY,
    client_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    score INT NOT NULL DEFAULT 0,
    total INT NOT NULL DEFAULT 0,
    xp_earned INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_progress (
    client_id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    xp INT NOT NULL DEFAULT 0,
    level INT NOT NULL DEFAULT 1,
    badges JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
