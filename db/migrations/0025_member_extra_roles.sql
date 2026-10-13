-- Fluid roles: a person keeps one main role (the highest they hold) plus extra roles below it, for example an admin who
-- also does jobs. Permissions are the union, which is the main role because admin covers supervisor covers technician;
-- the extra technician role adds the worker side: My day, My jobs, and a place in assignment suggestions. Additive only.
-- Rollback: /workspace/qa/neon-runner/rollback-0025.sql
ALTER TABLE members ADD COLUMN IF NOT EXISTS extra_roles text[] NOT NULL DEFAULT '{}' CHECK (extra_roles <@ ARRAY['staff','technician']::text[]);
