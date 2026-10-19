-- SET05 and JOB20: hours a contract client is promised that someone reaches the site. Admin sets it like the other contract fields. Additive only.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_response_hours integer CHECK (contract_response_hours BETWEEN 1 AND 168);
