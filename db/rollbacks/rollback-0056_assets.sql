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
 DELETE FROM public.invites WHERE workspace_id=ws;
 DELETE FROM public.members WHERE workspace_id=ws;
 DELETE FROM public.sites WHERE workspace_id=ws;
 DELETE FROM public.clients WHERE workspace_id=ws;
 DELETE FROM public.workspaces WHERE id=ws;
END $$;
DROP FUNCTION IF EXISTS visible_job_asset(uuid,uuid);
ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_asset_site_fk;
ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_asset_fk;
DROP TABLE IF EXISTS assets;
ALTER TABLE work_orders DROP COLUMN IF EXISTS asset_id;
ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_workspace_id_id_key;
