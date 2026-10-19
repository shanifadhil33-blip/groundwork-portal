-- SIGN11: preserve the client kind through either invite acceptance path.
ALTER TABLE invites ADD COLUMN IF NOT EXISTS client_kind text NOT NULL DEFAULT 'manager' CHECK (client_kind IN ('manager','office','household'));
CREATE OR REPLACE FUNCTION accept_invite_real(p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i public.invites; mail text;
BEGIN
 SELECT email INTO mail FROM public.users WHERE id=public.app_user_id();
 IF mail IS NULL THEN RETURN jsonb_build_object('error','unauthenticated'); END IF;
 SELECT * INTO i FROM public.invites WHERE token_hash=p_hash;
 IF NOT FOUND OR lower(i.email)<>lower(mail) THEN RETURN jsonb_build_object('error','not_found'); END IF;
 PERFORM 1 FROM public.workspaces WHERE id=i.workspace_id FOR UPDATE;
 SELECT * INTO i FROM public.invites WHERE token_hash=p_hash FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
 IF i.status='accepted' AND i.accepted_by=public.app_user_id() THEN RETURN jsonb_build_object('workspace_id',i.workspace_id,'status','accepted'); END IF;
 IF i.status='pending' AND i.expires_at<=now() THEN
 UPDATE public.invites SET status='expired' WHERE id=i.id;
 RETURN jsonb_build_object('error','expired');
 END IF;
 IF i.status<>'pending' THEN RETURN jsonb_build_object('error',i.status); END IF;
 IF EXISTS(SELECT 1 FROM public.members WHERE workspace_id=i.workspace_id AND user_id=public.app_user_id()) THEN RETURN jsonb_build_object('error','member_exists'); END IF;
 INSERT INTO public.members(workspace_id,user_id,role,client_id,client_kind) VALUES(i.workspace_id,public.app_user_id(),i.role,i.client_id,CASE WHEN i.role='client' THEN coalesce(i.client_kind,'manager') ELSE NULL END);
 UPDATE public.invites SET status='accepted',accepted_by=public.app_user_id() WHERE id=i.id;
 RETURN jsonb_build_object('workspace_id',i.workspace_id,'status','accepted');
END $$;
CREATE OR REPLACE FUNCTION onboarding_accept_invite(p_hash text,allow_different_email boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
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
 INSERT INTO public.members(workspace_id,user_id,role,client_id,client_kind) VALUES(i.workspace_id,public.app_user_id(),i.role,i.client_id,CASE WHEN i.role='client' THEN coalesce(i.client_kind,'manager') ELSE NULL END) ON CONFLICT(workspace_id,user_id) DO NOTHING;
 UPDATE public.invites SET status='accepted',accepted_by=public.app_user_id() WHERE id=i.id;
 RETURN jsonb_build_object('workspace_id',i.workspace_id);
END $$;
