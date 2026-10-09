# Groundwork portal — progress

## Milestone 1 — Batch 1: backend foundation

Built the minimal strict TypeScript Next.js scaffold with pnpm, pg, Zod, Auth.js beta and its pg adapter, dotenv, Vitest/tsx, and SheetJS CE 0.20.3 from the official tarball. The only application page returns plain text `Groundwork API`.

Added ordered transactional SQL migrations, migration tracking, the complete business and UUID-compatible Auth.js schema, composite tenant/client/site foreign keys, status/priority enums, FORCE RLS on every table, fixed-search-path membership helpers, restricted app grants, append-only app audit access with SECURITY DEFINER audit triggers on every business table, and an automatically populated work-order timeline. Explicit owner policies support system operations without requiring owner BYPASSRLS. The migration runner validates the separate app role's privileges and lack of role memberships.

Added transaction-scoped `withUser`/`withSystem`, owner-only migration/reset/seed scripts, environment names without secrets, and database/API documentation. The repeatable fixture reset creates Ridgeline's three clients and six sites, Dana/Sam/Priya/Omar, 60 distinct orders with spread dates/statuses/priorities, 36 comments across both visibilities, four supplier orders, and a notification. Summit has its own admin, client, site, and six orders. Larkspur has no orders.

Verified against local Postgres: `pnpm db:reset` passed repeatedly (idempotent migrations and fixture reset); `pnpm test` passed **16 tests in 1 file**; `pnpm typecheck` passed; `pnpm build` passed; `pnpm install --frozen-lockfile` passed. Tests reset the separate test schema and migrate/seed once per run, then prove client/workspace isolation, internal-comment secrecy, valid and forbidden client writes, composite FK enforcement, admin-only management, audit grants and before/after/actor capture, notification ownership, transaction context clearing, owner-only auth tables, app role restrictions, and ENABLE/FORCE RLS coverage.

Open issues: none for Batch 1. Google auth handlers, application API routes, import workflows, and supplier ingest/repair are deferred to later backend batches; no frontend styling or components were added.

## Milestone 2 — Batch 2: auth, tenancy, roles, and core API

Built Auth.js v5 Google sign-in with the pg adapter and database sessions, thin App Router handlers, and independently callable services for identity, workspace onboarding/settings/deletion, dashboard, clients/sites, memberships, explicit invite acceptance/revocation, work-order lists/details/creation/updates, and comments. The test auth resolver is guarded by NODE_ENV and no production header bypass exists.

Added uniform JSON errors and Zod validation, scoped search/filter/sort with total counts and page/cursor pagination, SHA-256-only invite storage with seven-day expiry and matching-email acceptance, parent-row locking for last-admin protection, and FORCE-RLS request replay storage with concurrent-key locking. Invite replay reconstructs its capability using HMAC and AUTH_SECRET without persisting a plaintext token. New narrow definer functions support onboarding/acceptance and dependency-safe workspace/member deletion while tenant services keep using the app role. Workspace deletion preserves audit history; member deletion clears assignments and recipient notifications while retaining work history.

Work-order updates validate staff/admin assignees and documented workflow transitions, lock rows, and enforce If-Match/updated_at versions with strictly increasing millisecond timestamps. Status changes atomically create timeline/audit events and requester/assignee notifications. Client writes force their company/source and reject staff-controlled fields; client details contain only client-visible comments. Priya PATCH on an accessible Harbor & Pine order is explicitly **403**; a hidden Northgate order is **404**.

Updated docs/API.md with every route, permissions, bodies, responses, errors, transitions and replay behavior, and expanded database documentation. Each serial test file now reseeds independently, and Vitest resolves the Auth.js ESM dependencies without mocking application services.

Verified against real local Postgres: pnpm typecheck, pnpm test (**44 tests in 2 files: 28 API/service tests plus 16 original RLS tests**), and pnpm build pass. Coverage includes all requested tenancy/role/invite/conflict/replay/pagination/auth cases, concurrent replay, full lifecycle notifications to a client requester, populated-workspace deletion with audit retention, and assigned-member removal. Applied the new migration to the development database with pnpm db:migrate.

Open issues: no known Batch 2 implementation failures. Live Google OAuth has not been exercised with an interactive Google account; automated auth coverage uses the guarded test resolver. Cursor pagination uses offsets and may shift under concurrent list changes; idempotency records currently have no expiry, both documented. Later import/supplier/notification-management workflows remain for subsequent batches. Backend only; no UI changes. No commit attempted because .git is read-only and the user will commit.
