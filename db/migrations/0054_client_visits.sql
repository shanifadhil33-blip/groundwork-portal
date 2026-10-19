-- Rollback: db/rollbacks/rollback-0054.sql
-- HOME05 and HOME07 require persisted preferences and a travel marker. Additive only.
ALTER TABLE work_orders ADD COLUMN preferred_technician_id uuid REFERENCES users(id);
ALTER TABLE job_suggestions ADD COLUMN preferred_technician_id uuid REFERENCES users(id);
ALTER TABLE work_orders ADD COLUMN on_way_at timestamptz;

-- Extend the existing technician guard only for his first travel marker.
CREATE OR REPLACE FUNCTION guard_technician_update() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.my_role(OLD.workspace_id)='technician' THEN
  IF NEW.on_way_at IS DISTINCT FROM OLD.on_way_at THEN
   IF OLD.on_way_at IS NOT NULL OR NEW.on_way_at IS NULL OR OLD.status<>'scheduled' OR OLD.assignee_id IS DISTINCT FROM public.app_user_id()
     OR (to_jsonb(NEW)-'on_way_at'-'updated_at')<>(to_jsonb(OLD)-'on_way_at'-'updated_at') THEN
    RAISE EXCEPTION 'Only the assigned technician can start travel for a scheduled visit' USING ERRCODE='P0403';
   END IF;
   NEW.on_way_at=now();
   RETURN NEW;
  END IF;
  IF (to_jsonb(NEW)-'status'-'updated_at'-'report_problem'-'report_work'-'report_outcome'-'report_at'-'report_by')<>(to_jsonb(OLD)-'status'-'updated_at'-'report_problem'-'report_work'-'report_outcome'-'report_at'-'report_by') THEN RAISE EXCEPTION 'Technicians can only change the status of their own jobs' USING ERRCODE='P0403'; END IF;
  IF NEW.report_by IS DISTINCT FROM OLD.report_by AND NEW.report_by IS DISTINCT FROM public.app_user_id() THEN RAISE EXCEPTION 'Technicians sign only their own report' USING ERRCODE='P0403'; END IF;
  IF NEW.status='cancelled' THEN RAISE EXCEPTION 'Ask a supervisor to cancel a job' USING ERRCODE='P0403'; END IF;
 END IF;
 RETURN NEW;
END $$;
