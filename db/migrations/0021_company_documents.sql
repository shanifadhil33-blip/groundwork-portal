-- Company documents (trade licence, insurance, permits and similar) with expiry dates. Stored in Postgres like photos. Additive only.
-- Rollback: /workspace/qa/neon-runner/rollback-0021.sql
CREATE TABLE IF NOT EXISTS company_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('trade_licence','insurance','permit','certificate','contract','other')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  issued_on date,
  expires_on date,
  responsible_id uuid REFERENCES users(id) ON DELETE SET NULL,
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  mime text NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png','image/webp')),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 100 AND 1048576),
  added_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (issued_on IS NULL OR expires_on IS NULL OR expires_on >= issued_on)
);
CREATE INDEX IF NOT EXISTS company_documents_expiry ON company_documents(workspace_id, expires_on);
ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY; ALTER TABLE company_documents FORCE ROW LEVEL SECURITY;
-- Admins and supervisors only. Technicians and clients never see company documents.
CREATE POLICY company_documents_staff ON company_documents USING (is_staff(workspace_id)) WITH CHECK (is_staff(workspace_id));
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON company_documents TO %I USING(true) WITH CHECK(true)', current_user); END $$;
