-- Former team members are archived, not removed: job history, counts and names stay. Additive columns.
-- An archived member can no longer use the workspace: my_role (behind every policy) skips archived rows.
-- Rollback: /workspace/qa/neon-runner/rollback-0028.sql
ALTER TABLE members ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE members ADD COLUMN IF NOT EXISTS archive_unassigned uuid[] NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION my_role(ws uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$ SELECT role FROM public.members WHERE workspace_id=ws AND user_id=public.app_user_id() AND archived_at IS NULL $$;
