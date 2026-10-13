-- Archive for clients and sites with job history: hidden from daily lists, every record kept. Additive only.
-- Rollback: /workspace/qa/neon-runner/rollback-0024.sql
ALTER TABLE clients ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS archived_at timestamptz;
