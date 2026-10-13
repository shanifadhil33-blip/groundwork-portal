CREATE TABLE contact_nicknames (
 owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 nickname text NOT NULL CHECK(length(nickname) BETWEEN 1 AND 60 AND length(trim(nickname))>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_user_id,target_user_id)
);
ALTER TABLE contact_nicknames ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_nicknames FORCE ROW LEVEL SECURITY;
CREATE FUNCTION contact_people(ws uuid) RETURNS TABLE(user_id uuid,real_name text,role text,staff_kind text,client_kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT m.user_id,coalesce(u.name,'Team member'),m.role,m.staff_kind,m.client_kind
 FROM public.members m JOIN public.users u ON u.id=m.user_id
 WHERE m.workspace_id=ws AND public.is_member(ws) AND (
 public.can_message_person(ws,m.user_id) OR public.my_role(ws) IN ('admin','staff'))
$$;
REVOKE ALL ON FUNCTION contact_people(uuid) FROM PUBLIC;
CREATE POLICY contact_names_own ON contact_nicknames USING(owner_user_id=app_user_id())
 WITH CHECK(owner_user_id=app_user_id() AND is_member(workspace_id) AND EXISTS(SELECT 1 FROM contact_people(workspace_id) p WHERE p.user_id=target_user_id));
