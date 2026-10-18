-- Remove Dune Harbour sandboxes first (none exist where DEMO_DUNE_HARBOUR is unset), then restore the Ridgeline persona list.
SELECT delete_demo_workspace(id) FROM workspaces WHERE is_demo AND name='Dune Harbour Technical Services';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_demo_persona_check;
ALTER TABLE users ADD CONSTRAINT users_demo_persona_check CHECK(demo_persona IN ('imran','sam','ravi','pranav','omar','bilal','anil','nabil','kevin','faisal'));
DELETE FROM schema_migrations WHERE name='0052_demo_company_personas.sql';
