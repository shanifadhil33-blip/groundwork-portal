# Database operations

Use `pnpm db:reset` to apply pending migrations and replace all development data with fictional fixtures. It connects only through `DATABASE_URL_OWNER`; `pnpm db:seed` also resets the entire fixture database, including auth tables. These commands are for development, never a populated production database. `pnpm db:migrate` applies unapplied numbered SQL files without resetting data.

The app login (`APP_DB_ROLE`, default `portal_app`) must already be provisioned with its own password on managed Postgres. A migration owner with role-creation permission can create a missing NOLOGIN role, which still needs separate login provisioning. The migration runner rejects administrative app privileges and all app role memberships. Keep the app role separate from the schema owner.

Every table has ENABLE and FORCE RLS. Explicit policies assigned to the migration owner allow seeding, auth adapter operations, and SECURITY DEFINER membership/audit/timeline functions to work even when the owner has no BYPASSRLS privilege. The app role receives no access to auth tables, no schema CREATE, no TRUNCATE, and only SELECT on the audit log and timeline. Notifications allow SELECT plus UPDATE of read_at only. Supplier mutations require admin; internal import records require staff or admin.

Tenant access goes through `withUser(userId, fn)`, which sets transaction-local app.user_id, commits or rolls back, and releases the connection. `withSystem(fn)` is reserved for migrations/seed, Auth.js adapter operations, and later documented webhook/cron jobs. No identity means zero tenant rows. Never expose arbitrary user ids or owner queries through route inputs.

Auth.js adapter columns follow the [official pg adapter schema](https://authjs.dev/getting-started/adapters/pg), with UUID keys replacing SERIAL and corresponding UUID userId foreign keys. Auth tables have no app policies or grants. Google auth routes are outside Batch 1.

`pnpm test` requires separate TEST_DATABASE_URL_OWNER and TEST_DATABASE_URL databases. Global setup refuses the development database, resets only the test public schema, migrates and seeds once. Tests run serially in one fork; assertions use the app connection. Secrets stay in the ignored .env.local file.

Milestone 2 adds FORCE-RLS `idempotency_keys`, scoped to the current user; the app has SELECT/INSERT only. Narrow SECURITY DEFINER functions bootstrap a workspace/admin membership, accept a matching invite capability, delete a confirmed workspace's dependent data, remove a member's assignments/notifications, and expose only permitted identity/assignee fields. They read identity from transaction-local context and use fixed search paths; they do not accept a caller user id. Regular tenant services continue to use only the app connection. Auth adapter operations continue to use the owner pool. New status notifications run in an owner-policy trigger alongside existing audit/timeline triggers. Work-order versions advance monotonically with millisecond precision. Invite acceptance stores `accepted_by` and uses row locks for replay and state transitions.

Test global setup resets/migrates the separate test database once; each serial test file reseeds its fixtures so results do not depend on file order.
