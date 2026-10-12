-- Dashboard agent: why notes, decision log and Undo on assistant actions; jobs covered by a client contract. Additive only.
-- Rollback: /workspace/qa/neon-runner/rollback-0023.sql
ALTER TABLE assistant_actions ADD COLUMN IF NOT EXISTS why text CHECK (why IS NULL OR length(why) <= 400);
ALTER TABLE assistant_actions ADD COLUMN IF NOT EXISTS summary text CHECK (summary IS NULL OR length(summary) <= 600);
ALTER TABLE assistant_actions ADD COLUMN IF NOT EXISTS before jsonb;
ALTER TABLE assistant_actions ADD COLUMN IF NOT EXISTS outcome text CHECK (outcome IS NULL OR outcome IN ('done','failed'));
ALTER TABLE assistant_actions ADD COLUMN IF NOT EXISTS undone_at timestamptz;
ALTER TABLE assistant_actions ADD COLUMN IF NOT EXISTS undone_by uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS assistant_actions_log ON assistant_actions(workspace_id, consumed_at DESC) WHERE consumed_at IS NOT NULL;
-- Payment for a job: to bill (default when unset), covered by the client contract, or paid.
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS payment_status text CHECK (payment_status IS NULL OR payment_status IN ('to_bill','contract','paid'));
-- A client's maintenance contract: how many visits it includes and when it ends.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_visits smallint CHECK (contract_visits IS NULL OR contract_visits BETWEEN 0 AND 999);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_ends_on date;
