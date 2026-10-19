CREATE TABLE agent_words (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 user_id uuid,
 phrase text NOT NULL CHECK(length(trim(phrase)) BETWEEN 1 AND 60),
 means_kind text NOT NULL CHECK(means_kind IN ('site','asset','other')),
 means_id uuid,
 means_text text NOT NULL CHECK(length(trim(means_text)) BETWEEN 1 AND 200),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,user_id) REFERENCES members(workspace_id,user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX agent_words_phrase ON agent_words(workspace_id,coalesce(user_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(phrase));
ALTER TABLE agent_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_words FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON agent_words TO %I USING(true) WITH CHECK(true)',current_user); END $$;
CREATE POLICY words_personal_read ON agent_words FOR SELECT USING(user_id=app_user_id() AND is_member(workspace_id));
CREATE POLICY words_personal_add ON agent_words FOR INSERT WITH CHECK(user_id=app_user_id() AND is_member(workspace_id) AND created_by=app_user_id());
CREATE POLICY words_personal_change ON agent_words FOR UPDATE USING(user_id=app_user_id() AND is_member(workspace_id)) WITH CHECK(user_id=app_user_id() AND is_member(workspace_id) AND created_by=app_user_id());
CREATE POLICY words_personal_remove ON agent_words FOR DELETE USING(user_id=app_user_id() AND is_member(workspace_id));
CREATE POLICY words_company_read ON agent_words FOR SELECT USING(user_id IS NULL AND my_role(workspace_id) IN ('admin','staff','technician'));
CREATE POLICY words_company_add ON agent_words FOR INSERT WITH CHECK(user_id IS NULL AND my_role(workspace_id)='admin' AND created_by=app_user_id());
CREATE POLICY words_company_change ON agent_words FOR UPDATE USING(user_id IS NULL AND my_role(workspace_id)='admin') WITH CHECK(user_id IS NULL AND my_role(workspace_id)='admin' AND created_by=app_user_id());
CREATE POLICY words_company_remove ON agent_words FOR DELETE USING(user_id IS NULL AND my_role(workspace_id)='admin');
REVOKE ALL ON agent_words FROM PUBLIC;
