-- Preserve event context. Existing titles use historical snapshots where available.
ALTER TABLE audit_log ADD COLUMN work_order_title text, ADD COLUMN work_order_id uuid;
ALTER TABLE work_order_events ADD COLUMN work_order_title text, ADD COLUMN actor_kind text NOT NULL DEFAULT 'user', ADD COLUMN via_token_name text;
ALTER TABLE comments ADD COLUMN work_order_title text, ADD COLUMN actor_kind text NOT NULL DEFAULT 'user', ADD COLUMN via_token_name text;
ALTER TABLE notifications ADD COLUMN actor_id uuid, ADD COLUMN actor_name text, ADD COLUMN work_order_title text, ADD COLUMN from_status text, ADD COLUMN to_status text;

UPDATE audit_log SET work_order_id=CASE WHEN entity='work_orders' THEN entity_id ELSE nullif(coalesce("after"->>'work_order_id',"before"->>'work_order_id'),'')::uuid END;
UPDATE audit_log a SET work_order_title=coalesce(
 CASE WHEN a.entity='work_orders' THEN coalesce(a."after"->>'title',a."before"->>'title') END,
 (SELECT coalesce(h."after"->>'title',h."before"->>'title') FROM audit_log h WHERE h.workspace_id=a.workspace_id AND h.entity='work_orders' AND h.entity_id=a.work_order_id AND h.at<=a.at ORDER BY h.at DESC,h.id DESC LIMIT 1),
 (SELECT w.title FROM work_orders w WHERE w.workspace_id=a.workspace_id AND w.id=a.work_order_id));
-- Metadata backfill is not a new user action. The migration transaction holds
-- these tables' locks while their audit triggers are disabled and restored.
ALTER TABLE work_order_events DISABLE TRIGGER audit_work_order_events;
ALTER TABLE comments DISABLE TRIGGER audit_comments;
UPDATE work_order_events e SET work_order_title=coalesce((SELECT a.work_order_title FROM audit_log a WHERE a.entity='work_order_events' AND a.entity_id=e.id LIMIT 1),(SELECT title FROM work_orders w WHERE w.id=e.work_order_id AND w.workspace_id=e.workspace_id)),actor_kind=coalesce((SELECT actor_kind FROM audit_log a WHERE a.entity='work_order_events' AND a.entity_id=e.id LIMIT 1),'user'),via_token_name=(SELECT via_token_name FROM audit_log a WHERE a.entity='work_order_events' AND a.entity_id=e.id LIMIT 1);
UPDATE comments c SET work_order_title=coalesce((SELECT a.work_order_title FROM audit_log a WHERE a.entity='comments' AND a.entity_id=c.id LIMIT 1),(SELECT title FROM work_orders w WHERE w.id=c.work_order_id AND w.workspace_id=c.workspace_id)),actor_kind=coalesce((SELECT actor_kind FROM audit_log a WHERE a.entity='comments' AND a.entity_id=c.id LIMIT 1),'user'),via_token_name=(SELECT via_token_name FROM audit_log a WHERE a.entity='comments' AND a.entity_id=c.id LIMIT 1);

ALTER TABLE work_order_events ENABLE TRIGGER audit_work_order_events;
ALTER TABLE comments ENABLE TRIGGER audit_comments;

CREATE FUNCTION snapshot_work_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 SELECT title INTO NEW.work_order_title FROM public.work_orders WHERE workspace_id=NEW.workspace_id AND id=NEW.work_order_id;
 NEW.actor_kind=coalesce(nullif(current_setting('app.actor_kind',true),''),'user');
 SELECT name INTO NEW.via_token_name FROM public.api_tokens WHERE id=nullif(current_setting('app.via_token',true),'')::uuid;
 RETURN NEW;
END $$;
CREATE TRIGGER snapshot_work_event BEFORE INSERT ON work_order_events FOR EACH ROW EXECUTE FUNCTION snapshot_work_activity();
CREATE TRIGGER snapshot_comment BEFORE INSERT ON comments FOR EACH ROW EXECUTE FUNCTION snapshot_work_activity();

