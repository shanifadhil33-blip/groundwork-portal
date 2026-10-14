-- LEARN01: the name a person wants to be called, asked once. Additive only.
-- Rollback: /workspace/qa/neon-runner/rollback-0048.sql
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS preferred_name text CHECK (preferred_name IS NULL OR length(preferred_name) <= 40), ADD COLUMN IF NOT EXISTS name_asked_at timestamptz;
