-- Suggested work stays separate from jobs until an admin or supervisor accepts it.
CREATE TABLE job_suggestions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 source text NOT NULL CHECK(source IN ('agent','client','household','technician','whatsapp')),
 sender_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 sender_name text NOT NULL CHECK(length(trim(sender_name))>0), sender_phone text,
 client_id uuid, site_id uuid, from_work_order_id uuid,
 title text NOT NULL CHECK(length(trim(title))>0), problem text NOT NULL DEFAULT '',
 priority work_order_priority NOT NULL DEFAULT 'normal', preferred_window text,
 photo_ids jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(photo_ids)='array'), voice_note_text text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined')),
 decline_reason text, work_order_id uuid, decided_by uuid REFERENCES users(id), decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,client_id) REFERENCES clients(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,client_id,site_id) REFERENCES sites(workspace_id,client_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,from_work_order_id) REFERENCES work_orders(workspace_id,id) ON DELETE SET NULL (from_work_order_id),
 FOREIGN KEY(workspace_id,work_order_id) REFERENCES work_orders(workspace_id,id) ON DELETE SET NULL (work_order_id),
 CHECK(site_id IS NULL OR client_id IS NOT NULL),
 CHECK(status<>'declined' OR (decline_reason IS NOT NULL AND length(trim(decline_reason))>0)),
 CHECK(status='pending' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX job_suggestions_pending ON job_suggestions(workspace_id,status,created_at DESC);
ALTER TABLE job_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_suggestions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON job_suggestions TO %I USING(true) WITH CHECK(true)',current_user); END $$;
CREATE POLICY suggestions_read ON job_suggestions FOR SELECT USING(is_staff(workspace_id) OR (is_member(workspace_id) AND sender_user_id=app_user_id()));
CREATE POLICY suggestions_insert ON job_suggestions FOR INSERT WITH CHECK(
 status='pending' AND work_order_id IS NULL AND decided_by IS NULL AND decided_at IS NULL AND
 (is_staff(workspace_id) OR (sender_user_id=app_user_id() AND
 ((my_role(workspace_id)='client' AND source IN ('client','household','agent') AND client_id=my_client(workspace_id) AND EXISTS(SELECT 1 FROM sites s WHERE s.workspace_id=job_suggestions.workspace_id AND s.id=job_suggestions.site_id AND s.client_id=job_suggestions.client_id))
 OR (my_role(workspace_id)='technician' AND source IN ('technician','agent') AND my_job_site(workspace_id,site_id)))))
);
CREATE POLICY suggestions_update ON job_suggestions FOR UPDATE USING(is_staff(workspace_id) AND my_staff_kind(workspace_id) IS DISTINCT FROM 'office') WITH CHECK(is_staff(workspace_id) AND my_staff_kind(workspace_id) IS DISTINCT FROM 'office');
REVOKE ALL ON job_suggestions FROM PUBLIC;
-- Clients and technicians submit suggestions, never jobs directly.
ALTER POLICY work_orders_insert ON work_orders WITH CHECK(is_staff(workspace_id) AND (created_by=app_user_id() OR EXISTS(SELECT 1 FROM job_suggestions s WHERE s.workspace_id=work_orders.workspace_id AND s.sender_user_id=work_orders.created_by AND s.client_id=work_orders.client_id AND s.site_id=work_orders.site_id AND s.status='pending')));
CREATE FUNCTION notify_suggestion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO public.notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title)
  SELECT user_id,NEW.workspace_id,'suggestion_received','job_suggestions',NEW.id,NEW.sender_user_id,NEW.sender_name,NEW.title
  FROM public.members WHERE workspace_id=NEW.workspace_id AND archived_at IS NULL AND (role='admin' OR (role='staff' AND staff_kind IS DISTINCT FROM 'office')) AND user_id IS DISTINCT FROM public.app_user_id();
 ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.sender_user_id IS NOT NULL THEN
  INSERT INTO public.notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title,to_status)
  SELECT NEW.sender_user_id,NEW.workspace_id,'suggestion_decided',CASE WHEN NEW.status='approved' THEN 'work_orders' ELSE 'job_suggestions' END,coalesce(NEW.work_order_id,NEW.id),public.app_user_id(),coalesce(u.name,'Your team'),NEW.title,NEW.status
  FROM public.users u JOIN public.members m ON m.user_id=NEW.sender_user_id AND m.workspace_id=NEW.workspace_id AND m.archived_at IS NULL WHERE u.id=public.app_user_id();
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER suggestion_notification AFTER INSERT OR UPDATE ON job_suggestions FOR EACH ROW EXECUTE FUNCTION notify_suggestion();
REVOKE ALL ON FUNCTION notify_suggestion() FROM PUBLIC;
-- Reuses the job photo format for drafts that do not have a job yet.
CREATE TABLE shared_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, suggestion_id uuid,
 mime text NOT NULL CHECK(mime IN ('image/jpeg','image/webp')), bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 100 AND 614400),
 width integer NOT NULL CHECK(width BETWEEN 1 AND 4000), height integer NOT NULL CHECK(height BETWEEN 1 AND 4000), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id), FOREIGN KEY(workspace_id,suggestion_id) REFERENCES job_suggestions(workspace_id,id) ON DELETE CASCADE
);
ALTER TABLE shared_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_photos FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON shared_photos TO %I USING(true) WITH CHECK(true)',current_user); END $$;
CREATE POLICY shared_photos_read ON shared_photos FOR SELECT USING(is_member(workspace_id) AND (uploaded_by=app_user_id() OR EXISTS(SELECT 1 FROM job_suggestions s WHERE s.workspace_id=shared_photos.workspace_id AND s.id=shared_photos.suggestion_id)));
CREATE POLICY shared_photos_insert ON shared_photos FOR INSERT WITH CHECK(is_member(workspace_id) AND uploaded_by=app_user_id() AND suggestion_id IS NULL);
CREATE POLICY shared_photos_update ON shared_photos FOR UPDATE USING(is_member(workspace_id) AND uploaded_by=app_user_id() AND suggestion_id IS NULL) WITH CHECK(uploaded_by=app_user_id() AND EXISTS(SELECT 1 FROM job_suggestions s WHERE s.workspace_id=shared_photos.workspace_id AND s.id=shared_photos.suggestion_id AND (s.sender_user_id=app_user_id() OR (s.source='whatsapp' AND is_staff(s.workspace_id) AND my_staff_kind(s.workspace_id) IS DISTINCT FROM 'office'))));
REVOKE ALL ON shared_photos FROM PUBLIC;
