-- Global UI translations. Additive only. Contains UI strings, no user records.
-- Rollback: db/rollbacks/rollback-0034.sql
CREATE TABLE IF NOT EXISTS ui_translations (
  lang text NOT NULL,
  source_hash text NOT NULL,
  source text NOT NULL,
  translated text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (lang, source_hash)
);
ALTER TABLE ui_translations ENABLE ROW LEVEL SECURITY; ALTER TABLE ui_translations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ui_translations_read ON ui_translations;
CREATE POLICY ui_translations_read ON ui_translations FOR SELECT USING (true);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ui_translations' AND policyname='system_owner') THEN EXECUTE format('CREATE POLICY system_owner ON ui_translations TO %I USING(true) WITH CHECK(true)', current_user); END IF; END $$;
