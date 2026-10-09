CREATE TABLE api_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 token_prefix text NOT NULL, token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 scope text NOT NULL CHECK(scope IN ('read','write')), created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz, last_used_at timestamptz, revoked_at timestamptz
);
CREATE TABLE assistant_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, tool text NOT NULL, args jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes', consumed_at timestamptz
);
ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE assistant_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY token_read ON api_tokens FOR SELECT USING(is_member(workspace_id) AND (user_id=app_user_id() OR my_role(workspace_id)='admin'));
CREATE POLICY token_create ON api_tokens FOR INSERT WITH CHECK(user_id=app_user_id() AND is_member(workspace_id));
CREATE POLICY token_revoke ON api_tokens FOR UPDATE USING(is_member(workspace_id) AND (user_id=app_user_id() OR my_role(workspace_id)='admin')) WITH CHECK(is_member(workspace_id) AND (user_id=app_user_id() OR my_role(workspace_id)='admin'));
CREATE POLICY own_actions ON assistant_actions USING(user_id=app_user_id() AND is_member(workspace_id)) WITH CHECK(user_id=app_user_id() AND is_member(workspace_id));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['api_tokens','assistant_actions'] LOOP EXECUTE format('CREATE POLICY system_owner ON %I TO %I USING(true) WITH CHECK(true)',t,current_user); END LOOP; END $$;
CREATE FUNCTION cap_agent_token() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE deadline timestamptz;
BEGIN
 SELECT w.demo_expires_at INTO deadline FROM public.users u JOIN public.workspaces w ON w.id=u.demo_workspace_id WHERE u.id=NEW.user_id AND u.is_demo;
 IF FOUND THEN NEW.expires_at=least(coalesce(NEW.expires_at,now()+interval '24 hours'),now()+interval '24 hours',deadline); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER token_expiry BEFORE INSERT ON api_tokens FOR EACH ROW EXECUTE FUNCTION cap_agent_token();
-- Narrow capability lookup: hash only, current membership, no tenant business data.
CREATE FUNCTION verify_api_token(p_hash text) RETURNS TABLE(id uuid,user_id uuid,workspace_id uuid,scope text,name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.api_tokens; old_user text; old_kind text; old_token text;
BEGIN
 SELECT tok.* INTO t FROM public.api_tokens tok JOIN public.members m ON m.workspace_id=tok.workspace_id AND m.user_id=tok.user_id JOIN public.workspaces w ON w.id=tok.workspace_id
 WHERE tok.token_hash=p_hash AND tok.revoked_at IS NULL AND (tok.expires_at IS NULL OR tok.expires_at>now()) AND (NOT w.is_demo OR w.demo_expires_at>now());
 IF NOT FOUND THEN RETURN; END IF;
 IF t.last_used_at IS NULL OR t.last_used_at<now()-interval '5 minutes' THEN
  old_user=current_setting('app.user_id',true); old_kind=current_setting('app.actor_kind',true); old_token=current_setting('app.via_token',true);
  PERFORM set_config('app.user_id',t.user_id::text,true),set_config('app.actor_kind','agent',true),set_config('app.via_token',t.id::text,true);
  UPDATE public.api_tokens tok SET last_used_at=now() WHERE tok.id=t.id AND (tok.last_used_at IS NULL OR tok.last_used_at<now()-interval '5 minutes');
  PERFORM set_config('app.user_id',coalesce(old_user,''),true),set_config('app.actor_kind',coalesce(old_kind,''),true),set_config('app.via_token',coalesce(old_token,''),true);
 END IF;
 RETURN QUERY SELECT t.id,t.user_id,t.workspace_id,t.scope,t.name;
END $$;
ALTER TABLE audit_log ADD COLUMN actor_kind text NOT NULL DEFAULT 'user' CHECK(actor_kind IN ('user','agent','assistant')), ADD COLUMN via_token_id uuid, ADD COLUMN via_token_name text;
CREATE OR REPLACE FUNCTION capture_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old_row jsonb; new_row jsonb; row_data jsonb; ws uuid; tid uuid; tname text;
BEGIN
 IF TG_OP <> 'INSERT' THEN old_row=to_jsonb(OLD); END IF;
 IF TG_OP <> 'DELETE' THEN new_row=to_jsonb(NEW); END IF;
 row_data=coalesce(new_row,old_row);
 ws=CASE WHEN TG_TABLE_NAME='workspaces' THEN (row_data->>'id')::uuid ELSE (row_data->>'workspace_id')::uuid END;
 tid=nullif(current_setting('app.via_token',true),'')::uuid;
 SELECT name INTO tname FROM public.api_tokens WHERE id=tid;
 IF TG_TABLE_NAME='api_tokens' THEN old_row=old_row-'token_hash'; new_row=new_row-'token_hash'; END IF;
 INSERT INTO public.audit_log(workspace_id,actor_id,action,entity,entity_id,"before","after",actor_kind,via_token_id,via_token_name)
 VALUES(ws,public.app_user_id(),lower(TG_OP),TG_TABLE_NAME,(row_data->>'id')::uuid,old_row,new_row,coalesce(nullif(current_setting('app.actor_kind',true),''),'user'),tid,tname);
 RETURN NULL;
END $$;
CREATE TRIGGER token_audit AFTER INSERT OR UPDATE OR DELETE ON api_tokens FOR EACH ROW EXECUTE FUNCTION capture_audit();
REVOKE ALL ON FUNCTION verify_api_token(text),cap_agent_token() FROM PUBLIC;
