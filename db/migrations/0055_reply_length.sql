-- LEARN04: personal reply length, remembered across sessions.
ALTER TABLE user_preferences
 ADD COLUMN IF NOT EXISTS reply_length text NOT NULL DEFAULT 'normal'
 CHECK (reply_length IN ('short','normal','detailed'));
