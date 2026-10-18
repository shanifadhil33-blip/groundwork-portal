-- DEMO20: a second demo company (Dune Harbour Technical Services) brings its own cast. Demo personas are short lowercase first names.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_demo_persona_check;
ALTER TABLE users ADD CONSTRAINT users_demo_persona_check CHECK(demo_persona ~ '^[a-z]{2,20}$');
