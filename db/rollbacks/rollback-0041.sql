-- Export workspace_money before rollback if entries must be retained.
DROP FUNCTION IF EXISTS company_name_exists(text);
DROP TABLE IF EXISTS workspace_money;
ALTER TABLE members DROP COLUMN is_owner,DROP COLUMN is_manager,DROP COLUMN size_added_roles;
ALTER TABLE workspaces DROP COLUMN company_size,DROP COLUMN enabled_roles,DROP COLUMN enabled_dashboards,DROP COLUMN trades,DROP COLUMN working_days,DROP COLUMN working_hours;
DELETE FROM schema_migrations WHERE name='0041_company_size.sql';
