-- Client side roles (ROLE09): facility manager (default), client office staff, household. Additive.
-- A household sees only the requests he raised: restrictive policies on jobs and everything hanging off a job.
-- The owner connection is left alone. Rollback: /workspace/qa/neon-runner/rollback-0029.sql
ALTER TABLE members ADD COLUMN IF NOT EXISTS client_kind text CHECK (client_kind IS NULL OR client_kind IN ('manager','office','household'));
CREATE OR REPLACE FUNCTION my_client_kind(ws uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT coalesce(client_kind,'manager') FROM public.members WHERE workspace_id=ws AND user_id=public.app_user_id() AND role='client' AND archived_at IS NULL $$;
DO $$
DECLARE owner text := current_user;
BEGIN
 EXECUTE format($p$CREATE POLICY household_own ON work_orders AS RESTRICTIVE USING (current_user=%L OR my_client_kind(workspace_id) IS DISTINCT FROM 'household' OR created_by=app_user_id()) WITH CHECK (current_user=%L OR my_client_kind(workspace_id) IS DISTINCT FROM 'household' OR created_by=app_user_id())$p$,owner,owner);
 EXECUTE format($p$CREATE POLICY household_own ON comments AS RESTRICTIVE USING (current_user=%L OR my_client_kind(workspace_id) IS DISTINCT FROM 'household' OR EXISTS(SELECT 1 FROM work_orders w WHERE w.workspace_id=comments.workspace_id AND w.id=comments.work_order_id AND w.created_by=app_user_id()))$p$,owner);
 EXECUTE format($p$CREATE POLICY household_own ON work_order_events AS RESTRICTIVE USING (current_user=%L OR my_client_kind(workspace_id) IS DISTINCT FROM 'household' OR EXISTS(SELECT 1 FROM work_orders w WHERE w.workspace_id=work_order_events.workspace_id AND w.id=work_order_events.work_order_id AND w.created_by=app_user_id()))$p$,owner);
 EXECUTE format($p$CREATE POLICY household_own ON job_photos AS RESTRICTIVE USING (current_user=%L OR my_client_kind(workspace_id) IS DISTINCT FROM 'household' OR EXISTS(SELECT 1 FROM work_orders w WHERE w.workspace_id=job_photos.workspace_id AND w.id=job_photos.work_order_id AND w.created_by=app_user_id()))$p$,owner);
END $$;
