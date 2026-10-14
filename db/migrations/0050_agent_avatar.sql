-- LEARN20: each person picks an avatar for their Agent: robots, animals or icons, never human faces. Additive only.
-- Rollback: /workspace/qa/neon-runner/rollback-0050.sql
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS agent_avatar text CHECK (agent_avatar IS NULL OR agent_avatar IN ('bot','cat','dog','bird','fish','rabbit','turtle','squirrel','leaf','wrench','sun'));
