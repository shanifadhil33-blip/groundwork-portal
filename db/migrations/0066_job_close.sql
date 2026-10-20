-- JOB14 sign off, JOB15 draft bill, PHOTO04 no photos mark. Additive. Rollback: db/rollbacks/rollback-0066.sql
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS signed_off_at timestamptz;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS signed_off_by uuid REFERENCES users(id);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS no_photos_at timestamptz;

CREATE TABLE draft_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 work_order_id uuid NOT NULL,
 lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array'),
 status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','kept')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 kept_by uuid,
 kept_at timestamptz,
 UNIQUE (workspace_id, work_order_id),
 FOREIGN KEY (workspace_id, work_order_id) REFERENCES work_orders(workspace_id, id) ON DELETE CASCADE
);
ALTER TABLE draft_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_invoices FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON draft_invoices TO %I USING(true) WITH CHECK(true)', current_user); END $$;
CREATE POLICY draft_read ON draft_invoices FOR SELECT USING (my_role(workspace_id) = 'admin');
REVOKE ALL ON draft_invoices FROM PUBLIC;
CREATE TRIGGER audit_draft_invoices AFTER INSERT OR UPDATE OR DELETE ON draft_invoices FOR EACH ROW EXECUTE FUNCTION capture_audit();

CREATE OR REPLACE FUNCTION guard_technician_update() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.work_orders'::regclass)
 AND current_setting('app.return_visit',true)=OLD.id::text THEN RETURN NEW; END IF;
 IF current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.work_orders'::regclass)
 AND current_setting('app.close_job',true)=OLD.id::text THEN RETURN NEW; END IF;
 IF public.my_role(OLD.workspace_id)='technician' THEN
  IF NEW.on_way_at IS DISTINCT FROM OLD.on_way_at THEN
   IF OLD.on_way_at IS NOT NULL OR NEW.on_way_at IS NULL OR OLD.status<>'scheduled' OR OLD.assignee_id IS DISTINCT FROM public.app_user_id()
     OR (to_jsonb(NEW)-'on_way_at'-'updated_at')<>(to_jsonb(OLD)-'on_way_at'-'updated_at') THEN
    RAISE EXCEPTION 'Only the assigned technician can start travel for a scheduled visit' USING ERRCODE='P0403';
   END IF;
   NEW.on_way_at=now();
   RETURN NEW;
  END IF;
  IF (to_jsonb(NEW)-'status'-'updated_at'-'report_problem'-'report_work'-'report_outcome'-'report_at'-'report_by'-'report_part')<>(to_jsonb(OLD)-'status'-'updated_at'-'report_problem'-'report_work'-'report_outcome'-'report_at'-'report_by'-'report_part') THEN RAISE EXCEPTION 'Technicians can only change the status of their own jobs' USING ERRCODE='P0403'; END IF;
  IF NEW.report_by IS DISTINCT FROM OLD.report_by AND NEW.report_by IS DISTINCT FROM public.app_user_id() THEN RAISE EXCEPTION 'Technicians sign only their own report' USING ERRCODE='P0403'; END IF;
  IF NEW.status='cancelled' THEN RAISE EXCEPTION 'Ask a supervisor to cancel a job' USING ERRCODE='P0403'; END IF;
 END IF;
 RETURN NEW;
END $$;
