DROP TABLE IF EXISTS onboarding_actions,onboarding_progress;
DROP FUNCTION IF EXISTS onboarding_invite_info(text),onboarding_accept_invite(text,boolean),onboarding_find_company(text);
DELETE FROM schema_migrations WHERE name='0042_onboarding_progress.sql';
