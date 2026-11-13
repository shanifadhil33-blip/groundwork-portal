-- Bug 106: the Agent's limits live in the database, so every server instance shares them.
-- One row per company per day and one row per person per minute. Owner access only (the app reads them through the system pool).
-- Rollback: db/rollbacks/rollback-0073.sql
CREATE TABLE agent_quota_day (
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 day date NOT NULL,
 calls integer NOT NULL DEFAULT 0,
 PRIMARY KEY (workspace_id, day)
);
CREATE TABLE agent_quota_minute (
 user_id uuid NOT NULL,
 minute timestamptz NOT NULL,
 calls integer NOT NULL DEFAULT 0,
 PRIMARY KEY (user_id, minute)
);
CREATE INDEX agent_quota_minute_old ON agent_quota_minute(minute);
ALTER TABLE agent_quota_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_quota_day FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_quota_minute ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_quota_minute FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
 EXECUTE format('CREATE POLICY system_owner ON agent_quota_day TO %I USING(true) WITH CHECK(true)',current_user);
 EXECUTE format('CREATE POLICY system_owner ON agent_quota_minute TO %I USING(true) WITH CHECK(true)',current_user);
END $$;
REVOKE ALL ON agent_quota_day FROM PUBLIC;
REVOKE ALL ON agent_quota_minute FROM PUBLIC;
