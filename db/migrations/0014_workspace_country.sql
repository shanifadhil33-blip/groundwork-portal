-- Workspace country, region and currency, and country aware client and site records. Additive only: every
-- existing workspace becomes the United Arab Emirates and AED (all existing records are UAE), the emirate and TRN
-- already stored are copied into the new region and tax ID columns, and the old columns stay untouched so older
-- code keeps working during a deploy. Rules per country (region lists, phone plans, tax ID formats) are checked in
-- the API from lib/countries; the database only checks shape. RLS, grants and tenant scopes are table level.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'AE' CHECK (country ~ '^[A-Z]{2}$'),
  ADD COLUMN IF NOT EXISTS region text CHECK (char_length(region) BETWEEN 1 AND 120),
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'AED' CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS country text CHECK (country ~ '^[A-Z]{2}$'),
  ADD COLUMN IF NOT EXISTS billing_region text CHECK (char_length(billing_region) BETWEEN 1 AND 120),
  ADD COLUMN IF NOT EXISTS tax_id text CHECK (tax_id ~ '^[A-Z0-9/]{3,40}$');
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS region text CHECK (char_length(region) BETWEEN 1 AND 120);
UPDATE clients SET billing_region = billing_emirate WHERE billing_region IS NULL AND billing_emirate IS NOT NULL;
UPDATE clients SET tax_id = trn WHERE tax_id IS NULL AND trn IS NOT NULL;
