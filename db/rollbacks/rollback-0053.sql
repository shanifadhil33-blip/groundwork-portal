-- Rollback for 0053_decision_log.sql: removes the said no and not allowed rows, then the new columns.
BEGIN;
DROP INDEX IF EXISTS assistant_actions_said_no;
DELETE FROM assistant_actions WHERE outcome IN ('declined','refused');
ALTER TABLE assistant_actions DROP CONSTRAINT IF EXISTS assistant_actions_outcome_check;
ALTER TABLE assistant_actions ADD CONSTRAINT assistant_actions_outcome_check CHECK (outcome IS NULL OR outcome IN ('done','failed'));
ALTER TABLE assistant_actions DROP COLUMN IF EXISTS reason;
ALTER TABLE assistant_actions DROP COLUMN IF EXISTS after;
DELETE FROM schema_migrations WHERE name='0053_decision_log.sql';
COMMIT;
