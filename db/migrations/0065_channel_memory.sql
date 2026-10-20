-- WA02, SIGN10, LEARN05, SEC06. Additive. Rollback: db/rollbacks/rollback-0065.sql
ALTER TABLE user_preferences
 ADD COLUMN IF NOT EXISTS usual_start time,
 ADD COLUMN IF NOT EXISTS usual_areas text[] NOT NULL DEFAULT '{}';
ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS usual_areas_size;
ALTER TABLE user_preferences ADD CONSTRAINT usual_areas_size CHECK (cardinality(usual_areas) <= 8);

CREATE TABLE phone_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 phone_lookup text NOT NULL,
 phone_sealed text NOT NULL,
 code_hash text NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
 expires_at timestamptz NOT NULL,
 confirmed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX phone_changes_open ON phone_changes(user_id, created_at DESC) WHERE confirmed_at IS NULL;
ALTER TABLE phone_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_changes FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON phone_changes TO %I USING(true) WITH CHECK(true)', current_user); END $$;
REVOKE ALL ON phone_changes FROM PUBLIC;

CREATE TABLE whatsapp_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 user_id uuid,
 phone_sealed text NOT NULL,
 body_sealed text,
 voice_sealed text,
 direction text NOT NULL CHECK (direction IN ('in','out')),
 kind text NOT NULL CHECK (kind IN ('text','voice','button','review','code')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX whatsapp_messages_order ON whatsapp_messages(workspace_id, created_at DESC);
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON whatsapp_messages TO %I USING(true) WITH CHECK(true)', current_user); END $$;
CREATE POLICY whatsapp_read ON whatsapp_messages FOR SELECT USING (
 is_member(workspace_id) AND (
  user_id = app_user_id()
  OR (my_role(workspace_id) IN ('admin','staff') AND my_staff_kind(workspace_id) IS DISTINCT FROM 'office')
 )
);
REVOKE ALL ON whatsapp_messages FROM PUBLIC;
CREATE TRIGGER audit_whatsapp_messages AFTER INSERT OR UPDATE OR DELETE ON whatsapp_messages FOR EACH ROW EXECUTE FUNCTION capture_audit();
