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
 CHECK(status<>'declined' OR length(trim(decline_reason))>0),
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
