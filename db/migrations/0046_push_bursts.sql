-- CMP08: no notification floods. Each device counts pushes in a 10 minute window. Additive only.
-- Rollback: /workspace/qa/neon-runner/rollback-0046.sql
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS burst_start timestamptz, ADD COLUMN IF NOT EXISTS burst_count integer NOT NULL DEFAULT 0;
