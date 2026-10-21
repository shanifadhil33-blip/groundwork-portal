DELETE FROM demo_agent_calls WHERE workspace_id IS NULL;
ALTER TABLE demo_agent_calls DROP CONSTRAINT IF EXISTS demo_agent_calls_workspace_id_fkey;
ALTER TABLE demo_agent_calls ADD CONSTRAINT demo_agent_calls_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE demo_agent_calls ALTER COLUMN workspace_id SET NOT NULL;
