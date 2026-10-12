-- Supervisor and Technician roles (additive). 'staff' keeps its meaning and is shown as Supervisor.
-- New role 'technician': sees only work orders assigned to them (and those jobs' client, site, comments and history),
-- and can change only the status of their own jobs. Rollback: /workspace/qa/neon-runner/rollback-0016.sql
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_role_check;
ALTER TABLE members ADD CONSTRAINT members_role_check CHECK(role IN ('admin','staff','technician','client'));
ALTER TABLE invites DROP CONSTRAINT IF EXISTS invites_role_check;
ALTER TABLE invites ADD CONSTRAINT invites_role_check CHECK(role IN ('admin','staff','technician','client'));

-- True when the caller is a technician assigned to this work order.
CREATE FUNCTION my_job(ws uuid, wo uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT public.my_role(ws)='technician' AND EXISTS(SELECT 1 FROM public.work_orders w WHERE w.workspace_id=ws AND w.id=wo AND w.assignee_id=public.app_user_id())
$$;
-- True when the caller is a technician with any job for this client (or at this site).
CREATE FUNCTION my_job_client(ws uuid, cl uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT public.my_role(ws)='technician' AND EXISTS(SELECT 1 FROM public.work_orders w WHERE w.workspace_id=ws AND w.client_id=cl AND w.assignee_id=public.app_user_id())
$$;
CREATE FUNCTION my_job_site(ws uuid, st uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT public.my_role(ws)='technician' AND EXISTS(SELECT 1 FROM public.work_orders w WHERE w.workspace_id=ws AND w.site_id=st AND w.assignee_id=public.app_user_id())
$$;
REVOKE ALL ON FUNCTION my_job(uuid,uuid), my_job_client(uuid,uuid), my_job_site(uuid,uuid) FROM PUBLIC;
-- The app role gets EXECUTE in scripts/migrate.ts (with the other policy helpers).

ALTER POLICY work_orders_read ON work_orders USING ((is_staff(workspace_id) OR (my_role(workspace_id)='client' AND client_id=my_client(workspace_id)) OR (my_role(workspace_id)='technician' AND assignee_id=app_user_id())));
ALTER POLICY work_orders_update ON work_orders USING ((is_staff(workspace_id) OR (my_role(workspace_id)='technician' AND assignee_id=app_user_id()))) WITH CHECK ((is_staff(workspace_id) OR (my_role(workspace_id)='technician' AND assignee_id=app_user_id())));
ALTER POLICY clients_read ON clients USING ((is_staff(workspace_id) OR (my_role(workspace_id)='client' AND id=my_client(workspace_id)) OR my_job_client(workspace_id,id)));
ALTER POLICY sites_read ON sites USING ((is_staff(workspace_id) OR (my_role(workspace_id)='client' AND client_id=my_client(workspace_id)) OR my_job_site(workspace_id,id)));
ALTER POLICY comments_read ON comments USING ((is_staff(workspace_id) OR ((my_role(workspace_id)='client' AND client_id=my_client(workspace_id)) AND visibility='client') OR my_job(workspace_id,work_order_id)));
ALTER POLICY comments_insert ON comments WITH CHECK (((is_staff(workspace_id) OR ((my_role(workspace_id)='client' AND client_id=my_client(workspace_id)) AND visibility='client') OR my_job(workspace_id,work_order_id)) AND author_id=app_user_id()));
ALTER POLICY work_order_events_read ON work_order_events USING ((is_staff(workspace_id) OR (my_role(workspace_id)='client' AND client_id=my_client(workspace_id)) OR my_job(workspace_id,work_order_id)));

-- A technician changes only the status of their own job, and never cancels it.
CREATE FUNCTION guard_technician_update() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.my_role(OLD.workspace_id)='technician' THEN
  IF (to_jsonb(NEW)-'status'-'updated_at')<>(to_jsonb(OLD)-'status'-'updated_at') THEN RAISE EXCEPTION 'Technicians can only change the status of their own jobs' USING ERRCODE='P0403'; END IF;
  IF NEW.status='cancelled' THEN RAISE EXCEPTION 'Ask a supervisor to cancel a job' USING ERRCODE='P0403'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER work_order_technician BEFORE UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION guard_technician_update();

-- Names: technicians see the people in their workspace (comment authors, supervisors), like staff do.
CREATE OR REPLACE FUNCTION visible_user(uid uuid) RETURNS TABLE(id uuid,name text,email text,image text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT u.id,u.name,u.email,u.image FROM public.users u WHERE (u.id=public.app_user_id()
 OR EXISTS(SELECT 1 FROM public.members m JOIN public.members me ON me.workspace_id=m.workspace_id
 WHERE m.user_id=u.id AND me.user_id=public.app_user_id() AND me.role IN ('admin','staff','technician'))
  ) AND u.id=uid
$$;
CREATE OR REPLACE FUNCTION visible_assignee(ws uuid,wo uuid) RETURNS TABLE(id uuid,name text,image text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT u.id,u.name,u.image FROM public.work_orders w JOIN public.users u ON u.id=w.assignee_id
 WHERE w.workspace_id=ws AND w.id=wo AND (public.is_staff(ws) OR (public.my_role(ws)='client' AND w.client_id=public.my_client(ws)) OR (public.my_role(ws)='technician' AND w.assignee_id=public.app_user_id()))
$$;

-- Notifications: technicians are told about status changes on their jobs; their client visible comments notify the client.
CREATE OR REPLACE FUNCTION notify_status_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  INSERT INTO public.notifications(user_id,workspace_id,kind,entity_id,actor_id,actor_name,work_order_title,from_status,to_status)
  SELECT DISTINCT m.user_id,NEW.workspace_id,'status_changed',NEW.id,public.app_user_id(),coalesce(u.name,'System'),NEW.title,OLD.status::text,NEW.status::text
  FROM public.members m LEFT JOIN public.users u ON u.id=public.app_user_id()
  WHERE m.workspace_id=NEW.workspace_id AND m.user_id IN (NEW.created_by,NEW.assignee_id)
   AND m.user_id IS DISTINCT FROM public.app_user_id() AND (m.role IN ('admin','staff','technician') OR m.client_id=NEW.client_id);
 END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION notify_client_comment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.visibility='client' AND EXISTS(SELECT 1 FROM public.members WHERE workspace_id=NEW.workspace_id AND user_id=NEW.author_id AND role IN ('admin','staff','technician')) THEN
  INSERT INTO public.notifications(user_id,workspace_id,kind,entity_id,actor_id,actor_name,work_order_title)
  SELECT w.created_by,NEW.workspace_id,'comment_added',NEW.work_order_id,NEW.author_id,coalesce(u.name,'Your team'),w.title
  FROM public.work_orders w JOIN public.members m ON m.workspace_id=w.workspace_id AND m.user_id=w.created_by LEFT JOIN public.users u ON u.id=NEW.author_id
  WHERE w.workspace_id=NEW.workspace_id AND w.id=NEW.work_order_id AND m.role='client' AND m.client_id=w.client_id AND w.created_by<>NEW.author_id;
 END IF;
 RETURN NULL;
END $$;
-- Demo: a technician persona (Ravi) next to the supervisor (Sam).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_demo_persona_check;
ALTER TABLE users ADD CONSTRAINT users_demo_persona_check CHECK(demo_persona IN ('imran','sam','ravi','pranav','omar'));
