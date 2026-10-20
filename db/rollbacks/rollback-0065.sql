DROP TABLE IF EXISTS whatsapp_messages;
DROP TABLE IF EXISTS phone_changes;
ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS usual_areas_size;
ALTER TABLE user_preferences DROP COLUMN IF EXISTS usual_areas, DROP COLUMN IF EXISTS usual_start;
