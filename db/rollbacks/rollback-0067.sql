ALTER TABLE clients DROP COLUMN IF EXISTS contract_archived_at;
ALTER TABLE supplier_orders DROP COLUMN IF EXISTS archived_at;
ALTER TABLE company_documents DROP COLUMN IF EXISTS archived_at;
ALTER TABLE work_orders
 DROP COLUMN IF EXISTS running_late_at,
 DROP COLUMN IF EXISTS gate_pass_by,
 DROP COLUMN IF EXISTS gate_pass_at,
 DROP COLUMN IF EXISTS gate_pass,
 DROP COLUMN IF EXISTS window_hours;
