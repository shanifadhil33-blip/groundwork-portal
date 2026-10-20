-- SCHED03 window, SCHED05 gate pass, SCHED06 running late, Nov 23 archives, LEARN09 rules.
-- Additive. Not applied by this change. Rollback: db/rollbacks/rollback-0067.sql
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS window_hours smallint NOT NULL DEFAULT 2 CHECK (window_hours BETWEEN 1 AND 4);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS gate_pass text CHECK (gate_pass IS NULL OR gate_pass IN ('waiting','confirmed','not_needed'));
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS gate_pass_at timestamptz;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS gate_pass_by uuid REFERENCES users(id);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS running_late_at timestamptz;

ALTER TABLE company_documents ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_archived_at timestamptz;

CREATE TABLE IF NOT EXISTS learned_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id),
 scope text NOT NULL CHECK (scope IN ('personal','company')),
 body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 2 AND 300),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE (workspace_id, user_id, body)
);
ALTER TABLE learned_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE learned_rules FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON learned_rules TO %I USING(true) WITH CHECK(true)', current_user); END $$;
CREATE POLICY learned_read ON learned_rules FOR SELECT USING (is_member(workspace_id) AND (user_id = app_user_id() OR scope = 'company'));
REVOKE ALL ON learned_rules FROM PUBLIC;
