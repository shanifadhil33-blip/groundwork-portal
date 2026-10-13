-- Personal agent choices. Existing preference policies keep these private.
ALTER TABLE user_preferences
 ADD COLUMN agent_name text NULL CHECK (agent_name IS NULL OR length(agent_name) BETWEEN 1 AND 40),
 ADD COLUMN voice_enabled boolean NOT NULL DEFAULT true;
