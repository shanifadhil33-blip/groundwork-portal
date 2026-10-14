-- CMP03: before a visit the household or facility manager ticks a short ready check. Additive only.
-- Rollback: /workspace/qa/neon-runner/rollback-0045.sql
CREATE TABLE IF NOT EXISTS job_prechecks (
 work_order_id uuid PRIMARY KEY REFERENCES work_orders(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 client_id uuid NOT NULL,
 answered_by uuid NOT NULL REFERENCES users(id),
 answers jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(answers)='object'),
 note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE job_prechecks ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_prechecks FORCE ROW LEVEL SECURITY;
CREATE POLICY job_prechecks_read ON job_prechecks FOR SELECT USING (is_staff(workspace_id) OR (my_role(workspace_id)='client' AND client_id=my_client(workspace_id))
 OR (my_role(workspace_id)='technician' AND EXISTS (SELECT 1 FROM work_orders w WHERE w.id=work_order_id AND w.assignee_id=app_user_id())));
CREATE POLICY job_prechecks_write ON job_prechecks FOR INSERT WITH CHECK (my_role(workspace_id)='client' AND client_id=my_client(workspace_id) AND answered_by=app_user_id()
 AND EXISTS (SELECT 1 FROM work_orders w WHERE w.id=work_order_id AND w.workspace_id=job_prechecks.workspace_id AND w.client_id=job_prechecks.client_id AND w.status IN ('open','scheduled')));
CREATE POLICY job_prechecks_update ON job_prechecks FOR UPDATE USING (my_role(workspace_id)='client' AND client_id=my_client(workspace_id))
 WITH CHECK (my_role(workspace_id)='client' AND client_id=my_client(workspace_id) AND answered_by=app_user_id());
