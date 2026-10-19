ALTER TABLE workspaces ADD COLUMN owner_handover text[] NOT NULL DEFAULT '{}'
 CHECK (owner_handover <@ ARRAY['approval_mode','payments']::text[]);
