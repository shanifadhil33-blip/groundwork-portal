-- A deadline is a workspace calendar date; a visit remains a timestamp.
ALTER TABLE work_orders ADD COLUMN due_on date, ADD COLUMN order_number integer;
UPDATE work_orders o SET due_on=(o.scheduled_for AT TIME ZONE w.timezone)::date FROM workspaces w WHERE w.id=o.workspace_id AND o.scheduled_for IS NOT NULL;
-- Retain legacy displayed numbers where present, then allocate numbers above them.
WITH legacy AS (
 SELECT id,workspace_id,coalesce(substring(title from '(?i)WO-([0-9]+)'),substring(title from '/\s*([0-9]+)\s*$'))::integer AS n FROM work_orders
), unique_legacy AS (
 SELECT *,row_number() OVER(PARTITION BY workspace_id,n ORDER BY id) AS rank FROM legacy WHERE n>0
) UPDATE work_orders o SET order_number=l.n FROM unique_legacy l WHERE o.id=l.id AND l.rank=1;
WITH unnumbered AS (
 SELECT id,coalesce((SELECT max(order_number) FROM work_orders numbered WHERE numbered.workspace_id=o.workspace_id),0)+row_number() OVER(PARTITION BY workspace_id ORDER BY created_at,id) AS n FROM work_orders o WHERE order_number IS NULL
) UPDATE work_orders o SET order_number=u.n FROM unnumbered u WHERE o.id=u.id;
ALTER TABLE work_orders ALTER COLUMN order_number SET NOT NULL;
ALTER TABLE work_orders ADD CONSTRAINT work_order_number_positive CHECK(order_number>0), ADD CONSTRAINT work_order_workspace_number UNIQUE(workspace_id,order_number);
CREATE INDEX work_orders_due ON work_orders(workspace_id,due_on) WHERE status NOT IN ('done','cancelled');
UPDATE work_orders SET status='scheduled' WHERE status='open' AND scheduled_for IS NOT NULL;
-- Counters have no app grants; only the insert trigger can allocate a number.
CREATE TABLE work_order_counters(workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,last_number integer NOT NULL);
ALTER TABLE work_order_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_counters FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON work_order_counters TO %I USING(true) WITH CHECK(true)',current_user); END $$;
INSERT INTO work_order_counters SELECT workspace_id,max(order_number) FROM work_orders GROUP BY workspace_id;
CREATE FUNCTION allocate_work_order_number() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.order_number IS NULL THEN
  INSERT INTO public.work_order_counters(workspace_id,last_number) VALUES(NEW.workspace_id,1)
  ON CONFLICT(workspace_id) DO UPDATE SET last_number=work_order_counters.last_number+1 RETURNING last_number INTO NEW.order_number;
 ELSE
  IF session_user<>current_user THEN RAISE EXCEPTION 'Work order numbers are allocated by the portal' USING ERRCODE='P0403'; END IF;
  INSERT INTO public.work_order_counters(workspace_id,last_number) VALUES(NEW.workspace_id,NEW.order_number)
  ON CONFLICT(workspace_id) DO UPDATE SET last_number=greatest(work_order_counters.last_number,EXCLUDED.last_number);
 END IF;
 IF NEW.status='open' AND NEW.scheduled_for IS NOT NULL THEN NEW.status='scheduled'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER work_order_number BEFORE INSERT ON work_orders FOR EACH ROW EXECUTE FUNCTION allocate_work_order_number();
