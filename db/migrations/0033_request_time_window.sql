-- ROLE09 household: the time window the person who raised a request prefers for the visit, in his own words. Additive only.
-- Rollback: /workspace/qa/neon-runner/rollback-0033.sql
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS preferred_window text CHECK (preferred_window IS NULL OR length(preferred_window) <= 200);
