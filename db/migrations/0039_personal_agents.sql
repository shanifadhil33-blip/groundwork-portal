-- Personal learning never becomes shared company history.
CREATE TABLE personal_agent_learning (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE company_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000),created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now()
);
-- Shared approvals contain proposed company actions, not another person's Agent history.
CREATE TABLE company_action_approvals (
 id uuid PRIMARY KEY REFERENCES assistant_actions(id) ON DELETE CASCADE,workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 requested_by uuid NOT NULL REFERENCES users(id),tool text NOT NULL,args jsonb NOT NULL,summary text,
 token_id uuid REFERENCES api_tokens(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 consumed_at timestamptz,declined_at timestamptz,decided_by uuid REFERENCES users(id),outcome text CHECK(outcome IN ('done','failed'))
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['personal_agent_learning','company_rules','company_action_approvals'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY system_owner ON %I TO %I USING(true) WITH CHECK(true)',t,current_user);
 END LOOP; END $$;
CREATE POLICY personal_learning_owner ON personal_agent_learning USING(user_id=app_user_id() AND is_member(workspace_id)) WITH CHECK(user_id=app_user_id() AND is_member(workspace_id));
CREATE POLICY company_rules_read ON company_rules FOR SELECT USING(my_role(workspace_id) IN ('admin','staff','technician'));
CREATE POLICY company_rules_admin ON company_rules FOR INSERT WITH CHECK(my_role(workspace_id)='admin' AND created_by=app_user_id());
CREATE POLICY company_rules_change ON company_rules FOR UPDATE USING(my_role(workspace_id)='admin') WITH CHECK(my_role(workspace_id)='admin');
CREATE POLICY company_rules_remove ON company_rules FOR DELETE USING(my_role(workspace_id)='admin');
CREATE POLICY company_approvals_admin ON company_action_approvals FOR SELECT USING(my_role(workspace_id)='admin');
-- Restrictive protection keeps future role policies from exposing personal Agent actions.
DO $$ BEGIN EXECUTE format('CREATE POLICY agent_actions_private ON assistant_actions AS RESTRICTIVE USING(current_user=%L OR (user_id=app_user_id() AND is_member(workspace_id))) WITH CHECK(current_user=%L OR (user_id=app_user_id() AND is_member(workspace_id)))',current_user,current_user); END $$;
INSERT INTO company_action_approvals(id,workspace_id,requested_by,tool,args,summary,token_id,created_at,expires_at,consumed_at,declined_at,decided_by,outcome)
 SELECT id,workspace_id,user_id,tool,args,CASE WHEN tool IN ('send_message','send_team_message') THEN 'Send a private message' ELSE summary END,token_id,created_at,expires_at,consumed_at,declined_at,decided_by,outcome FROM assistant_actions WHERE source='key';
REVOKE ALL ON personal_agent_learning,company_rules,company_action_approvals FROM PUBLIC;
