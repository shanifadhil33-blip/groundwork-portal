CREATE OR REPLACE FUNCTION guard_technician_update() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.my_role(OLD.workspace_id)='technician' THEN
  IF (to_jsonb(NEW)-'status'-'updated_at'-'report_problem'-'report_work'-'report_outcome'-'report_at'-'report_by')<>(to_jsonb(OLD)-'status'-'updated_at'-'report_problem'-'report_work'-'report_outcome'-'report_at'-'report_by') THEN RAISE EXCEPTION 'Technicians can only change the status of their own jobs' USING ERRCODE='P0403'; END IF;
  IF NEW.report_by IS DISTINCT FROM OLD.report_by AND NEW.report_by IS DISTINCT FROM public.app_user_id() THEN RAISE EXCEPTION 'Technicians sign only their own report' USING ERRCODE='P0403'; END IF;
  IF NEW.status='cancelled' THEN RAISE EXCEPTION 'Ask a supervisor to cancel a job' USING ERRCODE='P0403'; END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER TABLE work_orders DROP COLUMN IF EXISTS on_way_at;
ALTER TABLE job_suggestions DROP COLUMN IF EXISTS preferred_technician_id;
ALTER TABLE work_orders DROP COLUMN IF EXISTS preferred_technician_id;
