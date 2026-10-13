-- Finished or cancelled jobs can be archived: hidden from the daily list, every record kept.
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS work_orders_archived_idx ON work_orders(workspace_id) WHERE archived_at IS NOT NULL;
-- Archiving a finished job changes only archived_at; allow that for admins and supervisors.
CREATE OR REPLACE FUNCTION guard_completed_work_order() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 -- Owner maintenance (seed, workspace/member deletion) remains possible.
 IF current_user<>(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.work_orders'::regclass) THEN
  IF TG_OP='DELETE' AND OLD.status='done' THEN RAISE EXCEPTION 'Completed orders are read-only' USING ERRCODE='P0403'; END IF;
  IF TG_OP='UPDATE' THEN
   IF NEW.order_number IS DISTINCT FROM OLD.order_number THEN RAISE EXCEPTION 'Work order number is permanent' USING ERRCODE='P0403'; END IF;
   IF OLD.status='done' AND public.my_role(OLD.workspace_id) IN ('admin','staff') AND (to_jsonb(NEW)-'archived_at'-'updated_at')=(to_jsonb(OLD)-'archived_at'-'updated_at') THEN RETURN NEW; END IF;
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
