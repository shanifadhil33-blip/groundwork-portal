-- TECH08: a voice report keeps his own words and an English copy for the office. Additive only.
-- Rollback: /workspace/qa/neon-runner/rollback-0047.sql
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS report_problem_en text, ADD COLUMN IF NOT EXISTS report_work_en text, ADD COLUMN IF NOT EXISTS report_language text CHECK (report_language IS NULL OR length(report_language) <= 12);
