-- Technician weekly off days, leave and sick days, and the structured job report. Additive only.
-- Rollback: /workspace/qa/neon-runner/rollback-0022.sql
ALTER TABLE members ADD COLUMN IF NOT EXISTS off_days smallint[] NOT NULL DEFAULT '{}';
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS report_problem text CHECK (report_problem IS NULL OR length(report_problem) <= 2000);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS report_work text CHECK (report_work IS NULL OR length(report_work) <= 2000);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS report_outcome text CHECK (report_outcome IS NULL OR report_outcome IN ('fixed','temporary','needs_part','cant_fix'));
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS report_at timestamptz;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS report_by uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('leave','sick','off')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  note text CHECK (note IS NULL OR length(note) <= 200),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on AND ends_on - starts_on <= 366)
);
CREATE INDEX IF NOT EXISTS time_off_lookup ON time_off(workspace_id, user_id, starts_on, ends_on);
ALTER TABLE time_off ENABLE ROW LEVEL SECURITY; ALTER TABLE time_off FORCE ROW LEVEL SECURITY;
-- Office (admin and supervisor) manages everyone's time off; a technician reads his own.
CREATE POLICY time_off_staff ON time_off USING (is_staff(workspace_id)) WITH CHECK (is_staff(workspace_id));
CREATE POLICY time_off_own_read ON time_off FOR SELECT USING (user_id = app_user_id() AND is_member(workspace_id));
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON time_off TO %I USING(true) WITH CHECK(true)', current_user); END $$;
-- Two extra demo technicians (Bilal, Anil) with no sign in. They only exist inside demo sandboxes.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_demo_persona_check;
ALTER TABLE users ADD CONSTRAINT users_demo_persona_check CHECK(demo_persona IN ('imran','sam','ravi','pranav','omar','bilal','anil'));
-- A technician may also write the job report on his own job (status and report only, and the report is signed as him).
CREATE OR REPLACE FUNCTION guard_technician_update() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.my_role(OLD.workspace_id)='technician' THEN
  IF (to_jsonb(NEW)-'status'-'updated_at'-'report_problem'-'report_work'-'report_outcome'-'report_at'-'report_by')<>(to_jsonb(OLD)-'status'-'updated_at'-'report_problem'-'report_work'-'report_outcome'-'report_at'-'report_by') THEN RAISE EXCEPTION 'Technicians can only change the status of their own jobs' USING ERRCODE='P0403'; END IF;
  IF NEW.report_by IS DISTINCT FROM OLD.report_by AND NEW.report_by IS DISTINCT FROM public.app_user_id() THEN RAISE EXCEPTION 'Technicians sign only their own report' USING ERRCODE='P0403'; END IF;
  IF NEW.status='cancelled' THEN RAISE EXCEPTION 'Ask a supervisor to cancel a job' USING ERRCODE='P0403'; END IF;
 END IF;
 RETURN NEW;
END $$;
