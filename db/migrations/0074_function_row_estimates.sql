-- Bug 98 follow up: set functions default to an estimate of 1000 rows. In a 50 row Jobs page that made Postgres
-- expect millions of rows and JIT compile the query, costing about 1.9 s on every new connection (41 ms without).
-- These functions return one row, or a person's handful of memberships. Rollback: db/rollbacks/rollback-0074.sql
ALTER FUNCTION public.visible_assignee(uuid,uuid) ROWS 1;
ALTER FUNCTION public.visible_user(uuid) ROWS 1;
ALTER FUNCTION public.visible_job_asset(uuid,uuid) ROWS 1;
ALTER FUNCTION public.verify_api_token(text) ROWS 1;
ALTER FUNCTION public.app_memberships() ROWS 5;
