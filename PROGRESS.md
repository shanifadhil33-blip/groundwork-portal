# Groundwork portal — progress

## Milestone 1 — Batch 1: backend foundation

Built the minimal strict TypeScript Next.js scaffold with pnpm, pg, Zod, Auth.js beta and its pg adapter, dotenv, Vitest/tsx, and SheetJS CE 0.20.3 from the official tarball. The only application page returns plain text `Groundwork API`.

Added ordered transactional SQL migrations, migration tracking, the complete business and UUID-compatible Auth.js schema, composite tenant/client/site foreign keys, status/priority enums, FORCE RLS on every table, fixed-search-path membership helpers, restricted app grants, append-only app audit access with SECURITY DEFINER audit triggers on every business table, and an automatically populated work-order timeline. Explicit owner policies support system operations without requiring owner BYPASSRLS. The migration runner validates the separate app role's privileges and lack of role memberships.

Added transaction-scoped `withUser`/`withSystem`, owner-only migration/reset/seed scripts, environment names without secrets, and database/API documentation. The repeatable fixture reset creates Ridgeline's three clients and six sites, Dana/Sam/Priya/Omar, 60 distinct orders with spread dates/statuses/priorities, 36 comments across both visibilities, four supplier orders, and a notification. Summit has its own admin, client, site, and six orders. Larkspur has no orders.

Verified against local Postgres: `pnpm db:reset` passed repeatedly (idempotent migrations and fixture reset); `pnpm test` passed **16 tests in 1 file**; `pnpm typecheck` passed; `pnpm build` passed; `pnpm install --frozen-lockfile` passed. Tests reset the separate test schema and migrate/seed once per run, then prove client/workspace isolation, internal-comment secrecy, valid and forbidden client writes, composite FK enforcement, admin-only management, audit grants and before/after/actor capture, notification ownership, transaction context clearing, owner-only auth tables, app role restrictions, and ENABLE/FORCE RLS coverage.

Open issues: none for Batch 1. Google auth handlers, application API routes, import workflows, and supplier ingest/repair are deferred to later backend batches; no frontend styling or components were added.
