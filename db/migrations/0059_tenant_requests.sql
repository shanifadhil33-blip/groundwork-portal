ALTER TABLE job_suggestions
 ADD COLUMN tenant_unit text CHECK (char_length(tenant_unit) <= 40),
 ADD COLUMN tenant_name text CHECK (char_length(tenant_name) <= 80),
 ADD COLUMN tenant_phone text CHECK (char_length(tenant_phone) <= 30 AND tenant_phone ~ '^\+?[0-9][0-9 ]*$');
ALTER TABLE work_orders
 ADD COLUMN tenant_unit text CHECK (char_length(tenant_unit) <= 40),
 ADD COLUMN tenant_name text CHECK (char_length(tenant_name) <= 80),
 ADD COLUMN tenant_phone text CHECK (char_length(tenant_phone) <= 30 AND tenant_phone ~ '^\+?[0-9][0-9 ]*$');
