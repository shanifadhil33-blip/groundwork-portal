-- A staff reply is delivered atomically with the comment, including MCP/assistant writes.
CREATE FUNCTION notify_client_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.visibility='client' AND EXISTS (
  SELECT 1 FROM public.members WHERE workspace_id=NEW.workspace_id AND user_id=NEW.author_id AND role IN ('admin','staff')
 ) THEN
  INSERT INTO public.notifications(user_id,workspace_id,kind,entity_id)
  SELECT w.created_by,NEW.workspace_id,'comment_added',NEW.work_order_id
  FROM public.work_orders w JOIN public.members m ON m.workspace_id=w.workspace_id AND m.user_id=w.created_by
  WHERE w.workspace_id=NEW.workspace_id AND w.id=NEW.work_order_id
   AND m.role='client' AND m.client_id=w.client_id AND w.created_by<>NEW.author_id;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER comment_notifications AFTER INSERT ON comments FOR EACH ROW EXECUTE FUNCTION notify_client_comment();
REVOKE ALL ON FUNCTION notify_client_comment() FROM PUBLIC;
