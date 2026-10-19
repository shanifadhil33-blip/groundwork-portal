ALTER TABLE workspaces
 ADD COLUMN visit_charge numeric(10,2) CHECK (visit_charge >= 0 AND visit_charge <= 100000),
 ADD COLUMN visit_charge_regions jsonb NOT NULL DEFAULT '{}',
 ADD COLUMN visit_charge_sample boolean NOT NULL DEFAULT false;
ALTER TABLE job_suggestions ADD COLUMN visit_charge_shown numeric(10,2);
