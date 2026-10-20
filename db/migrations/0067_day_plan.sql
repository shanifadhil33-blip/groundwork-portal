-- SCHED03 window, SCHED05 gate pass, SCHED06 running late, Nov 23 archives.
-- Additive. Not applied by this change. Rollback: db/rollbacks/rollback-0067.sql
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS window_hours smallint NOT NULL DEFAULT 2 CHECK (window_hours BETWEEN 1 AND 4);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS gate_pass text CHECK (gate_pass IS NULL OR gate_pass IN ('waiting','confirmed','not_needed'));
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS gate_pass_at timestamptz;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS gate_pass_by uuid REFERENCES users(id);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS running_late_at timestamptz;

ALTER TABLE company_documents ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_archived_at timestamptz;

-- LEARN09 rules go into the existing personal_agent_learning and company_rules tables.
