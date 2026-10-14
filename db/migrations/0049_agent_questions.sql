-- TEAM09: anything the Agent is unsure about goes to a supervisor, who approves or fixes it in one tap. Additive only.
-- Rollback: /workspace/qa/neon-runner/rollback-0049.sql
CREATE TABLE IF NOT EXISTS agent_questions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 asked_by uuid NOT NULL REFERENCES users(id),
 work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL,
 question text NOT NULL CHECK (length(question) BETWEEN 3 AND 1000),
 proposed text NOT NULL DEFAULT '' CHECK (length(proposed) <= 1000),
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','fixed')),
 answer text CHECK (answer IS NULL OR length(answer) <= 1000),
 decided_by uuid REFERENCES users(id), decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_questions_open_idx ON agent_questions(workspace_id, created_at DESC) WHERE status='open';
ALTER TABLE agent_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_questions FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_questions_read ON agent_questions FOR SELECT USING (is_staff(workspace_id) OR asked_by=app_user_id());
CREATE POLICY agent_questions_insert ON agent_questions FOR INSERT WITH CHECK (asked_by=app_user_id() AND my_role(workspace_id) IN ('admin','staff','technician') AND status='open');
CREATE POLICY agent_questions_decide ON agent_questions FOR UPDATE USING (my_role(workspace_id) IN ('admin','staff') AND coalesce(my_staff_kind(workspace_id),'')<>'office') WITH CHECK (decided_by=app_user_id());
