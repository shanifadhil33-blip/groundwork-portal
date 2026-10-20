-- LEARN12: a high impact lesson from someone who is not an admin waits for an admin or owner yes. Additive. Rollback: db/rollbacks/rollback-0068.sql
CREATE TABLE lesson_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 proposed_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 proposed_by_name text,
 body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 300),
 scope text NOT NULL CHECK (scope IN ('company','personal')),
 reason text NOT NULL CHECK (reason IN ('company','money','safety','clients')),
 status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','approved','declined')),
 decided_by uuid REFERENCES users(id),
 decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX lesson_proposals_waiting ON lesson_proposals(workspace_id, proposed_by, body) WHERE status = 'waiting';
ALTER TABLE lesson_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_proposals FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON lesson_proposals TO %I USING(true) WITH CHECK(true)', current_user); END $$;
-- The proposer sees his own; admins (owner included) see the company's. Nobody else, and never another company's.
CREATE POLICY lesson_read ON lesson_proposals FOR SELECT USING (is_member(workspace_id) AND (proposed_by = app_user_id() OR my_role(workspace_id) = 'admin'));
CREATE POLICY lesson_propose ON lesson_proposals FOR INSERT WITH CHECK (is_member(workspace_id) AND proposed_by = app_user_id() AND status = 'waiting' AND decided_by IS NULL);
REVOKE ALL ON lesson_proposals FROM PUBLIC;
CREATE TRIGGER audit_lesson_proposals AFTER INSERT OR UPDATE OR DELETE ON lesson_proposals FOR EACH ROW EXECUTE FUNCTION capture_audit();
-- Only an admin of the same company decides. Yes writes the lesson where the agent already reads it.
CREATE OR REPLACE FUNCTION decide_lesson(p_id uuid, p_yes boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE p lesson_proposals;
BEGIN
 SELECT * INTO p FROM lesson_proposals WHERE id = p_id FOR UPDATE;
 IF p.id IS NULL OR NOT is_member(p.workspace_id) THEN RETURN 'missing'; END IF;
 IF my_role(p.workspace_id) <> 'admin' THEN RETURN 'forbidden'; END IF;
 IF p.status <> 'waiting' THEN RETURN p.status; END IF;
 UPDATE lesson_proposals SET status = CASE WHEN p_yes THEN 'approved' ELSE 'declined' END, decided_by = app_user_id(), decided_at = clock_timestamp() WHERE id = p_id;
 IF p_yes AND p.scope = 'company' THEN
  INSERT INTO company_rules(workspace_id, created_by, body) SELECT p.workspace_id, app_user_id(), p.body WHERE NOT EXISTS (SELECT 1 FROM company_rules WHERE workspace_id = p.workspace_id AND body = p.body);
 ELSIF p_yes THEN
  INSERT INTO personal_agent_learning(workspace_id, user_id, body) SELECT p.workspace_id, p.proposed_by, p.body WHERE NOT EXISTS (SELECT 1 FROM personal_agent_learning WHERE workspace_id = p.workspace_id AND user_id = p.proposed_by AND body = p.body);
 END IF;
 RETURN CASE WHEN p_yes THEN 'approved' ELSE 'declined' END;
END $$;
REVOKE ALL ON FUNCTION decide_lesson(uuid, boolean) FROM PUBLIC;
