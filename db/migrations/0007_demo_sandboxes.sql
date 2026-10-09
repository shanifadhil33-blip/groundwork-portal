ALTER TABLE users ADD COLUMN is_demo boolean NOT NULL DEFAULT false, ADD COLUMN demo_workspace_id uuid, ADD COLUMN demo_persona text CHECK(demo_persona IN ('dana','sam','priya','omar'));
ALTER TABLE users ADD CHECK (is_demo = (demo_workspace_id IS NOT NULL)), ADD CHECK(is_demo = (demo_persona IS NOT NULL)), ADD UNIQUE(demo_workspace_id,demo_persona);
-- Old development fixtures were labelled demo before sandbox accounts existed.
UPDATE workspaces SET is_demo=false WHERE demo_expires_at IS NULL;
CREATE INDEX demo_expiry ON workspaces(demo_expires_at) WHERE is_demo;
CREATE TABLE demo_creation_attempts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ip_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX demo_creation_ip_time ON demo_creation_attempts(ip_hash,created_at);
ALTER TABLE demo_creation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_creation_attempts FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON demo_creation_attempts TO %I USING(true) WITH CHECK(true)',current_user); END $$;
CREATE FUNCTION guard_demo_membership() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u public.users; w public.workspaces;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=NEW.user_id;
 SELECT * INTO w FROM public.workspaces WHERE id=NEW.workspace_id FOR UPDATE;
 IF u.is_demo IS DISTINCT FROM w.is_demo OR (u.is_demo AND u.demo_workspace_id IS DISTINCT FROM w.id) THEN RAISE EXCEPTION 'membership unavailable' USING ERRCODE='P0404'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER demo_membership BEFORE INSERT OR UPDATE ON members FOR EACH ROW EXECUTE FUNCTION guard_demo_membership();
CREATE FUNCTION guard_demo_account() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN IF EXISTS(SELECT 1 FROM public.users WHERE id=NEW."userId" AND is_demo) THEN RAISE EXCEPTION 'account unavailable' USING ERRCODE='P0404'; END IF; RETURN NEW; END $$;
CREATE TRIGGER demo_account BEFORE INSERT OR UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION guard_demo_account();
CREATE FUNCTION require_real_user() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN IF EXISTS(SELECT 1 FROM public.users WHERE id=public.app_user_id() AND is_demo) THEN RAISE EXCEPTION 'demo action forbidden' USING ERRCODE='P0403'; END IF; END $$;
ALTER FUNCTION create_workspace(text,text) RENAME TO create_workspace_real;
CREATE FUNCTION create_workspace(p_name text,p_timezone text) RETURNS public.workspaces LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN PERFORM public.require_real_user(); RETURN public.create_workspace_real(p_name,p_timezone); END $$;
ALTER FUNCTION accept_invite(text) RENAME TO accept_invite_real;
CREATE FUNCTION accept_invite(p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN PERFORM public.require_real_user(); RETURN public.accept_invite_real(p_hash); END $$;
-- Prevent app-role direct membership/invite mutations and workspace deletion,
-- including callers bypassing route services. Owner cleanup remains authorized.
CREATE FUNCTION guard_demo_management() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.require_real_user(); IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER demo_members_management BEFORE INSERT OR UPDATE OR DELETE ON members FOR EACH ROW EXECUTE FUNCTION guard_demo_management();
CREATE TRIGGER demo_invites_management BEFORE INSERT OR UPDATE OR DELETE ON invites FOR EACH ROW EXECUTE FUNCTION guard_demo_management();
CREATE TRIGGER demo_workspace_delete BEFORE DELETE ON workspaces FOR EACH ROW EXECUTE FUNCTION guard_demo_management();
CREATE FUNCTION guard_demo_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN IF NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN RAISE EXCEPTION 'identity cannot change' USING ERRCODE='P0404'; END IF; RETURN NEW; END $$;
CREATE TRIGGER demo_user_identity BEFORE UPDATE OF is_demo ON users FOR EACH ROW EXECUTE FUNCTION guard_demo_identity();
CREATE TRIGGER demo_workspace_identity BEFORE UPDATE OF is_demo ON workspaces FOR EACH ROW EXECUTE FUNCTION guard_demo_identity();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
CREATE OR REPLACE FUNCTION guard_demo_management() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.users'::regclass) THEN PERFORM public.require_real_user(); END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
ALTER FUNCTION delete_workspace(uuid) RENAME TO delete_workspace_data;
CREATE FUNCTION delete_workspace(ws uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN PERFORM public.require_real_user(); PERFORM public.delete_workspace_data(ws); END $$;
ALTER FUNCTION remove_member(uuid,uuid) RENAME TO remove_member_real;
CREATE FUNCTION remove_member(ws uuid,uid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN PERFORM public.require_real_user(); PERFORM public.remove_member_real(ws,uid); END $$;
-- Owner-only lifecycle helper reuses the existing ordered deletion implementation.
CREATE FUNCTION delete_demo_workspace(ws uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid; n integer;
BEGIN
 PERFORM 1 FROM public.workspaces WHERE id=ws AND is_demo FOR UPDATE;
 IF NOT FOUND THEN RETURN 0; END IF;
 SELECT user_id INTO actor FROM public.members WHERE workspace_id=ws AND role='admin' LIMIT 1;
 PERFORM set_config('app.user_id',actor::text,true);
 PERFORM public.delete_workspace_data(ws);
 DELETE FROM public.audit_log WHERE workspace_id=ws;
 DELETE FROM public.idempotency_keys WHERE user_id IN (SELECT id FROM public.users WHERE demo_workspace_id=ws);
 DELETE FROM public.users WHERE demo_workspace_id=ws AND is_demo;
 GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM set_config('app.user_id','',true);
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION delete_demo_workspace(uuid),delete_workspace_data(uuid),remove_member_real(uuid,uuid),create_workspace_real(text,text),accept_invite_real(text) FROM PUBLIC;
CREATE FUNCTION cap_demo_session() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE deadline timestamptz;
BEGIN
 SELECT w.demo_expires_at INTO deadline FROM public.users u JOIN public.workspaces w ON w.id=u.demo_workspace_id WHERE u.id=NEW."userId" AND u.is_demo;
 IF FOUND THEN NEW.expires=least(NEW.expires,deadline); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER demo_session_expiry BEFORE INSERT OR UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION cap_demo_session();
REVOKE ALL ON FUNCTION cap_demo_session() FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

CREATE FUNCTION guard_demo_invite_target() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF lower(NEW.email) LIKE '%@demo.groundwork.invalid'
 OR EXISTS(SELECT 1 FROM public.users WHERE lower(email)=lower(NEW.email) AND is_demo)
 OR EXISTS(SELECT 1 FROM public.workspaces WHERE id=NEW.workspace_id AND is_demo)
 THEN RAISE EXCEPTION 'invite unavailable' USING ERRCODE='P0404'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER demo_invite_target BEFORE INSERT OR UPDATE ON invites FOR EACH ROW EXECUTE FUNCTION guard_demo_invite_target();
REVOKE ALL ON FUNCTION guard_demo_invite_target() FROM PUBLIC;
