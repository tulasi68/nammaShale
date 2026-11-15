-- 0003_school_onboarding.sql
-- Adds a one-time acceptance claim to invitation records. Apply after 0002.
ALTER TABLE user_invitations ADD COLUMN accepted_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_user_invitations_token_status ON user_invitations(token_hash, accepted_at, revoked_at);
