-- Before and after photos on jobs, stored in Postgres ($0, no extra service). Additive only.
CREATE TABLE IF NOT EXISTS job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id uuid NOT NULL,
  work_order_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('before','after')),
  mime text NOT NULL CHECK (mime IN ('image/jpeg','image/webp')),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 100 AND 614400),
  width int NOT NULL CHECK (width BETWEEN 1 AND 4000),
  height int NOT NULL CHECK (height BETWEEN 1 AND 4000),
  taken_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, client_id, work_order_id) REFERENCES work_orders(workspace_id, client_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS job_photos_order ON job_photos(workspace_id, work_order_id, kind, created_at);
ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY; ALTER TABLE job_photos FORCE ROW LEVEL SECURITY;
-- Office sees all; a technician sees his own jobs; a client sees photos of his company's jobs.
CREATE POLICY job_photos_read ON job_photos FOR SELECT USING (is_staff(workspace_id) OR (my_role(workspace_id)='client' AND client_id=my_client(workspace_id)) OR my_job(workspace_id, work_order_id));
-- Only the office or the assigned technician add photos, always as themselves.
CREATE POLICY job_photos_insert ON job_photos FOR INSERT WITH CHECK ((is_staff(workspace_id) OR my_job(workspace_id, work_order_id)) AND taken_by = app_user_id());
-- The office may remove any photo; a technician only his own.
CREATE POLICY job_photos_delete ON job_photos FOR DELETE USING (is_staff(workspace_id) OR (my_job(workspace_id, work_order_id) AND taken_by = app_user_id()));
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON job_photos TO %I USING(true) WITH CHECK(true)', current_user); END $$;
