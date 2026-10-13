-- Approval mode for the agent (ask before important actions, or before every action) and the company's own role names.
-- Additive only. Rollback: /workspace/qa/neon-runner/rollback-0026.sql
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS approval_mode text NOT NULL DEFAULT 'important' CHECK (approval_mode IN ('important','every'));
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS role_names jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(role_names)='object');
