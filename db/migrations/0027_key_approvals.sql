-- Connect AI key actions can wait for an admin when the company asks before every action.
ALTER TABLE assistant_actions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'assistant' CHECK (source IN ('assistant','key'));
ALTER TABLE assistant_actions ADD COLUMN IF NOT EXISTS token_id uuid REFERENCES api_tokens(id) ON DELETE SET NULL;
ALTER TABLE assistant_actions ADD COLUMN IF NOT EXISTS declined_at timestamptz;
ALTER TABLE assistant_actions ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS assistant_actions_key_pending ON assistant_actions(workspace_id, created_at DESC) WHERE source='key' AND consumed_at IS NULL AND declined_at IS NULL;
