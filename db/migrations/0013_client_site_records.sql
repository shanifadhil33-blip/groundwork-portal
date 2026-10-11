-- Client and site records: contact, billing and access details. Additive and nullable, so existing rows and
-- older code keep working. Row level security, grants and tenant scopes are unchanged (table level).
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS contact_name text CHECK (char_length(contact_name) BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS phone text CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  ADD COLUMN IF NOT EXISTS email text CHECK (char_length(email) <= 320 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  ADD COLUMN IF NOT EXISTS billing_building text CHECK (char_length(billing_building) BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS billing_street text CHECK (char_length(billing_street) BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS billing_area text CHECK (char_length(billing_area) BETWEEN 1 AND 120),
  ADD COLUMN IF NOT EXISTS billing_city text CHECK (char_length(billing_city) BETWEEN 1 AND 120),
  ADD COLUMN IF NOT EXISTS billing_emirate text CHECK (billing_emirate IN ('Abu Dhabi','Dubai','Sharjah','Ajman','Umm Al Quwain','Ras Al Khaimah','Fujairah')),
  ADD COLUMN IF NOT EXISTS trn text CHECK (trn ~ '^100[0-9]{12}$'),
  ADD COLUMN IF NOT EXISTS notes text CHECK (char_length(notes) BETWEEN 1 AND 2000);
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS building text CHECK (char_length(building) BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS area text CHECK (char_length(area) BETWEEN 1 AND 120),
  ADD COLUMN IF NOT EXISTS access_notes text CHECK (char_length(access_notes) BETWEEN 1 AND 2000),
  ADD COLUMN IF NOT EXISTS contact_name text CHECK (char_length(contact_name) BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS contact_phone text CHECK (contact_phone ~ '^\+[1-9][0-9]{7,14}$');
