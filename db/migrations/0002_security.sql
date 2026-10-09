REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$ SELECT nullif(current_setting('app.user_id',true),'')::uuid $$;
-- Owned by the migration role, with an explicit owner policy under FORCE RLS.
-- Definer helpers avoid recursive membership RLS; no dynamic SQL is accepted.
CREATE FUNCTION my_role(ws uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$ SELECT role FROM public.members WHERE workspace_id=ws AND user_id=public.app_user_id() $$;
CREATE FUNCTION my_client(ws uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$ SELECT client_id FROM public.members WHERE workspace_id=ws AND user_id=public.app_user_id() $$;
CREATE FUNCTION is_member(ws uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$ SELECT public.my_role(ws) IS NOT NULL $$;
CREATE FUNCTION is_staff(ws uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$ SELECT coalesce(public.my_role(ws) IN ('admin','staff'),false) $$;
CREATE FUNCTION capture_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE old_row jsonb; new_row jsonb; row_data jsonb; ws uuid;
BEGIN
 IF TG_OP <> 'INSERT' THEN old_row=to_jsonb(OLD); END IF;
 IF TG_OP <> 'DELETE' THEN new_row=to_jsonb(NEW); END IF;
 row_data=coalesce(new_row,old_row);
 ws=CASE WHEN TG_TABLE_NAME='workspaces' THEN (row_data->>'id')::uuid ELSE (row_data->>'workspace_id')::uuid END;
 INSERT INTO public.audit_log(workspace_id,actor_id,action,entity,entity_id,"before","after") VALUES(ws,public.app_user_id(),lower(TG_OP),TG_TABLE_NAME,(row_data->>'id')::uuid,old_row,new_row);
 RETURN NULL;
END $$;
CREATE FUNCTION touch_work_order() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TRIGGER work_order_updated BEFORE UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION touch_work_order();
CREATE FUNCTION record_work_order_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
 INSERT INTO public.work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body) VALUES(NEW.workspace_id,NEW.client_id,NEW.id,public.app_user_id(),'created','Request created');
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
 INSERT INTO public.work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body) VALUES(NEW.workspace_id,NEW.client_id,NEW.id,public.app_user_id(),'status_changed','Status changed to '||NEW.status);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER work_order_timeline AFTER INSERT OR UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION record_work_order_event();
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE members FORCE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites FORCE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments FORCE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites FORCE ROW LEVEL SECURITY;
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports FORCE ROW LEVEL SECURITY;
ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_rows FORCE ROW LEVEL SECURITY;
ALTER TABLE supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE supplier_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_events FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE work_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_events FORCE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE verification_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_token FORCE ROW LEVEL SECURITY;
CREATE TRIGGER audit_workspaces AFTER INSERT OR UPDATE OR DELETE ON workspaces FOR EACH ROW EXECUTE FUNCTION capture_audit();
CREATE TRIGGER audit_members AFTER INSERT OR UPDATE OR DELETE ON members FOR EACH ROW EXECUTE FUNCTION capture_audit();
CREATE TRIGGER audit_clients AFTER INSERT OR UPDATE OR DELETE ON clients FOR EACH ROW EXECUTE FUNCTION capture_audit();
CREATE TRIGGER audit_sites AFTER INSERT OR UPDATE OR DELETE ON sites FOR EACH ROW EXECUTE FUNCTION capture_audit();
CREATE TRIGGER audit_work_orders AFTER INSERT OR UPDATE OR DELETE ON work_orders FOR EACH ROW EXECUTE FUNCTION capture_audit();
CREATE TRIGGER audit_comments AFTER INSERT OR UPDATE OR DELETE ON comments FOR EACH ROW EXECUTE FUNCTION capture_audit();
CREATE TRIGGER audit_invites AFTER INSERT OR UPDATE OR DELETE ON invites FOR EACH ROW EXECUTE FUNCTION capture_audit();
CREATE TRIGGER audit_imports AFTER INSERT OR UPDATE OR DELETE ON imports FOR EACH ROW EXECUTE FUNCTION capture_audit();
CREATE TRIGGER audit_import_rows AFTER INSERT OR UPDATE OR DELETE ON import_rows FOR EACH ROW EXECUTE FUNCTION capture_audit();
CREATE TRIGGER audit_supplier_orders AFTER INSERT OR UPDATE OR DELETE ON supplier_orders FOR EACH ROW EXECUTE FUNCTION capture_audit();
CREATE TRIGGER audit_supplier_events AFTER INSERT OR UPDATE OR DELETE ON supplier_events FOR EACH ROW EXECUTE FUNCTION capture_audit();
CREATE TRIGGER audit_notifications AFTER INSERT OR UPDATE OR DELETE ON notifications FOR EACH ROW EXECUTE FUNCTION capture_audit();
CREATE TRIGGER audit_work_order_events AFTER INSERT OR UPDATE OR DELETE ON work_order_events FOR EACH ROW EXECUTE FUNCTION capture_audit();
CREATE POLICY workspaces_read ON workspaces FOR SELECT USING (is_member(id));
CREATE POLICY workspaces_insert ON workspaces FOR INSERT WITH CHECK (my_role(id)='admin');
CREATE POLICY workspaces_update ON workspaces FOR UPDATE USING (my_role(id)='admin') WITH CHECK (my_role(id)='admin');
CREATE POLICY workspaces_delete ON workspaces FOR DELETE USING (my_role(id)='admin');
CREATE POLICY members_read ON members FOR SELECT USING (is_staff(workspace_id));
CREATE POLICY members_insert ON members FOR INSERT WITH CHECK (my_role(workspace_id)='admin');
CREATE POLICY members_update ON members FOR UPDATE USING (my_role(workspace_id)='admin') WITH CHECK (my_role(workspace_id)='admin');
CREATE POLICY members_delete ON members FOR DELETE USING (my_role(workspace_id)='admin');
CREATE POLICY clients_read ON clients FOR SELECT USING ((is_staff(workspace_id) OR (my_role(workspace_id)='client' AND id=my_client(workspace_id))));
CREATE POLICY clients_insert ON clients FOR INSERT WITH CHECK (my_role(workspace_id)='admin');
CREATE POLICY clients_update ON clients FOR UPDATE USING (my_role(workspace_id)='admin') WITH CHECK (my_role(workspace_id)='admin');
CREATE POLICY clients_delete ON clients FOR DELETE USING (my_role(workspace_id)='admin');
CREATE POLICY sites_read ON sites FOR SELECT USING ((is_staff(workspace_id) OR (my_role(workspace_id)='client' AND client_id=my_client(workspace_id))));
CREATE POLICY sites_insert ON sites FOR INSERT WITH CHECK (my_role(workspace_id)='admin');
CREATE POLICY sites_update ON sites FOR UPDATE USING (my_role(workspace_id)='admin') WITH CHECK (my_role(workspace_id)='admin');
CREATE POLICY sites_delete ON sites FOR DELETE USING (my_role(workspace_id)='admin');
CREATE POLICY work_orders_read ON work_orders FOR SELECT USING ((is_staff(workspace_id) OR (my_role(workspace_id)='client' AND client_id=my_client(workspace_id))));
CREATE POLICY work_orders_insert ON work_orders FOR INSERT WITH CHECK (((is_staff(workspace_id) AND created_by=app_user_id()) OR ((my_role(workspace_id)='client' AND client_id=my_client(workspace_id)) AND created_by=app_user_id() AND source='client' AND status='open' AND assignee_id IS NULL AND scheduled_for IS NULL)));
CREATE POLICY work_orders_update ON work_orders FOR UPDATE USING (is_staff(workspace_id)) WITH CHECK (is_staff(workspace_id));
CREATE POLICY work_orders_delete ON work_orders FOR DELETE USING (is_staff(workspace_id));
CREATE POLICY comments_read ON comments FOR SELECT USING ((is_staff(workspace_id) OR ((my_role(workspace_id)='client' AND client_id=my_client(workspace_id)) AND visibility='client')));
CREATE POLICY comments_insert ON comments FOR INSERT WITH CHECK (((is_staff(workspace_id) OR ((my_role(workspace_id)='client' AND client_id=my_client(workspace_id)) AND visibility='client')) AND author_id=app_user_id()));
CREATE POLICY comments_update ON comments FOR UPDATE USING (is_staff(workspace_id)) WITH CHECK (is_staff(workspace_id));
CREATE POLICY comments_delete ON comments FOR DELETE USING (is_staff(workspace_id));
CREATE POLICY invites_read ON invites FOR SELECT USING (is_staff(workspace_id));
CREATE POLICY invites_insert ON invites FOR INSERT WITH CHECK (my_role(workspace_id)='admin');
CREATE POLICY invites_update ON invites FOR UPDATE USING (my_role(workspace_id)='admin') WITH CHECK (my_role(workspace_id)='admin');
CREATE POLICY invites_delete ON invites FOR DELETE USING (my_role(workspace_id)='admin');
CREATE POLICY imports_read ON imports FOR SELECT USING (is_staff(workspace_id));
CREATE POLICY imports_insert ON imports FOR INSERT WITH CHECK (is_staff(workspace_id));
CREATE POLICY imports_update ON imports FOR UPDATE USING (is_staff(workspace_id)) WITH CHECK (is_staff(workspace_id));
CREATE POLICY imports_delete ON imports FOR DELETE USING (is_staff(workspace_id));
CREATE POLICY import_rows_read ON import_rows FOR SELECT USING (is_staff(workspace_id));
CREATE POLICY import_rows_insert ON import_rows FOR INSERT WITH CHECK (is_staff(workspace_id));
CREATE POLICY import_rows_update ON import_rows FOR UPDATE USING (is_staff(workspace_id)) WITH CHECK (is_staff(workspace_id));
CREATE POLICY import_rows_delete ON import_rows FOR DELETE USING (is_staff(workspace_id));
CREATE POLICY supplier_orders_read ON supplier_orders FOR SELECT USING (is_staff(workspace_id));
CREATE POLICY supplier_orders_insert ON supplier_orders FOR INSERT WITH CHECK (my_role(workspace_id)='admin');
CREATE POLICY supplier_orders_update ON supplier_orders FOR UPDATE USING (my_role(workspace_id)='admin') WITH CHECK (my_role(workspace_id)='admin');
CREATE POLICY supplier_orders_delete ON supplier_orders FOR DELETE USING (my_role(workspace_id)='admin');
CREATE POLICY supplier_events_read ON supplier_events FOR SELECT USING (is_staff(workspace_id));
CREATE POLICY supplier_events_insert ON supplier_events FOR INSERT WITH CHECK (my_role(workspace_id)='admin');
CREATE POLICY supplier_events_update ON supplier_events FOR UPDATE USING (my_role(workspace_id)='admin') WITH CHECK (my_role(workspace_id)='admin');
CREATE POLICY supplier_events_delete ON supplier_events FOR DELETE USING (my_role(workspace_id)='admin');
CREATE POLICY audit_log_read ON audit_log FOR SELECT USING ((my_role(workspace_id)='admin' OR (my_role(workspace_id)='staff' AND actor_id=app_user_id())));
CREATE POLICY notifications_read ON notifications FOR SELECT USING ((is_member(workspace_id) AND user_id=app_user_id()));
CREATE POLICY notifications_update ON notifications FOR UPDATE USING ((is_member(workspace_id) AND user_id=app_user_id())) WITH CHECK ((is_member(workspace_id) AND user_id=app_user_id()));
CREATE POLICY work_order_events_read ON work_order_events FOR SELECT USING ((is_staff(workspace_id) OR (my_role(workspace_id)='client' AND client_id=my_client(workspace_id))));
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- FORCE RLS applies to owners too. A narrowly assigned owner policy permits
-- owner-only system jobs and definer helpers without requiring BYPASSRLS.
DO $$
DECLARE t text;
BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'schema_migrations' LOOP
  EXECUTE format('CREATE POLICY system_owner ON %I TO %I USING (true) WITH CHECK (true)',t,current_user);
 END LOOP;
END $$;
