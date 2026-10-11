-- QA 46: additive access paths; policies, grants and tenant scopes are unchanged.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Filters use enum equality so these indexes match the stored enum types.
CREATE INDEX IF NOT EXISTS wo_ws_status_updated ON work_orders(workspace_id,status,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS wo_ws_client_updated ON work_orders(workspace_id,client_id,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS wo_ws_assignee_updated ON work_orders(workspace_id,assignee_id,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS wo_ws_updated ON work_orders(workspace_id,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS wo_ws_created ON work_orders(workspace_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS wo_ws_due ON work_orders(workspace_id,due_on,id);
CREATE INDEX IF NOT EXISTS wo_ws_due_desc ON work_orders(workspace_id,due_on DESC NULLS LAST,id DESC);
CREATE INDEX IF NOT EXISTS wo_ws_scheduled ON work_orders(workspace_id,scheduled_for,id);
CREATE INDEX IF NOT EXISTS wo_ws_scheduled_desc ON work_orders(workspace_id,scheduled_for DESC NULLS LAST,id DESC);
CREATE INDEX IF NOT EXISTS wo_ws_priority ON work_orders(workspace_id,priority,id);
CREATE INDEX IF NOT EXISTS wo_ws_title ON work_orders(workspace_id,title,id);
CREATE INDEX IF NOT EXISTS wo_title_trgm ON work_orders USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS wo_description_trgm ON work_orders USING gin(description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS wo_number_trgm ON work_orders USING gin(('WO-'||order_number::text) gin_trgm_ops);
-- Case-insensitive import validation and duplicate detection.
CREATE INDEX IF NOT EXISTS wo_ws_external_ref_lower ON work_orders(workspace_id,lower(external_ref));
CREATE INDEX IF NOT EXISTS wo_ws_open_title_normal ON work_orders(workspace_id,lower(regexp_replace(trim(title),'\s+',' ','g'))) WHERE status NOT IN ('done','cancelled');
CREATE INDEX IF NOT EXISTS sites_ws_name_lower ON sites(workspace_id,lower(name));
CREATE INDEX IF NOT EXISTS sites_ws_address_lower ON sites(workspace_id,lower(address));
CREATE INDEX IF NOT EXISTS sites_ws_client_name ON sites(workspace_id,client_id,name,id);
CREATE INDEX IF NOT EXISTS clients_ws_name ON clients(workspace_id,name,id);
CREATE INDEX IF NOT EXISTS members_user_ws ON members(user_id,workspace_id);
CREATE INDEX IF NOT EXISTS members_ws_role ON members(workspace_id,role,user_id);
CREATE INDEX IF NOT EXISTS audit_ws_at_id ON audit_log(workspace_id,at DESC,id DESC);
CREATE INDEX IF NOT EXISTS audit_ws_actor_at ON audit_log(workspace_id,actor_id,at DESC,id DESC);
CREATE INDEX IF NOT EXISTS audit_ws_entity_at ON audit_log(workspace_id,entity,at DESC,id DESC);
CREATE INDEX IF NOT EXISTS audit_ws_entity_id_at ON audit_log(workspace_id,entity_id,at DESC,id DESC);
CREATE INDEX IF NOT EXISTS audit_ws_action_at ON audit_log(workspace_id,action,at DESC,id DESC);
CREATE INDEX IF NOT EXISTS notifications_user_ws_created ON notifications(user_id,workspace_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS notifications_user_read_created ON notifications(user_id,(read_at IS NULL),created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS notifications_user_ws_unread_created ON notifications(user_id,workspace_id,created_at DESC,id DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_user_ws_read_created ON notifications(user_id,workspace_id,created_at DESC,id DESC) WHERE read_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS comments_ws_order_created ON comments(workspace_id,work_order_id,created_at,id);
CREATE INDEX IF NOT EXISTS events_ws_order_created ON work_order_events(workspace_id,work_order_id,created_at,(CASE WHEN kind='created' THEN 0 ELSE 1 END),id);
CREATE INDEX IF NOT EXISTS imports_ws_created ON imports(workspace_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS imports_ws_hash_created ON imports(workspace_id,content_hash,created_at);
CREATE INDEX IF NOT EXISTS import_rows_ws_import_created ON import_rows(workspace_id,import_id,created_at,row_number);
CREATE INDEX IF NOT EXISTS import_rows_ws_import_status ON import_rows(workspace_id,import_id,status,created_at,row_number);
CREATE INDEX IF NOT EXISTS import_rows_ws_import_status_number ON import_rows(workspace_id,import_id,status,row_number);
CREATE INDEX IF NOT EXISTS import_rows_ws_import_decision ON import_rows(workspace_id,import_id,decision,created_at,row_number);
CREATE INDEX IF NOT EXISTS import_rows_ws_created ON import_rows(workspace_id,created_at,import_id,row_number);
CREATE INDEX IF NOT EXISTS import_rows_ws_status_created ON import_rows(workspace_id,status,created_at,import_id,row_number);
CREATE INDEX IF NOT EXISTS import_rows_ws_decision_created ON import_rows(workspace_id,decision,created_at,import_id,row_number);
CREATE INDEX IF NOT EXISTS import_rows_pending_queue ON import_rows(workspace_id,created_at,import_id,row_number) WHERE queued AND decision='pending';
CREATE INDEX IF NOT EXISTS import_rows_pending_queue_status ON import_rows(workspace_id,status,created_at,import_id,row_number) WHERE queued AND decision='pending';
CREATE INDEX IF NOT EXISTS import_rows_pending_drafts ON import_rows(workspace_id,import_id,row_number) WHERE queued AND decision='pending' AND ai_summary IS NULL;
CREATE INDEX IF NOT EXISTS invites_ws_created ON invites(workspace_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS api_tokens_ws_created ON api_tokens(workspace_id,created_at DESC);
CREATE INDEX IF NOT EXISTS api_tokens_ws_user_created ON api_tokens(workspace_id,user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS supplier_events_ws_event ON supplier_events(workspace_id,event_id);
CREATE INDEX IF NOT EXISTS supplier_orders_ws_work_order ON supplier_orders(workspace_id,work_order_id);
CREATE INDEX IF NOT EXISTS supplier_runs_ws_started ON supplier_sync_runs(workspace_id,started_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS supplier_runs_ws_finished ON supplier_sync_runs(workspace_id,finished_at DESC);
CREATE INDEX IF NOT EXISTS demo_attempts_created ON demo_creation_attempts(created_at);
CREATE INDEX IF NOT EXISTS users_demo_workspace_persona ON users(demo_workspace_id,demo_persona) WHERE is_demo;
CREATE INDEX IF NOT EXISTS users_demo_workspace ON users(demo_workspace_id);
CREATE INDEX IF NOT EXISTS users_email_lower ON users(lower(email));
CREATE INDEX IF NOT EXISTS sessions_user ON sessions("userId");
CREATE INDEX IF NOT EXISTS accounts_user ON accounts("userId");

-- Keep per-event trigger/audit ordering while avoiding a client/server trip for
-- each receipt, projection, work-order update and repair timeline row.
-- Invoker rights and revoked public execution retain the owner-only repair path.
CREATE OR REPLACE FUNCTION repair_supplier_batch(p_ws uuid,p_items jsonb,p_events jsonb) RETURNS integer
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE item jsonb; event jsonb; projection public.supplier_orders; inserted uuid; repaired integer:=0;
BEGIN
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF item->>'local_status' IS NULL THEN
   INSERT INTO public.supplier_orders(workspace_id,work_order_id,cobalt_ref) VALUES(p_ws,(item->>'work_order_id')::uuid,item->>'cobalt_ref');
  END IF;
  FOR event IN SELECT value FROM jsonb_array_elements(p_events)
   WHERE value->>'cobalt_ref'=item->>'cobalt_ref' AND item->'missing_event_ids' ? (value->>'event_id') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.supplier_orders WHERE workspace_id=p_ws AND cobalt_ref=event->>'cobalt_ref') THEN
    RAISE EXCEPTION 'This supplier order is unavailable.' USING ERRCODE='P0422';
   END IF;
   inserted:=NULL;
   INSERT INTO public.supplier_events(workspace_id,cobalt_ref,event_id,status,received_via,occurred_at,sequence)
   VALUES(p_ws,event->>'cobalt_ref',event->>'event_id',event->>'status','reconcile',(event->>'occurred_at')::timestamptz,(event->>'sequence')::bigint)
   ON CONFLICT(event_id) DO NOTHING RETURNING id INTO inserted;
   IF inserted IS NULL THEN CONTINUE; END IF;
   SELECT * INTO projection FROM public.supplier_orders WHERE workspace_id=p_ws AND cobalt_ref=event->>'cobalt_ref' FOR UPDATE;
   IF (event->>'sequence')::bigint<=projection.last_sequence OR (projection.local_status IN ('delivered','cancelled') AND event->>'status'<>projection.local_status) THEN CONTINUE; END IF;
   UPDATE public.supplier_orders SET local_status=event->>'status',last_sequence=(event->>'sequence')::bigint,updated_at=clock_timestamp() WHERE workspace_id=p_ws AND cobalt_ref=event->>'cobalt_ref';
   IF event->>'status'='delivered' THEN
    UPDATE public.work_orders SET status='in_progress' WHERE workspace_id=p_ws AND id=projection.work_order_id AND status='waiting_on_parts';
   END IF;
  END LOOP;
  UPDATE public.supplier_orders SET local_status=item->>'cobalt_status',updated_at=clock_timestamp() WHERE workspace_id=p_ws AND cobalt_ref=item->>'cobalt_ref' AND local_status<>item->>'cobalt_status';
  IF item->>'cobalt_status'='delivered' THEN
   UPDATE public.work_orders SET status='in_progress' WHERE workspace_id=p_ws AND id=(item->>'work_order_id')::uuid AND status='waiting_on_parts';
  END IF;
  INSERT INTO public.work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body)
   SELECT workspace_id,client_id,id,public.app_user_id(),'supplier_repaired','Repaired by sync' FROM public.work_orders WHERE workspace_id=p_ws AND id=(item->>'work_order_id')::uuid;
  repaired:=repaired+1;
 END LOOP;
 RETURN repaired;
END $$;
REVOKE ALL ON FUNCTION repair_supplier_batch(uuid,jsonb,jsonb) FROM PUBLIC;

-- Batch transport only: preserve the original per-row write/trigger ordering.
-- SECURITY INVOKER means table permissions and RLS still govern every write.
CREATE OR REPLACE FUNCTION approve_import_batch(p_ws uuid,p_user uuid,p_items jsonb) RETURNS SETOF work_orders
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE item jsonb; row_data jsonb; imported public.import_rows; created public.work_orders; tz text; visit timestamptz;
BEGIN
 IF public.app_user_id() IS DISTINCT FROM p_user OR NOT public.is_staff(p_ws) THEN
  RAISE EXCEPTION 'Approval requires workspace staff.' USING ERRCODE='P0403';
 END IF;
 SELECT timezone INTO tz FROM public.workspaces WHERE id=p_ws;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  SELECT * INTO imported FROM public.import_rows WHERE workspace_id=p_ws AND id=(item->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This row is unavailable.' USING ERRCODE='P0404'; END IF;
  IF NOT imported.queued OR imported.decision<>'pending' THEN RAISE EXCEPTION 'This row is not awaiting approval.' USING ERRCODE='P0409'; END IF;
  row_data:=item->'data';
  visit:=CASE WHEN nullif(row_data->>'scheduled_for','') IS NULL THEN NULL WHEN length(row_data->>'scheduled_for')=10 THEN ((row_data->>'scheduled_for')::date + time '09:00') AT TIME ZONE tz ELSE (row_data->>'scheduled_for')::timestamptz END;
  INSERT INTO public.work_orders(id,workspace_id,client_id,site_id,title,description,priority,due_on,scheduled_for,external_ref,source,created_by)
   VALUES((item->>'order_id')::uuid,p_ws,(row_data->>'client_id')::uuid,(row_data->>'site_id')::uuid,row_data->>'title',row_data->>'description',(row_data->>'priority')::public.work_order_priority,nullif(row_data->>'due_on','')::date,visit,nullif(row_data->>'external_ref',''),'import',p_user) RETURNING * INTO created;
  UPDATE public.import_rows SET decision='approved',work_order_id=created.id,data=row_data,errors='[]',warnings=item->'warnings',status=item->>'status' WHERE workspace_id=p_ws AND id=imported.id;
  UPDATE public.imports SET status=CASE WHEN EXISTS(SELECT 1 FROM public.import_rows WHERE import_id=imported.import_id AND workspace_id=p_ws AND queued AND decision='pending') THEN 'queued' ELSE 'completed' END WHERE workspace_id=p_ws AND id=imported.import_id;
  RETURN NEXT created;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION approve_import_batch(uuid,uuid,jsonb) FROM PUBLIC;

-- AI providers can repeat a row; retain ordered last-write-wins and stored count.
CREATE OR REPLACE FUNCTION store_import_drafts(p_ws uuid,p_import uuid,p_items jsonb) RETURNS integer
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE item jsonb; changed integer; stored integer:=0;
BEGIN
 IF NOT public.is_staff(p_ws) THEN RAISE EXCEPTION 'Drafts require workspace staff.' USING ERRCODE='P0403'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  UPDATE public.import_rows SET ai_summary=item->>'summary',ai_priority=(item->>'priority')::public.work_order_priority
   WHERE workspace_id=p_ws AND import_id=p_import AND id=(item->>'row_id')::uuid AND queued AND decision='pending';
  GET DIAGNOSTICS changed=ROW_COUNT;
  stored:=stored+changed;
 END LOOP;
 RETURN stored;
END $$;
REVOKE ALL ON FUNCTION store_import_drafts(uuid,uuid,jsonb) FROM PUBLIC;
