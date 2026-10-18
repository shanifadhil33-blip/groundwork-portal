-- AI12: count free AI calls per UTC day, task and provider, to cap translations and see the success rate. Additive only.
-- Rollback: /workspace/qa/neon-runner/rollback-0051.sql
CREATE TABLE IF NOT EXISTS ai_usage (
 day date NOT NULL,
 task text NOT NULL CHECK (length(task) <= 60),
 provider text NOT NULL CHECK (length(provider) <= 120),
 ok integer NOT NULL DEFAULT 0,
 failed integer NOT NULL DEFAULT 0,
 PRIMARY KEY (day, task, provider)
);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON ai_usage TO %I USING(true) WITH CHECK(true)',current_user); END $$;