CREATE OR REPLACE FUNCTION capture_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old_row jsonb; new_row jsonb; row_data jsonb; ws uuid; tid uuid; tname text; wid uuid; title text; filename text; number integer;
BEGIN
 IF TG_OP <> 'INSERT' THEN old_row=to_jsonb(OLD); END IF;
 IF TG_OP <> 'DELETE' THEN new_row=to_jsonb(NEW); END IF;
 row_data=coalesce(new_row,old_row);
 ws=CASE WHEN TG_TABLE_NAME='workspaces' THEN (row_data->>'id')::uuid ELSE (row_data->>'workspace_id')::uuid END;
 tid=nullif(current_setting('app.via_token',true),'')::uuid;
 SELECT name INTO tname FROM public.api_tokens WHERE id=tid;
 wid=CASE WHEN TG_TABLE_NAME='work_orders' THEN (row_data->>'id')::uuid ELSE nullif(row_data->>'work_order_id','')::uuid END;
 IF TG_TABLE_NAME='work_orders' THEN title=row_data->>'title';
 ELSE
  title=row_data->>'work_order_title';
  IF title IS NULL THEN SELECT w.title INTO title FROM public.work_orders w WHERE w.workspace_id=ws AND w.id=wid; END IF;
 END IF;
 IF TG_TABLE_NAME='import_rows' THEN
  SELECT i.filename INTO filename FROM public.imports i WHERE i.workspace_id=ws AND i.id=(row_data->>'import_id')::uuid;
  SELECT w.order_number INTO number FROM public.work_orders w WHERE w.workspace_id=ws AND w.id=wid;
  old_row=CASE WHEN old_row IS NULL THEN NULL ELSE old_row||jsonb_build_object('filename',filename) END;
  new_row=CASE WHEN new_row IS NULL THEN NULL ELSE new_row||jsonb_build_object('filename',filename,'work_order_number',number) END;
 END IF;
 IF TG_TABLE_NAME='api_tokens' THEN old_row=old_row-'token_hash'; new_row=new_row-'token_hash'; END IF;
 INSERT INTO public.audit_log(workspace_id,actor_id,action,entity,entity_id,"before","after",actor_kind,via_token_id,via_token_name,work_order_title,work_order_id)
 VALUES(ws,public.app_user_id(),lower(TG_OP),TG_TABLE_NAME,(row_data->>'id')::uuid,old_row,new_row,coalesce(nullif(current_setting('app.actor_kind',true),''),'user'),tid,tname,title,wid);
 RETURN NULL;
END $$;
-- Older run attribution was not retained; report those runs as System.
INSERT INTO audit_log(workspace_id,action,entity,entity_id,"after",at)
 SELECT workspace_id,'update','supplier_sync_runs',id,to_jsonb(r),finished_at FROM supplier_sync_runs r WHERE finished_at IS NOT NULL;
-- One entry per completed check/repair, including failures; no started-run noise.
CREATE TRIGGER audit_supplier_run AFTER UPDATE ON supplier_sync_runs FOR EACH ROW WHEN (OLD.finished_at IS NULL AND NEW.finished_at IS NOT NULL) EXECUTE FUNCTION capture_audit();

CREATE OR REPLACE FUNCTION notify_status_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  INSERT INTO public.notifications(user_id,workspace_id,kind,entity_id,actor_id,actor_name,work_order_title,from_status,to_status)
  SELECT DISTINCT m.user_id,NEW.workspace_id,'status_changed',NEW.id,public.app_user_id(),coalesce(u.name,'System'),NEW.title,OLD.status::text,NEW.status::text
  FROM public.members m LEFT JOIN public.users u ON u.id=public.app_user_id()
  WHERE m.workspace_id=NEW.workspace_id AND m.user_id IN (NEW.created_by,NEW.assignee_id)
   AND m.user_id IS DISTINCT FROM public.app_user_id() AND (m.role IN ('admin','staff') OR m.client_id=NEW.client_id);
 END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION notify_client_comment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.visibility='client' AND EXISTS(SELECT 1 FROM public.members WHERE workspace_id=NEW.workspace_id AND user_id=NEW.author_id AND role IN ('admin','staff')) THEN
  INSERT INTO public.notifications(user_id,workspace_id,kind,entity_id,actor_id,actor_name,work_order_title)
  SELECT w.created_by,NEW.workspace_id,'comment_added',NEW.work_order_id,NEW.author_id,coalesce(u.name,'Your team'),w.title
  FROM public.work_orders w JOIN public.members m ON m.workspace_id=w.workspace_id AND m.user_id=w.created_by LEFT JOIN public.users u ON u.id=NEW.author_id
  WHERE w.workspace_id=NEW.workspace_id AND w.id=NEW.work_order_id AND m.role='client' AND m.client_id=w.client_id AND w.created_by<>NEW.author_id;
 END IF;
 RETURN NULL;
