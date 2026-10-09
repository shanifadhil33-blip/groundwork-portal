CREATE TABLE user_preferences (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 theme text NOT NULL DEFAULT 'system' CHECK(theme IN ('light','dark','system')),
 email_notifications boolean NOT NULL DEFAULT true,
 timezone text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY own_preferences ON user_preferences USING(user_id=app_user_id()) WITH CHECK(user_id=app_user_id());
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON user_preferences TO %I USING(true) WITH CHECK(true)',current_user); END $$;
CREATE POLICY users_self_read ON users FOR SELECT USING(id=app_user_id());
CREATE POLICY users_self_update ON users FOR UPDATE USING(id=app_user_id()) WITH CHECK(id=app_user_id());
ALTER TABLE notifications ADD COLUMN entity text NOT NULL DEFAULT 'work_orders';
CREATE INDEX notifications_unread ON notifications(user_id,workspace_id) WHERE read_at IS NULL;
