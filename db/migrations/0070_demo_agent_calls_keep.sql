-- DEMO17: the all demos AI cap survives sandbox resets. A reset deleted the workspace and its counted calls with it,
-- so every new sandbox started the shared count again. Calls now stay (workspace set to null) and a daily total is added in code.
-- Rollback: db/rollbacks/rollback-0070.sql
ALTER TABLE demo_agent_calls ALTER COLUMN workspace_id DROP NOT NULL;
ALTER TABLE demo_agent_calls DROP CONSTRAINT IF EXISTS demo_agent_calls_workspace_id_fkey;
ALTER TABLE demo_agent_calls ADD CONSTRAINT demo_agent_calls_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
