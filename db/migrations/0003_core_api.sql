ALTER TABLE invites ADD COLUMN accepted_by uuid REFERENCES users(id);
CREATE TABLE idempotency_keys (
 user_id uuid NOT NULL REFERENCES users(id), scope text NOT NULL, key text NOT NULL,
 fingerprint text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,scope,key)
);
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY own_keys ON idempotency_keys USING(user_id=app_user_id()) WITH CHECK(user_id=app_user_id());
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON idempotency_keys TO %I USING(true) WITH CHECK(true)',current_user); END $$;
CREATE POLICY self_member ON members FOR SELECT USING(user_id=app_user_id());
-- Identity fields only: auth tokens/accounts remain inaccessible to the app.
CREATE FUNCTION visible_user(uid uuid) RETURNS TABLE(id uuid,name text,email text,image text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT u.id,u.name,u.email,u.image FROM public.users u WHERE (u.id=public.app_user_id()
 OR EXISTS(SELECT 1 FROM public.members m JOIN public.members me ON me.workspace_id=m.workspace_id
 WHERE m.user_id=u.id AND me.user_id=public.app_user_id() AND me.role IN ('admin','staff'))
  ) AND u.id=uid
$$;
-- Narrow bootstrap: caller identity comes only from transaction context.
CREATE FUNCTION create_workspace(p_name text,p_timezone text) RETURNS public.workspaces
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE w public.workspaces;
BEGIN
 IF public.app_user_id() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=public.app_user_id()) THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='P0401'; END IF;
 INSERT INTO public.workspaces(name,timezone) VALUES(p_name,p_timezone) RETURNING * INTO w;
 INSERT INTO public.members(workspace_id,user_id,role) VALUES(w.id,public.app_user_id(),'admin');
 RETURN w;
END $$;
-- Token hash is the capability; nothing is accepted on sign-in.
CREATE FUNCTION accept_invite(p_hash text) RETURNS jsonb
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
 INSERT INTO public.members(workspace_id,user_id,role,client_id) VALUES(i.workspace_id,public.app_user_id(),i.role,i.client_id);
 UPDATE public.invites SET status='accepted',accepted_by=public.app_user_id() WHERE id=i.id;
 RETURN jsonb_build_object('workspace_id',i.workspace_id,'status','accepted');
END $$;
-- Keep deletion ordered and atomic; audit rows deliberately survive.
CREATE FUNCTION delete_workspace(ws uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.my_role(ws) IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'no access' USING ERRCODE='P0404'; END IF;
 DELETE FROM public.notifications WHERE workspace_id=ws;
 DELETE FROM public.supplier_events WHERE workspace_id=ws;
 DELETE FROM public.supplier_orders WHERE workspace_id=ws;
 DELETE FROM public.import_rows WHERE workspace_id=ws;
 DELETE FROM public.imports WHERE workspace_id=ws;
 DELETE FROM public.comments WHERE workspace_id=ws;
 DELETE FROM public.work_order_events WHERE workspace_id=ws;
 DELETE FROM public.work_orders WHERE workspace_id=ws;
 DELETE FROM public.invites WHERE workspace_id=ws;
 DELETE FROM public.members WHERE workspace_id=ws;
 DELETE FROM public.sites WHERE workspace_id=ws;
 DELETE FROM public.clients WHERE workspace_id=ws;
 DELETE FROM public.workspaces WHERE id=ws;
END $$;
-- Status notifications are produced in the same transaction as timeline/audit.
CREATE FUNCTION notify_status_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status THEN
 INSERT INTO public.notifications(user_id,workspace_id,kind,entity_id)
 SELECT DISTINCT m.user_id,NEW.workspace_id,'status_changed',NEW.id FROM public.members m
 WHERE m.workspace_id=NEW.workspace_id AND m.user_id IN (NEW.created_by,NEW.assignee_id)
 AND (m.role IN ('admin','staff') OR m.client_id=NEW.client_id);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER work_order_notifications AFTER UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION notify_status_change();
REVOKE ALL ON FUNCTION visible_user(uuid),create_workspace(text,text),accept_invite(text),delete_workspace(uuid),notify_status_change() FROM PUBLIC;

-- JS/JSON dates have millisecond precision. Versions are strictly increasing,
-- even for multiple writes in a millisecond or a long-lived transaction.
CREATE OR REPLACE FUNCTION touch_work_order() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public AS $$
BEGIN NEW.updated_at=greatest(date_trunc('milliseconds',clock_timestamp()),date_trunc('milliseconds',OLD.updated_at)+interval '1 millisecond'); RETURN NEW; END $$;
CREATE FUNCTION visible_assignee(ws uuid,wo uuid) RETURNS TABLE(id uuid,name text,image text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT u.id,u.name,u.image FROM public.work_orders w JOIN public.users u ON u.id=w.assignee_id
 WHERE w.workspace_id=ws AND w.id=wo AND (public.is_staff(ws) OR (public.my_role(ws)='client' AND w.client_id=public.my_client(ws)))
$$;
REVOKE ALL ON FUNCTION visible_assignee(uuid,uuid) FROM PUBLIC;
CREATE FUNCTION remove_member(ws uuid,uid uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target_role text;
BEGIN
 PERFORM 1 FROM public.workspaces WHERE id=ws FOR UPDATE;
 IF public.my_role(ws) IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'no access' USING ERRCODE='P0404'; END IF;
 SELECT role INTO target_role FROM public.members WHERE workspace_id=ws AND user_id=uid FOR UPDATE;
 IF target_role IS NULL THEN RAISE EXCEPTION 'no access' USING ERRCODE='P0404'; END IF;
 IF target_role='admin' AND (SELECT count(*) FROM public.members WHERE workspace_id=ws AND role='admin')<=1 THEN
 RAISE EXCEPTION 'last admin' USING ERRCODE='P0409';
 END IF;
 UPDATE public.work_orders SET assignee_id=NULL WHERE workspace_id=ws AND assignee_id=uid;
 DELETE FROM public.notifications WHERE workspace_id=ws AND user_id=uid;
 DELETE FROM public.members WHERE workspace_id=ws AND user_id=uid;
END $$;
REVOKE ALL ON FUNCTION remove_member(uuid,uuid) FROM PUBLIC;
