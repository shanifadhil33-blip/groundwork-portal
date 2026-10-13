-- Leave requests (TEAM06) and office staff on the maintenance side (ROLE11). Additive only.
-- Existing time off rows stay approved. A technician asks; an admin or supervisor approves or declines.
-- Office staff are stored as role staff with staff_kind office: they run jobs, not the team.
-- Rollback: /workspace/qa/neon-runner/rollback-0030.sql
ALTER TABLE time_off ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','declined'));
ALTER TABLE time_off ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE time_off ADD COLUMN IF NOT EXISTS decided_at timestamptz;
ALTER TABLE members ADD COLUMN IF NOT EXISTS staff_kind text CHECK (staff_kind IS NULL OR staff_kind IN ('office'));
CREATE OR REPLACE FUNCTION my_staff_kind(ws uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT staff_kind FROM public.members WHERE workspace_id=ws AND user_id=public.app_user_id() AND role='staff' AND archived_at IS NULL $$;
