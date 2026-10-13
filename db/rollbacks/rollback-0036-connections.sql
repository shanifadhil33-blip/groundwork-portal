-- Restore delivery behavior before the connection fixes.
DROP TRIGGER IF EXISTS work_order_connections ON work_orders;
DROP TRIGGER IF EXISTS member_connections ON members;
DROP FUNCTION IF EXISTS notify_assignment_and_report(),notify_role_change();
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
DROP TRIGGER IF EXISTS leave_connections ON time_off;
DROP FUNCTION IF EXISTS notify_leave_decision();
