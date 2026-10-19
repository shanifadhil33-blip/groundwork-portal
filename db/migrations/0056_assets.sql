-- CLIENT05. Equipment stays in the register when archived.
ALTER TABLE sites ADD CONSTRAINT sites_workspace_id_id_key UNIQUE(workspace_id,id);
CREATE TABLE assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 site_id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80),
 kind text NOT NULL CHECK(kind IN ('ac','water_heater','panel','pump','lift','generator','other')),
 make text CHECK(length(make)<=80), model text CHECK(length(model)<=80), serial text CHECK(length(serial)<=80),
 location text CHECK(length(location)<=120), installed_on date, notes text CHECK(length(notes)<=500),
 archived_at timestamptz, created_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id), UNIQUE(workspace_id,id,site_id),
 FOREIGN KEY(workspace_id,site_id) REFERENCES sites(workspace_id,id)
);
CREATE INDEX assets_site ON assets(workspace_id,site_id);
ALTER TABLE work_orders ADD COLUMN asset_id uuid;
ALTER TABLE work_orders ADD CONSTRAINT work_orders_asset_fk FOREIGN KEY(workspace_id,asset_id) REFERENCES assets(workspace_id,id);
-- The composite key also guards changes to a job site or to the unit site, including concurrent changes.
ALTER TABLE work_orders ADD CONSTRAINT work_orders_asset_site_fk FOREIGN KEY(workspace_id,asset_id,site_id) REFERENCES assets(workspace_id,id,site_id);
CREATE INDEX work_orders_asset ON work_orders(workspace_id,asset_id) WHERE asset_id IS NOT NULL;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets FORCE ROW LEVEL SECURITY;
CREATE POLICY assets_read ON assets FOR SELECT USING (
 is_staff(workspace_id)
 OR (my_role(workspace_id)='client' AND my_client_kind(workspace_id)='manager' AND EXISTS(SELECT 1 FROM sites s WHERE s.workspace_id=assets.workspace_id AND s.id=assets.site_id AND s.client_id=my_client(assets.workspace_id)))
 OR (my_role(workspace_id)='technician' AND EXISTS(SELECT 1 FROM work_orders w WHERE w.workspace_id=assets.workspace_id AND w.asset_id=assets.id AND w.assignee_id=app_user_id()))
);
CREATE POLICY assets_insert ON assets FOR INSERT WITH CHECK (my_role(workspace_id)='admin' OR (my_role(workspace_id)='staff' AND my_staff_kind(workspace_id) IS DISTINCT FROM 'office'));
CREATE POLICY assets_update ON assets FOR UPDATE USING (my_role(workspace_id)='admin' OR (my_role(workspace_id)='staff' AND my_staff_kind(workspace_id) IS DISTINCT FROM 'office')) WITH CHECK (my_role(workspace_id)='admin' OR (my_role(workspace_id)='staff' AND my_staff_kind(workspace_id) IS DISTINCT FROM 'office'));
DO $$ BEGIN EXECUTE format('CREATE POLICY owner_all ON assets TO %I USING (true) WITH CHECK (true)',current_user); END $$;
CREATE TRIGGER audit_assets AFTER INSERT OR UPDATE OR DELETE ON assets FOR EACH ROW EXECUTE FUNCTION capture_audit();
CREATE TRIGGER assets_updated BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION touch_work_order();
-- Household and facility staff get just the unit name through a visible job, never register access.
CREATE FUNCTION visible_job_asset(ws uuid,wo uuid) RETURNS TABLE(id uuid,name text,kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT a.id,a.name,CASE WHEN public.my_role(ws)='client' AND public.my_client_kind(ws)<>'manager' THEN NULL ELSE a.kind END
 FROM public.work_orders w JOIN public.assets a ON a.workspace_id=w.workspace_id AND a.id=w.asset_id
 WHERE w.workspace_id=ws AND w.id=wo AND (public.is_staff(ws) OR (public.my_role(ws)='technician' AND w.assignee_id=public.app_user_id()) OR (public.my_role(ws)='client' AND w.client_id=public.my_client(ws) AND (public.my_client_kind(ws)='manager' OR w.created_by=public.app_user_id())))
$$;
REVOKE ALL ON FUNCTION visible_job_asset(uuid,uuid) FROM PUBLIC;
-- Keep the existing owner cleanup order when a whole workspace is removed.
CREATE OR REPLACE FUNCTION delete_workspace_data(ws uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.my_role(ws) IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'no access' USING ERRCODE='P0404'; END IF;
 DELETE FROM public.notifications WHERE workspace_id=ws;
 DELETE FROM public.supplier_events WHERE workspace_id=ws;
 DELETE FROM public.supplier_orders WHERE workspace_id=ws;
 DELETE FROM public.import_rows WHERE workspace_id=ws;
 DELETE FROM public.imports WHERE workspace_id=ws;
 DELETE FROM public.comments WHERE workspace_id=ws;
 DELETE FROM public.work_order_events WHERE workspace_id=ws;
 DELETE FROM public.work_orders WHERE workspace_id=ws;
 DELETE FROM public.assets WHERE workspace_id=ws;
 DELETE FROM public.invites WHERE workspace_id=ws;
 DELETE FROM public.members WHERE workspace_id=ws;
 DELETE FROM public.sites WHERE workspace_id=ws;
 DELETE FROM public.clients WHERE workspace_id=ws;
 DELETE FROM public.workspaces WHERE id=ws;
END $$;