END $$;
-- Enrich explicit seed/system notifications too; retain event text on read/unread.
CREATE FUNCTION snapshot_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 NEW.actor_id=coalesce(NEW.actor_id,public.app_user_id());
 IF NEW.actor_id=NEW.user_id THEN RETURN NULL; END IF;
 IF NEW.actor_name IS NULL THEN SELECT name INTO NEW.actor_name FROM public.users WHERE id=NEW.actor_id; END IF;
 IF NEW.work_order_title IS NULL THEN SELECT title INTO NEW.work_order_title FROM public.work_orders WHERE workspace_id=NEW.workspace_id AND id=NEW.entity_id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER snapshot_notification BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION snapshot_notification();
-- Reconstruct legacy notifications from their event, when retained, and remove self-notifications.
WITH history AS (
 SELECT n.id,a.actor_id,u.name,a.work_order_title,a."before"->>'status' AS from_status,a."after"->>'status' AS to_status
 FROM notifications n JOIN LATERAL (
  SELECT a.* FROM audit_log a WHERE a.workspace_id=n.workspace_id AND a.work_order_id=n.entity_id AND a.at<=n.created_at
   AND ((n.kind='status_changed' AND a.entity='work_orders' AND a.action='update' AND a."before"->>'status' IS DISTINCT FROM a."after"->>'status') OR (n.kind='comment_added' AND a.entity='comments' AND a.action='insert') OR (n.kind='request_created' AND a.entity='work_orders' AND a.action='insert'))
  ORDER BY a.at DESC LIMIT 1
 ) a ON true LEFT JOIN users u ON u.id=a.actor_id
) UPDATE notifications n SET actor_id=h.actor_id,actor_name=h.name,work_order_title=h.work_order_title,from_status=h.from_status,to_status=h.to_status FROM history h WHERE n.id=h.id;
DELETE FROM notifications WHERE actor_id=user_id;
UPDATE notifications n SET work_order_title=w.title FROM work_orders w WHERE n.work_order_title IS NULL AND w.workspace_id=n.workspace_id AND w.id=n.entity_id;

-- Read-only invite validation, scoped to the signed-in recipient. Never consumes an invite.
CREATE FUNCTION inspect_invite(p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i public.invites; mail text;
BEGIN
 SELECT email INTO mail FROM public.users WHERE id=public.app_user_id();
 SELECT * INTO i FROM public.invites WHERE token_hash=p_hash;
 IF mail IS NULL OR NOT FOUND OR lower(i.email)<>lower(mail) THEN RETURN jsonb_build_object('error','not_found'); END IF;
 IF i.status='accepted' AND i.accepted_by=public.app_user_id() THEN RETURN jsonb_build_object('status','accepted'); END IF;
 IF i.expires_at<=now() OR i.status='expired' THEN RETURN jsonb_build_object('error','expired'); END IF;
 IF i.status<>'pending' THEN RETURN jsonb_build_object('error',i.status); END IF;
 IF EXISTS(SELECT 1 FROM public.members WHERE workspace_id=i.workspace_id AND user_id=public.app_user_id()) THEN RETURN jsonb_build_object('error','member_exists'); END IF;
 RETURN jsonb_build_object('status','pending');
END $$;
REVOKE ALL ON FUNCTION snapshot_work_activity(),snapshot_notification(),inspect_invite(text) FROM PUBLIC;
