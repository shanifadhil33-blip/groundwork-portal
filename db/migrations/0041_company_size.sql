ALTER TABLE workspaces ADD COLUMN company_size text NOT NULL DEFAULT 'big' CHECK(company_size IN ('small','big')),
 ADD COLUMN enabled_roles text[] NOT NULL DEFAULT ARRAY['owner','manager','admin','staff','office','technician'],
 ADD COLUMN enabled_dashboards text[] NOT NULL DEFAULT ARRAY['overview','work','schedule','team','documents','queue','suggestions','clients','import','supplier'],
 ADD COLUMN trades text[] NOT NULL DEFAULT '{}',
 ADD COLUMN working_days integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
 ADD COLUMN working_hours jsonb NOT NULL DEFAULT '{"start":"08:00","end":"17:00"}';
ALTER TABLE members ADD COLUMN is_owner boolean NOT NULL DEFAULT false,
 ADD COLUMN is_manager boolean NOT NULL DEFAULT false,
 ADD COLUMN size_added_roles text[] NOT NULL DEFAULT '{}',
 ADD CONSTRAINT owner_admin CHECK(NOT is_owner OR role='admin'),
 ADD CONSTRAINT manager_supervisor CHECK(NOT is_manager OR role IN ('admin','staff'));
-- Existing admins keep all their permissions. The first admin becomes an owner.
UPDATE members m SET is_owner=true WHERE m.role='admin' AND m.user_id=(SELECT m2.user_id FROM members m2 WHERE m2.workspace_id=m.workspace_id AND m2.role='admin' AND m2.archived_at IS NULL ORDER BY m2.created_at,m2.user_id LIMIT 1);
ALTER TABLE workspaces ADD CONSTRAINT enabled_roles_valid CHECK(enabled_roles <@ ARRAY['owner','manager','admin','staff','office','technician']::text[] AND 'owner'=ANY(enabled_roles) AND 'admin'=ANY(enabled_roles)),
 ADD CONSTRAINT dashboards_valid CHECK(enabled_dashboards <@ ARRAY['overview','work','schedule','team','documents','queue','suggestions','clients','import','supplier']::text[]);
-- Ledger entries are explicit amounts, never inferred costs.
CREATE TABLE workspace_money (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 direction text NOT NULL CHECK(direction IN ('in','out')),amount numeric(14,2) NOT NULL CHECK(amount>=0),
 currency text NOT NULL CHECK(length(currency)=3),note text NOT NULL DEFAULT '',created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE workspace_money ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_money FORCE ROW LEVEL SECURITY;
CREATE POLICY money_admin ON workspace_money USING(my_role(workspace_id)='admin') WITH CHECK(my_role(workspace_id)='admin' AND created_by=app_user_id());

CREATE FUNCTION company_name_exists(company text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.workspaces WHERE lower(trim(name))=lower(trim(company)) AND NOT is_demo)
$$;
REVOKE ALL ON FUNCTION company_name_exists(text) FROM PUBLIC;
