-- 0002_secure_platform_core.sql
-- Apply after db/schema.sql. Never run against an unverified production database.
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_changed_at TEXT;
CREATE TABLE IF NOT EXISTS auth_sessions (
 id TEXT PRIMARY KEY,
 token_hash TEXT NOT NULL UNIQUE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at TEXT NOT NULL,
 revoked_at TEXT,
 last_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id,expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_rate_limits (
 key_hash TEXT PRIMARY KEY,
 window_started_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_invitations (
 id TEXT PRIMARY KEY,
 token_hash TEXT NOT NULL UNIQUE,
 email TEXT,
 phone TEXT,
 institution_id TEXT NOT NULL REFERENCES institutions(id),
 role TEXT NOT NULL,
 invited_by_membership_id TEXT NOT NULL REFERENCES memberships(id),
 expires_at TEXT NOT NULL,
 accepted_at TEXT,
 revoked_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_invitations_institution ON user_invitations(institution_id,expires_at);
CREATE TABLE IF NOT EXISTS teacher_collaborations (
 id TEXT PRIMARY KEY,
 institution_id TEXT NOT NULL REFERENCES institutions(id),
 title TEXT NOT NULL,
 description TEXT,
 subject_area TEXT,
 visibility TEXT NOT NULL DEFAULT 'institution' CHECK(visibility IN ('institution','approved_partnership')),
 created_by_membership_id TEXT NOT NULL REFERENCES memberships(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS teacher_collaboration_members (
 collaboration_id TEXT NOT NULL REFERENCES teacher_collaborations(id) ON DELETE CASCADE,
 membership_id TEXT NOT NULL REFERENCES memberships(id),
 member_role TEXT NOT NULL DEFAULT 'participant' CHECK(member_role IN ('owner','participant')),
 joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(collaboration_id,membership_id)
);
CREATE TABLE IF NOT EXISTS shared_resources (
 id TEXT PRIMARY KEY,
 institution_id TEXT NOT NULL REFERENCES institutions(id),
 collaboration_id TEXT REFERENCES teacher_collaborations(id),
 title TEXT NOT NULL,
 description TEXT,
 resource_type TEXT NOT NULL,
 object_key TEXT NOT NULL,
 visibility TEXT NOT NULL DEFAULT 'institution' CHECK(visibility IN ('institution','approved_partnership')),
 uploaded_by_membership_id TEXT NOT NULL REFERENCES memberships(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS partnership_reviews (
 id TEXT PRIMARY KEY,
 partnership_id TEXT NOT NULL REFERENCES institution_partnerships(id),
 reviewer_membership_id TEXT NOT NULL REFERENCES memberships(id),
 review_date TEXT NOT NULL,
 summary TEXT NOT NULL,
 outcomes_json TEXT,
 next_actions_json TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
