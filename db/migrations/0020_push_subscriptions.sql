-- Web push: one row per device a person turned notifications on for. Free (VAPID), no paid service. Additive only.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (endpoint LIKE 'https://%' AND length(endpoint) <= 1000),
  p256dh text NOT NULL CHECK (length(p256dh) BETWEEN 20 AND 200),
  auth text NOT NULL CHECK (length(auth) BETWEEN 8 AND 100),
  device text CHECK (device IS NULL OR length(device) <= 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions(user_id);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY; ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
-- A person sees and changes only his own devices.
CREATE POLICY push_own ON push_subscriptions USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON push_subscriptions TO %I USING(true) WITH CHECK(true)', current_user); END $$;
