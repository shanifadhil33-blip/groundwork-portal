DROP INDEX IF EXISTS one_report_draft;
ALTER TABLE job_suggestions DROP COLUMN IF EXISTS report_follow_up_of;
DROP TABLE IF EXISTS job_visits;
DROP INDEX IF EXISTS one_report_follow_up;
ALTER TABLE work_orders DROP COLUMN IF EXISTS report_part, DROP COLUMN IF EXISTS follow_up_of, DROP COLUMN IF EXISTS part_arrived_at;
ALTER TABLE notifications DROP COLUMN IF EXISTS job_step_body;

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
