-- LANG04: each person's own app language. Null means English, the default. Additive only.
-- Rollback: /workspace/qa/neon-runner/rollback-0032.sql
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS language text CHECK (language IS NULL OR length(language) <= 12);
