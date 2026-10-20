-- JOB13, JOB17, JOB18. Rollback: db/rollbacks/rollback-0064.sql
ALTER TABLE work_orders ADD COLUMN report_part text CHECK(length(report_part)<=200);
ALTER TABLE work_orders ADD COLUMN follow_up_of uuid;
ALTER TABLE work_orders ADD CONSTRAINT follow_up_parent FOREIGN KEY(workspace_id,follow_up_of) REFERENCES work_orders(workspace_id,id) ON DELETE CASCADE;
CREATE UNIQUE INDEX one_report_follow_up ON work_orders(workspace_id,follow_up_of) WHERE follow_up_of IS NOT NULL;
ALTER TABLE work_orders ADD COLUMN part_arrived_at timestamptz;
CREATE TABLE job_visits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL,
 work_order_id uuid NOT NULL, technician_id uuid NOT NULL REFERENCES users(id),
 visited_at timestamptz NOT NULL DEFAULT clock_timestamp(), photo_id uuid REFERENCES job_photos(id) ON DELETE SET NULL,
 rebooked_at timestamptz,
 FOREIGN KEY(workspace_id,work_order_id) REFERENCES work_orders(workspace_id,id) ON DELETE CASCADE
);
ALTER TABLE job_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_visits FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON job_visits TO %I USING(true) WITH CHECK(true)',current_user); END $$;
CREATE POLICY visits_read ON job_visits FOR SELECT USING(EXISTS(SELECT 1 FROM work_orders w WHERE w.workspace_id=job_visits.workspace_id AND w.id=job_visits.work_order_id));
CREATE TRIGGER audit_job_visits AFTER INSERT OR UPDATE OR DELETE ON job_visits FOR EACH ROW EXECUTE FUNCTION capture_audit();
CREATE INDEX job_visits_order ON job_visits(workspace_id,work_order_id,visited_at DESC);
ALTER TABLE notifications ADD COLUMN job_step_body text;

CREATE OR REPLACE FUNCTION guard_technician_update() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 -- Only the checked owner service can bypass the technician field guard for a confirmed return visit.
 IF current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.work_orders'::regclass)
 AND current_setting('app.return_visit',true)=OLD.id::text THEN RETURN NEW; END IF;
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

-- Persist report drafts in the existing Suggested queue. They never create jobs until approved.
ALTER TABLE job_suggestions ADD COLUMN report_follow_up_of uuid;
ALTER TABLE job_suggestions ADD CONSTRAINT report_follow_up_parent FOREIGN KEY(workspace_id,report_follow_up_of) REFERENCES work_orders(workspace_id,id) ON DELETE CASCADE;
CREATE UNIQUE INDEX one_report_draft ON job_suggestions(workspace_id,report_follow_up_of) WHERE report_follow_up_of IS NOT NULL;
