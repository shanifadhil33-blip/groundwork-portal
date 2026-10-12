-- Sign in by link or 6 digit code for field staff (no email, no SMS, $0). Additive only.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text CHECK (phone IS NULL OR length(phone) <= 30);
CREATE TABLE IF NOT EXISTS login_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_links_code ON login_links(code_hash) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS login_links_user ON login_links(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS login_attempts (ip_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS login_attempts_ip ON login_attempts(ip_hash, created_at DESC);
-- Only system code (owner) touches these; the app role gets nothing.
ALTER TABLE login_links ENABLE ROW LEVEL SECURITY; ALTER TABLE login_links FORCE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY; ALTER TABLE login_attempts FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  EXECUTE format('CREATE POLICY system_owner ON login_links TO %I USING(true) WITH CHECK(true)', current_user);
  EXECUTE format('CREATE POLICY system_owner ON login_attempts TO %I USING(true) WITH CHECK(true)', current_user);
END $$;
