-- Removes only personal agent choices.
ALTER TABLE user_preferences DROP COLUMN IF EXISTS agent_name, DROP COLUMN IF EXISTS voice_enabled;
