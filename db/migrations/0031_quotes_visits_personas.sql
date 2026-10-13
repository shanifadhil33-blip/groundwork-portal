-- Client side agent actions (ROLE09): approve a quote, confirm a visit time. Demo people Nabil (office staff), Kevin (client office staff), Faisal (household). Additive only.
-- Rollback: /workspace/qa/neon-runner/rollback-0031.sql
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS quote_amount numeric(12,2) CHECK (quote_amount IS NULL OR quote_amount >= 0);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS quote_note text CHECK (quote_note IS NULL OR length(quote_note) <= 1000);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS quote_status text CHECK (quote_status IS NULL OR quote_status IN ('pending','approved','declined'));
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS quote_decided_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS quote_decided_at timestamptz;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS visit_confirmed_for timestamptz;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS visit_confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_demo_persona_check;
ALTER TABLE users ADD CONSTRAINT users_demo_persona_check CHECK(demo_persona IN ('imran','sam','ravi','pranav','omar','bilal','anil','nabil','kevin','faisal'));