CREATE FUNCTION guard_completed_work_order() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 -- Owner maintenance (seed, workspace/member deletion) remains possible.
 IF current_user<>(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.work_orders'::regclass) THEN
  IF TG_OP='DELETE' AND OLD.status='done' THEN RAISE EXCEPTION 'Completed orders are read-only' USING ERRCODE='P0403'; END IF;
  IF TG_OP='UPDATE' THEN
   IF NEW.order_number IS DISTINCT FROM OLD.order_number THEN RAISE EXCEPTION 'Work order number is permanent' USING ERRCODE='P0403'; END IF;
   IF OLD.status='done' AND NOT (
    public.my_role(OLD.workspace_id)='admin' AND NEW.status=CASE WHEN OLD.scheduled_for IS NULL THEN 'open'::public.work_order_status ELSE 'scheduled'::public.work_order_status END
    AND (to_jsonb(NEW)-'status'-'updated_at')=(to_jsonb(OLD)-'status'-'updated_at')
   ) THEN RAISE EXCEPTION 'Completed orders are read-only; an admin can reopen them' USING ERRCODE='P0403'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF OLD.status='open' AND NEW.status='open' AND NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for AND NEW.scheduled_for IS NOT NULL THEN NEW.status='scheduled'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER work_order_completed BEFORE UPDATE OR DELETE ON work_orders FOR EACH ROW EXECUTE FUNCTION guard_completed_work_order();
-- Keep clients from setting staff-controlled deadlines through direct SQL.
DROP POLICY work_orders_insert ON work_orders;
CREATE POLICY work_orders_insert ON work_orders FOR INSERT WITH CHECK (
 (is_staff(workspace_id) AND created_by=app_user_id()) OR
 (my_role(workspace_id)='client' AND client_id=my_client(workspace_id) AND created_by=app_user_id() AND source='client' AND status='open' AND assignee_id IS NULL AND scheduled_for IS NULL AND due_on IS NULL)
);
ALTER TABLE work_order_events ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION record_work_order_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tz text; assignee_name text;
BEGIN
 SELECT timezone INTO tz FROM public.workspaces WHERE id=NEW.workspace_id;
 IF TG_OP='INSERT' THEN
  INSERT INTO public.work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,created_at) VALUES(NEW.workspace_id,NEW.client_id,NEW.id,public.app_user_id(),'created','Request created',NEW.created_at);
  IF NEW.assignee_id IS NOT NULL THEN
   SELECT name INTO assignee_name FROM public.users WHERE id=NEW.assignee_id;
   INSERT INTO public.work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details,created_at) VALUES(NEW.workspace_id,NEW.client_id,NEW.id,public.app_user_id(),'assignment_changed','Assigned '||coalesce(assignee_name,'a team member'),jsonb_build_object('assignee_name',assignee_name),NEW.created_at);
  END IF;
  IF NEW.scheduled_for IS NOT NULL THEN
   INSERT INTO public.work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details,created_at) VALUES(NEW.workspace_id,NEW.client_id,NEW.id,public.app_user_id(),'schedule_changed','Scheduled for '||to_char(NEW.scheduled_for AT TIME ZONE tz,'Mon FMDD, YYYY'),jsonb_build_object('scheduled_for',NEW.scheduled_for),NEW.created_at);
  END IF;
  IF NEW.due_on IS NOT NULL THEN
   INSERT INTO public.work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details,created_at) VALUES(NEW.workspace_id,NEW.client_id,NEW.id,public.app_user_id(),'due_changed','Set due date to '||to_char(NEW.due_on,'Mon FMDD, YYYY'),jsonb_build_object('due_on',NEW.due_on),NEW.created_at);
  END IF;
 ELSE
  IF NEW.status IS DISTINCT FROM OLD.status THEN
   INSERT INTO public.work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details) VALUES(NEW.workspace_id,NEW.client_id,NEW.id,public.app_user_id(),'status_changed','Moved to '||initcap(replace(NEW.status::text,'_',' ')),jsonb_build_object('from_status',OLD.status,'to_status',NEW.status));
  END IF;
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
   SELECT name INTO assignee_name FROM public.users WHERE id=NEW.assignee_id;
   INSERT INTO public.work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details) VALUES(NEW.workspace_id,NEW.client_id,NEW.id,public.app_user_id(),'assignment_changed',CASE WHEN NEW.assignee_id IS NULL THEN 'Cleared assignment' ELSE 'Assigned '||coalesce(assignee_name,'a team member') END,jsonb_build_object('assignee_name',assignee_name));
  END IF;
  IF NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for THEN
   INSERT INTO public.work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details) VALUES(NEW.workspace_id,NEW.client_id,NEW.id,public.app_user_id(),'schedule_changed',CASE WHEN NEW.scheduled_for IS NULL THEN 'Cleared visit schedule' ELSE 'Scheduled for '||to_char(NEW.scheduled_for AT TIME ZONE tz,'Mon FMDD, YYYY') END,jsonb_build_object('scheduled_for',NEW.scheduled_for));
  END IF;
  IF NEW.due_on IS DISTINCT FROM OLD.due_on THEN
   INSERT INTO public.work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details) VALUES(NEW.workspace_id,NEW.client_id,NEW.id,public.app_user_id(),'due_changed',CASE WHEN NEW.due_on IS NULL THEN 'Cleared due date' ELSE 'Set due date to '||to_char(NEW.due_on,'Mon FMDD, YYYY') END,jsonb_build_object('due_on',NEW.due_on));
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description OR NEW.priority IS DISTINCT FROM OLD.priority THEN
   INSERT INTO public.work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details) VALUES(NEW.workspace_id,NEW.client_id,NEW.id,public.app_user_id(),'details_changed','Updated request details',jsonb_build_object('title_changed',NEW.title IS DISTINCT FROM OLD.title,'description_changed',NEW.description IS DISTINCT FROM OLD.description,'priority',CASE WHEN NEW.priority IS DISTINCT FROM OLD.priority THEN NEW.priority END));
  END IF;
 END IF;
 RETURN NULL;
END $$;
-- Creation activity always represents the record's own creation date.
UPDATE work_order_events e SET created_at=o.created_at FROM work_orders o WHERE e.work_order_id=o.id AND e.kind='created';
-- Upgrade existing timeline rows so old status updates remain specific.
UPDATE work_order_events e SET details=jsonb_build_object('to_status',substring(body from 'Status changed to (.*)$')) WHERE kind='status_changed' AND body LIKE 'Status changed to %';
-- Old import JSON timestamps remain interpretable, but Due date mappings become deadlines.
UPDATE import_rows r SET data=(r.data-'scheduled_for') || jsonb_build_object('due_on', CASE WHEN nullif(r.data->>'scheduled_for','') IS NULL THEN '' WHEN r.status='error' THEN r.data->>'scheduled_for' ELSE to_char((r.data->>'scheduled_for')::timestamptz AT TIME ZONE w.timezone,'YYYY-MM-DD') END,'scheduled_for',''), errors=(SELECT coalesce(jsonb_agg(CASE WHEN issue->>'field'='scheduled_for' THEN issue || jsonb_build_object('field','due_on') ELSE issue END),'[]'::jsonb) FROM jsonb_array_elements(r.errors) issue), warnings=(SELECT coalesce(jsonb_agg(CASE WHEN issue->>'field'='scheduled_for' THEN issue || jsonb_build_object('field','due_on') ELSE issue END),'[]'::jsonb) FROM jsonb_array_elements(r.warnings) issue) FROM imports i,workspaces w WHERE r.import_id=i.id AND i.workspace_id=w.id AND lower(i.mapping->>'scheduled_for') LIKE '%due%';
UPDATE imports SET mapping=(mapping-'scheduled_for') || jsonb_build_object('due_on',mapping->>'scheduled_for') WHERE lower(mapping->>'scheduled_for') LIKE '%due%';
REVOKE ALL ON FUNCTION allocate_work_order_number(),guard_completed_work_order() FROM PUBLIC;
