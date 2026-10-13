CREATE TABLE onboarding_progress (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 step text NOT NULL DEFAULT 'language',answers jsonb NOT NULL DEFAULT '{}',
 completed_at timestamptz,started_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress FORCE ROW LEVEL SECURITY;
CREATE POLICY onboarding_own ON onboarding_progress USING(user_id=app_user_id()) WITH CHECK(user_id=app_user_id());
-- An invite is a secret capability. A different Google email needs an explicit choice before accepting.
CREATE FUNCTION onboarding_invite_info(p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i public.invites;mail text;
BEGIN
 PERFORM public.require_real_user();
 SELECT * INTO i FROM public.invites WHERE token_hash=p_hash;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found');END IF;
 IF i.status<>'pending' OR i.expires_at<=now() THEN RETURN jsonb_build_object('error','unavailable');END IF;
 SELECT email INTO mail FROM public.users WHERE id=public.app_user_id();
 RETURN jsonb_build_object('email',i.email,'mismatch',lower(i.email)<>lower(mail),'workspace_id',i.workspace_id);
END $$;
CREATE FUNCTION onboarding_accept_invite(p_hash text,allow_different_email boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i public.invites;mail text;
BEGIN
 PERFORM public.require_real_user();
 SELECT email INTO mail FROM public.users WHERE id=public.app_user_id();
 IF mail IS NULL THEN RETURN jsonb_build_object('error','unauthenticated'); END IF;
 SELECT * INTO i FROM public.invites WHERE token_hash=p_hash FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
 IF i.status='accepted' AND i.accepted_by=public.app_user_id() THEN RETURN jsonb_build_object('workspace_id',i.workspace_id);END IF;
 IF i.status<>'pending' OR i.expires_at<=now() THEN RETURN jsonb_build_object('error','unavailable'); END IF;
 IF lower(i.email)<>lower(mail) AND NOT allow_different_email THEN RETURN jsonb_build_object('error','email_mismatch','email',i.email);END IF;
 INSERT INTO public.members(workspace_id,user_id,role,client_id) VALUES(i.workspace_id,public.app_user_id(),i.role,i.client_id) ON CONFLICT(workspace_id,user_id) DO NOTHING;
 UPDATE public.invites SET status='accepted',accepted_by=public.app_user_id() WHERE id=i.id;
 RETURN jsonb_build_object('workspace_id',i.workspace_id);
END $$;
-- Search reveals company names only. Joining always needs an invite from that company.
CREATE FUNCTION onboarding_find_company(search text) RETURNS TABLE(name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT name FROM public.workspaces WHERE NOT is_demo AND public.app_user_id() IS NOT NULL AND length(trim(search))>=3 AND name ILIKE '%'||search||'%' ORDER BY name LIMIT 10
$$;
REVOKE ALL ON FUNCTION onboarding_invite_info(text),onboarding_accept_invite(text,boolean),onboarding_find_company(text) FROM PUBLIC;
CREATE TABLE onboarding_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 answers jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',consumed_at timestamptz
);
ALTER TABLE onboarding_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY onboarding_actions_own ON onboarding_actions USING(user_id=app_user_id()) WITH CHECK(user_id=app_user_id());
