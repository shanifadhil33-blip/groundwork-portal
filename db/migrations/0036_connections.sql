-- Close delivery gaps using the same transaction as each action.
CREATE OR REPLACE FUNCTION notify_status_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  INSERT INTO public.notifications(user_id,workspace_id,kind,entity_id,actor_id,actor_name,work_order_title,from_status,to_status)
  SELECT DISTINCT m.user_id,NEW.workspace_id,'status_changed',NEW.id,public.app_user_id(),coalesce(u.name,'Your team'),NEW.title,OLD.status::text,NEW.status::text
  FROM public.members m LEFT JOIN public.users u ON u.id=public.app_user_id()
  WHERE m.workspace_id=NEW.workspace_id AND m.archived_at IS NULL AND m.user_id IS DISTINCT FROM public.app_user_id()
   AND (m.user_id IN (NEW.assignee_id,NEW.created_by) OR (m.role='client' AND m.client_id=NEW.client_id AND (coalesce(m.client_kind,'manager')<>'household' OR m.user_id=NEW.created_by)));
 END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION notify_client_comment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.notifications(user_id,workspace_id,kind,entity_id,actor_id,actor_name,work_order_title,to_status)
 SELECT DISTINCT m.user_id,NEW.workspace_id,'comment_added',NEW.work_order_id,NEW.author_id,coalesce(u.name,'Your team'),w.title,NEW.visibility
 FROM public.work_orders w JOIN public.members m ON m.workspace_id=w.workspace_id LEFT JOIN public.users u ON u.id=NEW.author_id
 WHERE w.workspace_id=NEW.workspace_id AND w.id=NEW.work_order_id AND m.archived_at IS NULL AND m.user_id<>NEW.author_id
 AND (m.role IN ('admin','staff') OR m.user_id=w.assignee_id OR
  (NEW.visibility='client' AND m.role='client' AND m.client_id=w.client_id AND (coalesce(m.client_kind,'manager')<>'household' OR m.user_id=w.created_by)));
 RETURN NULL;
END $$;
CREATE FUNCTION notify_assignment_and_report() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.assignee_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id) AND NEW.assignee_id IS DISTINCT FROM public.app_user_id() THEN
  INSERT INTO public.notifications(user_id,workspace_id,kind,entity_id,actor_id,actor_name,work_order_title)
  SELECT NEW.assignee_id,NEW.workspace_id,'job_assigned',NEW.id,public.app_user_id(),coalesce(u.name,'Your team'),NEW.title FROM public.users u WHERE u.id=public.app_user_id();
 END IF;
 IF TG_OP='UPDATE' AND NEW.report_at IS DISTINCT FROM OLD.report_at AND NEW.report_at IS NOT NULL THEN
  INSERT INTO public.notifications(user_id,workspace_id,kind,entity_id,actor_id,actor_name,work_order_title,to_status)
  SELECT m.user_id,NEW.workspace_id,'job_reported',NEW.id,public.app_user_id(),coalesce(u.name,'Your team'),NEW.title,NEW.report_outcome
  FROM public.members m LEFT JOIN public.users u ON u.id=public.app_user_id()
  WHERE m.workspace_id=NEW.workspace_id AND m.archived_at IS NULL AND (m.role='admin' OR (m.role='staff' AND m.staff_kind IS DISTINCT FROM 'office')) AND m.user_id IS DISTINCT FROM public.app_user_id();
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER work_order_connections AFTER INSERT OR UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION notify_assignment_and_report();
CREATE FUNCTION notify_role_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF (NEW.role,NEW.extra_roles,NEW.staff_kind,NEW.client_kind) IS DISTINCT FROM (OLD.role,OLD.extra_roles,OLD.staff_kind,OLD.client_kind) AND NEW.archived_at IS NULL THEN
  INSERT INTO public.notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name)
  SELECT NEW.user_id,NEW.workspace_id,'roles_changed','members',NEW.user_id,public.app_user_id(),coalesce(u.name,'Your admin') FROM public.users u WHERE u.id=public.app_user_id();
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER member_connections AFTER UPDATE ON members FOR EACH ROW EXECUTE FUNCTION notify_role_change();
REVOKE ALL ON FUNCTION notify_assignment_and_report(),notify_role_change() FROM PUBLIC;
CREATE FUNCTION notify_leave_decision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.status='pending' AND NEW.status IN ('approved','declined') THEN
  INSERT INTO public.notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title,to_status)
  SELECT NEW.user_id,NEW.workspace_id,'leave_decided','time_off',NEW.id,public.app_user_id(),coalesce(u.name,'Your supervisor'),NEW.starts_on::text||' to '||NEW.ends_on::text,NEW.status FROM public.users u WHERE u.id=public.app_user_id();
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER leave_connections AFTER UPDATE ON time_off FOR EACH ROW EXECUTE FUNCTION notify_leave_decision();
REVOKE ALL ON FUNCTION notify_leave_decision() FROM PUBLIC;
