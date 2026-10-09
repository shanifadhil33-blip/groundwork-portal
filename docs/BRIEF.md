# Codex brief: Groundwork portal (BACKEND ONLY)

Read docs/PLAN.md fully. This repo is Adhil Shanif's personal portfolio project. Work ONLY inside /workspace/portal.
Never touch, clone, or reference any other repo or project.

## Scope this phase
BACKEND ONLY. No UI pages, components, styling or palette work. A single minimal `app/page.tsx` returning plain text "Groundwork API" is allowed so Next builds. Everything else is SQL, server code, route handlers, and tests.

## Stack (fixed, $0)
- Next.js (App Router, TypeScript, strict) — route handlers under `app/api/**/route.ts`. pnpm.
- Postgres via `pg` (node-postgres). Raw SQL migrations in `db/migrations/NNNN_name.sql`, applied in order by `scripts/migrate.ts` (tracks applied files in a `schema_migrations` table) using DATABASE_URL_OWNER. Works unchanged on Neon later.
- The app connects as a NON-OWNER role (`APP_DB_ROLE`, default `portal_app`, NOBYPASSRLS). Migrations GRANT it only what it needs. Every table has RLS ENABLED and FORCED.
- Per-request context: `withUser(userId, fn)` in `lib/db.ts` opens a transaction on the app pool, runs `select set_config('app.user_id', $1, true)`, then fn(client). Never query tenant data outside it. A separate `withSystem(fn)` (owner pool) is only for migrations, seeding, auth adapter tables, webhook ingest and cron where documented.
- SQL helpers (SECURITY DEFINER, `set search_path`): `app_user_id()`, `my_role(ws uuid)`, `my_client(ws uuid)`, `is_member(ws uuid)`, `is_staff(ws uuid)` (admin or staff).
- Auth: Auth.js v5 (`next-auth@beta`) with Google provider and `@auth/pg-adapter` (users, accounts, sessions, verification_token tables per the adapter's schema, in a migration). `lib/auth.ts`. A `getSessionUserId()` helper used by every route. Tests must NOT need Google: route handlers call a thin `requireUser(req)` that in tests can be satisfied by injecting a user id (e.g. a test-only auth resolver set via `setAuthResolverForTests`). Never enable a header bypass in production (guard on NODE_ENV==='test').
- Zod for every request body and query. Uniform JSON errors: `{ error: { code, message, fields? } }` with plain human messages (no raw DB/provider text). 401 unauthenticated, 404 for "not found OR no access" (neutral, never reveal existence), 403 only for role-forbidden actions on records the user can already see, 409 conflicts, 422 validation.
- Times stored as timestamptz; API returns ISO strings. Workspace has a `timezone` column (default 'Asia/Dubai') for later display.
- Vitest. Tests run against the real local Postgres using TEST_DATABASE_URL_OWNER (to reset schema: drop & recreate `public` schema contents, run migrations, seed) and TEST_DATABASE_URL (app role) for all assertions. `pnpm test` must work from a clean state. Load env from `.env.local` (dotenv). Run tests serially (single fork) to avoid DB races.
- Secrets only in `.env.local` (gitignored, already exists — read it, never print its values, never commit it). Maintain `.env.example` with names only.
- XLSX parsing: SheetJS CE from the official tarball: `pnpm add https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. CSV also via SheetJS.
- AI: `lib/ai.ts` provider chain Gemini REST (generateContent, models gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-2.5-flash-lite, responseMimeType application/json) then Groq (`openai/gpt-oss-120b`, OpenAI-compatible chat completions), skip a provider without a key, skip to next on 429/5xx/403/404, max output tokens ~2000. If all fail or none configured, return `{ available:false }` and the flow still works. Never surface raw provider text. Tests mock fetch.

## Package scripts
`dev`, `build`, `typecheck` (tsc --noEmit), `lint` optional, `db:migrate`, `db:seed`, `db:reset` (migrate + seed on DATABASE_URL_OWNER), `test`.

## Working rules
- Commit after each batch with a clear message (git is initialized; do not add remotes, do not push).
- Append a milestone section to PROGRESS.md at the end of each batch: what was built, how verified, test counts, open issues.
- Keep docs/API.md listing every route: method, path, roles allowed, body/query, responses.
- Run `pnpm typecheck` and `pnpm test` before finishing a batch; fix failures.
