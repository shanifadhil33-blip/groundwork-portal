-- Personal actions and preferences remain. Older code can use its existing key approval rows.
DROP POLICY IF EXISTS agent_actions_private ON assistant_actions;
DROP TABLE IF EXISTS company_action_approvals,company_rules,personal_agent_learning;
