-- CMP09: the client rates a finished job before it is closed. Separate table, additive only.
-- Rollback: /workspace/qa/neon-runner/rollback-0044.sql
CREATE TABLE IF NOT EXISTS job_ratings (
 work_order_id uuid PRIMARY KEY REFERENCES work_orders(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 client_id uuid NOT NULL,
 rated_by uuid NOT NULL REFERENCES users(id),
 stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
 note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_ratings_ws_idx ON job_ratings(workspace_id, created_at DESC);
ALTER TABLE job_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_ratings FORCE ROW LEVEL SECURITY;
CREATE POLICY job_ratings_read ON job_ratings FOR SELECT USING (is_staff(workspace_id) OR (my_role(workspace_id)='client' AND client_id=my_client(workspace_id)));
-- Only a client of that job's company, once, on a done job.
CREATE POLICY job_ratings_insert ON job_ratings FOR INSERT WITH CHECK (
 my_role(workspace_id)='client' AND client_id=my_client(workspace_id) AND rated_by=app_user_id()
 AND EXISTS (SELECT 1 FROM work_orders w WHERE w.id=work_order_id AND w.workspace_id=job_ratings.workspace_id AND w.client_id=job_ratings.client_id AND w.status='done'));
