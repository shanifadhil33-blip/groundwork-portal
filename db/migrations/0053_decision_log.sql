-- AGENT05 decision log: a card the person said no to and a change the Agent was not allowed to make are saved too,
-- with the reason, and every confirmed change keeps the job or record as it was after. Additive only.
-- Rollback: db/rollbacks/rollback-0053.sql
ALTER TABLE assistant_actions ADD COLUMN IF NOT EXISTS after jsonb;
ALTER TABLE assistant_actions ADD COLUMN IF NOT EXISTS reason text CHECK (reason IS NULL OR length(reason) <= 400);
-- Drop the old outcome check whatever its name, so only the new one applies.
DO $$ DECLARE n text; BEGIN
 FOR n IN SELECT conname FROM pg_constraint WHERE conrelid='assistant_actions'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%outcome%' LOOP
  EXECUTE format('ALTER TABLE assistant_actions DROP CONSTRAINT %I',n);
 END LOOP;
END $$;
ALTER TABLE assistant_actions ADD CONSTRAINT assistant_actions_outcome_check CHECK (outcome IS NULL OR outcome IN ('done','failed','declined','refused'));
CREATE INDEX IF NOT EXISTS assistant_actions_said_no ON assistant_actions(workspace_id, user_id, declined_at DESC) WHERE outcome IN ('declined','refused');
