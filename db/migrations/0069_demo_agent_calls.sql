-- DEMO14: agent calls that reach the AI in demo sandboxes, so judges' load cannot spend the free quota. Additive. Rollback: db/rollbacks/rollback-0069.sql
CREATE TABLE demo_agent_calls (
 id bigserial PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX demo_agent_calls_ws_at ON demo_agent_calls(workspace_id, at);
CREATE INDEX demo_agent_calls_at ON demo_agent_calls(at);
ALTER TABLE demo_agent_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_agent_calls FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON demo_agent_calls TO %I USING(true) WITH CHECK(true)', current_user); END $$;
REVOKE ALL ON demo_agent_calls FROM PUBLIC;
