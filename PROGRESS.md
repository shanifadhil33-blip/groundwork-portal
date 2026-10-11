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

## Milestone 3 — Batch 3: spreadsheet import, validation, approval queue, AI drafts

Built backend services in `lib/services/imports.ts`, SheetJS CSV/XLSX parsing and fuzzy column guessing in `lib/import/parse.ts`, shared row validation in `lib/import/validate.ts`, and optional provider fallback in `lib/ai.ts`. Added thin import/upload/list/detail/mapping/rows/error-report/queue/drafts routes, pending queue listing, approve/edit/reject/undo/bulk routes, and signed-in AI health. Added the fictional 40-row sample CSV, verified its production build asset tracing, and documented all routes and behavior in docs/API.md.

Migration 0004 adds workspace-scoped content hashes, original headers/rows/mapping, uploaded/mapped/queued/completed stages, validation warnings/status, queue eligibility and rejection timestamps. Existing FORCE RLS policies and audit triggers remain in use. Client roles consistently receive neutral 404 on import/queue access; cross-workspace records remain hidden. Multipart/file size and 500-row limits return plain filename/limit messages. Content dedupe is serialized per workspace with explicit force re-upload. Validation covers required titles, matching client/site names or addresses, priority defaults/warnings, timezone-aware dates, file duplicates, open-order title/site duplicates and external references. Error CSV escapes cells and spreadsheet formula prefixes. Dashboard counts only queued pending rows.

Queueing is idempotent and excludes error rows. Approval takes workspace and row locks, rechecks duplicates, and atomically creates one source=import work order with its row link; repeated/concurrent approval returns the same order. Bulk is atomic, staff-limited to 25 and admin-limited to 500. Rejection requires a reason; undo is available for ten minutes and can reopen a completed import. The sample reaches exactly **35 created, 2 rejected**, with the three validation errors excluded.

AI drafts process at most 25 queued pending rows per call, validate known ids/140-character summaries/priorities with Zod, and mark stored values as suggestions without applying them automatically. The chain tries three configured Gemini models then Groq, skips missing keys, handles timeouts/errors/invalid responses and exposes only a plain unavailable message. Provider calls run outside tenant transactions; subsequent writes take the workspace lock and recheck pending state, so late AI cannot modify approved/rejected rows. Health responses contain only configured provider/model identifiers and ok/error statuses.

Verified against real local Postgres: **pnpm typecheck, pnpm test (72 tests across 4 files), and pnpm build all pass**. The 28 new tests cover sample end-to-end, XLSX/UTF-8 CSV, size/row limits, all validation/dedupe cases, concurrent upload/approval races, queue replay, edit validation, reject/undo/expiry, bulk authorization/atomic rollback, pagination, every import/queue route's client and Summit-staff isolation, CSV downloads, audit capture, mocked Gemini-to-Groq fallback, provider outages, malformed/invalid AI items, signed-in sanitized health, batches and late AI storage. Applied migration 0004 to the development database. Updated the existing populated-workspace fixture to mark its pending queue row explicitly queued.

Open issues: no known Batch 3 implementation failures. Live AI providers were not called; provider behavior is verified with mocked fetch and gracefully degrades when unavailable. Live Google OAuth remains as previously noted. Bulk approval rolls back the whole batch if any row fails validation, documented in API.md. Backend only; no frontend changes. No commit attempted; .git remains untouched.

## Milestone 4 — Batch 4: supplier sync, webhooks, reconciler, repair

Built migration 0005 and separate FORCE-RLS Cobalt source state/order/event tables with monotonically increasing per-workspace sequences, dropped-event metadata and a simulated outage flag. Cobalt is explicitly labeled “simulated supplier, part of this repo” in source comments and relevant API responses. Added simulator/signature modules and supplier service, thin supplier orders/check/repair/sync-runs/advance/events/outage routes, signed webhook ingest and bearer-protected GET/POST cron. Admin/staff placement is the explicit requested exception to staff's otherwise read-only supplier access; clients and other-workspace users get neutral 404. Manual privileged operations recheck membership in their system transaction and preserve audit attribution. No UI or Git changes were made.

Webhooks verify HMAC-SHA256 over timestamp plus raw JSON before parsing, use constant-time comparison, reject timestamps outside five minutes, and deduplicate by globally unique event_id. Simulator placement and advance commit independent source state before delivering a signed request through the same in-process ingest entry point. Receipts track source sequence and ignore older updates; terminal statuses never regress. Delivery resumes waiting_on_parts → in_progress through the existing status timeline/audit/notification triggers. Check compares source status/stream to portal projections without business writes. Repair applies missing receipts via reconcile, heals projection drift, writes “Repaired by sync” timeline/audit records, and serializes against concurrent repair/webhooks with workspace locks. Repeat repair and late webhooks create no business audit/events/notifications.

Added persisted manual/cron check/repair runs with finished counts and sanitized errors; failures roll back business writes while preserving an error run. Dashboard last sync now uses finished runs. Daily Vercel cron checks and repairs every workspace with supplier orders, including demos, and isolates per-workspace errors. The seed keeps four supplier orders and creates one already-dropped delivered event for the fourth order, yielding one fresh-demo mismatch. Updated API/database documentation, including every route, errors, transition behavior, system access and concurrency. Existing environment names already cover both secrets; no secret values or .env.local changes were made.

Verification: **pnpm typecheck and pnpm build pass**. Isolated executable signature checks pass for valid/missing/bad/stale/future signatures and equal/unequal-length comparisons. Added **23 supplier test cases** (including parameterized cases), for an expected **95 total cases across 5 files**; these cover signature/payload rejection, duplicate/out-of-order ingest, source cursors, dropped detection, read-only check, repair audit/timeline/notifications, repeat/concurrent repair, late delivery, projection drift, outage/error run, transitions/placement, route roles/RLS, cron and secret-free responses. **Database tests have not executed in this environment**, so these are authored case counts, not passing counts.

Open verification blockers: `pnpm db:migrate` is rejected by the sandbox with EPERM while tsx creates its IPC socket. Running the same migration entry point with `node --import tsx scripts/migrate.ts` avoids that IPC dependency but also fails with EPERM connecting to local Postgres on port 5432. `pnpm test` fails during global database setup for the same blocked Postgres connection, before executing tests. No permission escalation is available. Consequently migration 0005 is not yet applied to the development DB and the real-Postgres supplier suite remains unverified; rerun the requested migration/test commands in an environment that permits local database sockets. Build/typecheck do not establish runtime SQL correctness. Existing dev data is not reset automatically; the new mismatch fixture appears on the next authorized seed/reset. Live OAuth remains unverified as in previous batches. Backend only; .git untouched.

Verification update (run outside the Codex sandbox, Oct 10): `pnpm db:migrate` applied 0005 to the development DB, `pnpm db:reset` passed, and the real-Postgres suite passed **95 tests in 5 files** (23 new supplier tests). `pnpm typecheck` and `pnpm build` pass. The blockers above are resolved.

## Milestone 5 — Batch 5: audit log, notifications, settings

Built backend-only audit list/detail services and thin GET routes with actor/action/entity/id/date filters, newest/oldest ordering, total counts and scoped page/cursor pagination. Verified the existing RLS policy already gives admins workspace-wide access, staff only their own actor rows, and clients no audit access. Added human status summaries and recursive snapshot secret/token redaction. Audit remains read-only; real app-role tests prove INSERT, UPDATE and DELETE are denied.

Added current-user notification listing, unread filtering/counts, cross-workspace unread totals and breakdown, read/unread and idempotent read-all routes. Existing recipient-plus-membership RLS enforces ownership, and app updates remain restricted to read_at. Link targets are returned only when the referenced work order is still visible under RLS. No synthetic notification producers or seed spam were added.

Migration 0006 adds FORCE-RLS personal preferences with system/light/dark theme, email_notifications, nullable IANA timezone override and updated_at, plus notification entity metadata/index and narrowly scoped self-profile read/name-update permissions. Added GET/PATCH preferences and PATCH profile. Workspace settings GET/PATCH reuse Batch 2's settings service and audit trigger, with trimmed names limited to 1–80 characters and Intl timezone validation. Existing workspace deletion is reused without duplication. Staff/client settings writes consistently return 403; all members may read name/timezone. Personal preferences/profile are excluded from workspace audit because they have no workspace scope.

Updated docs/API.md and docs/DATABASE.md with every added route, permissions, fields, defaults, validation, pagination, grants and reuse decisions. Added tests/audit-notifications-settings.test.ts with **10 new tests**, covering admin/staff/client/Summit audit isolation, direct RLS assertions, filters/pages/cursors/redaction, denied audit mutations, earlier business write audit coverage (work-order create/update, comments, client/site create/update/delete, invite create/revoke, member role change, import approve/reject/undo, supplier repair, workspace settings), notification counts/read/unread/read-all/idempotence/cross-user/cross-workspace access/link visibility, preferences/default/dark persistence/isolation/validation, profile and audited workspace settings.

Verification against reachable real local Postgres: **pnpm db:migrate, pnpm typecheck, pnpm test (105 passed tests across 6 files), and pnpm build all passed**. An initial pagination test fixture had only one workspace notification; corrected the test fixture to contain two and reran the full checks successfully. Migration applied without resetting development data. No UI changes, commits, .git writes or secret output.

Open issues: no known Batch 5 failures. Audit has no stored result column, so result filtering is unsupported and returns 422, documented. Feed cursors use offsets and can shift under concurrent changes, matching the existing pagination approach. Notification targets currently support work orders, matching existing event producers; other entity targets safely return null. Email notification preference is stored for future delivery; no email is sent. Live Google OAuth remains unverified as documented in previous batches.

## Milestone 6 — Batch 6: demo sandbox

Built backend-only per-visitor demo start, persona switch, confirmed reset, app-role isolation evidence and bearer-protected cleanup routes, plus GET /api/workspaces. `lib/fixture.ts` now supplies both development seed and demo creation: real Ridgeline/Summit fixtures retain stable ids/counts, while every visitor receives fresh random ids, three clients/six sites/60 orders with relative dates, both comment visibilities, four supplier/source orders with one dropped delivery, a pending import row and three event notifications. Demo personas have reserved non-routable emails and no Google accounts. Creation/session/fixture data commit in one transaction; failures return plain retryable errors.

Migration 0007 adds demo identity/binding, owner-only FORCE-RLS hashed-IP rate records and expiry indexing. Stable stored persona keys survive profile-name changes. Invite services/DB triggers reject demo target addresses and invites into sandboxes. DB membership triggers forbid real/demo mixing and cross-sandbox membership, accounts reject demo identities, and session expiry is capped to the sandbox deadline. Demo management is blocked by both services and narrow DB wrappers/triggers; renamed privileged implementations have no app grants. Auth.js and demo entry share the cookie configuration; request authentication uses the real pg adapter session lookup and checks sandbox expiry. Google callbacks also reject demo identities/reserved emails without treating provider ids as UUIDs.

Switch rotates sessions inside the same workspace. Confirmed reset atomically deletes/replaces the sandbox with a new workspace id, keeps the persona and extends expiry by 24 hours. Owner-only cleanup reuses ordered workspace deletion, removes demo audit/idempotency history and dependent users/sessions/preferences/Cobalt rows, preserves live demos and real workspaces, and returns actual deleted counts. Daily demo cleanup is added at 04:00 UTC; existing supplier cron remains at 03:00 UTC and now skips demos so the repair scenario remains available. Start opportunistically cleans up ten expired sandboxes. Global lifecycle locking enforces the configurable live cap (default 200) and five starts/hour/IP hash without concurrency overshoot.

Updated API/database docs, environment names and cron configuration. Added tests/demo.test.ts with **12 tests**, using real issued cookies and the Auth.js pg adapter rather than the identity resolver for demo sessions. Coverage includes fixture/session counts, two-visitor and real-user RLS isolation, switch/reset invalidation, real app-role Priya evidence and staff cross-workspace evidence, dropped supplier repair/idempotence, expired-only cleanup/counts/idempotence, blocked invite/workspace/member actions, DB mixed/cross-sandbox membership/account guards, denied owner-helper access, rate/cap responses and cap concurrency, cron auth and atomic rollback/retry after fixture failure.

Verified on reachable local Postgres: **pnpm db:migrate, pnpm typecheck, pnpm test (117 passed tests in 7 files), and pnpm build all pass**. Migration 0007 is applied to development; its management trigger/public function grants were reconciled after review. No UI, components/styles, .git writes, commits, or secret output.

Open issues: no known Batch 6 test failures. Live Google OAuth remains unverified as in earlier batches. Trusted per-IP extraction is configured for Vercel; non-Vercel/local requests intentionally share a conservative local rate bucket until that host supplies a trusted peer integration, documented in API.md. Demo reset changes workspace and record ids; demo audit history is intentionally disposable. Public demo AI/provider usage follows existing optional fallback behavior; no live provider calls were made.

## Milestone 7 — Batch 7: agent-ready (MCP server, API tokens, assistant)

Built migration 0008 with FORCE-RLS personal API tokens and ten-minute assistant action staging, plus audit actor_kind/via_token_id/via_token_name snapshots. Tokens use 32 random bytes, gw_ prefix and SHA-256-only storage; plaintext is returned once, never stored in audit/replay data. Session-only creation/list/revoke supports own tokens and admin workspace listing/revocation, idempotent revoke, optional real-user expiry and mandatory sandbox expiry caps. Narrow app-pool capability verification checks current membership, revocation, expiry and demo deadline; last-used tracking is throttled and attributed to the token user, restoring any caller context. Cascades integrate demo cleanup/reset and workspace/user deletion.

Built POST/GET/DELETE /api/mcp with installed official SDK 1.32.1 McpServer and WebStandardStreamableHTTPServerTransport, a fresh stateless server/transport per request and package version. Shared lib/agent/tools.ts exposes eleven tools: work-order list/detail/create/status/comment, queue list/approve/reject, dashboard, visible sites and whoami. All tenant paths use existing services or inWorkspace/withUser, the non-owner app role and RLS. Write calls reject read-scoped tokens with the exact plain read-only message before validation; all tools remain discoverable. Status changes require optimistic versions. Token writes preserve actor identity and mark agent/token attribution; session audit behavior remains user.

Built session/demo POST assistant with the same registry, native Gemini/Groq function calling using the existing model chain, ten-second provider timeouts, key skipping, sanitized failures, 2,000 output tokens per turn and four bounded tool iterations. Reads run immediately; writes only create reviewable server-side pending actions. Confirmation rechecks user/workspace/current permissions, locks the pending action, executes stored arguments and consumes it in the same app-role transaction; concurrent/repeated confirms cannot double-write. Confirmed writes mark assistant attribution, and confirmations work with no providers configured. No-provider/all-fail responses use the required available:false message. No UI, dependencies, secret values or Git changes were introduced.

Updated API/database docs with routes, scopes/roles, token lifetime rules, audit attribution, assistant confirmations and remote HTTP/stdio/curl MCP examples. .env.example already includes all needed names, so no new variables were added. Added tests/agent.test.ts against real local Postgres and actual MCP Web Request handlers with mocked AI providers: one-time/hash-only issuance, safe listing, revocation/expiry/member removal/demo caps/cleanup, protocol initialize/discovery/calls, Priya/client/tenant/comment isolation, each read-only write rejection, staff writes/queue actions/optimistic versions, audit identities and context restoration, live demo session assistant use, provider fallback/unavailability, read loops, deferred writes, atomic concurrent/provider-free confirmation, replay/expiry/other-user/workspace failures and client forbidden confirmation.

Verification: **pnpm db:migrate, pnpm typecheck, pnpm test (151 passed tests across 8 files, including all original 117), and pnpm build pass**. Development migration is applied; the token verification helper was refreshed after attribution review without resetting development data. Final review found no tenant-data owner shortcuts in tool paths, plaintext/hash response leaks or pooled attribution leakage. No commits attempted; .git remains untouched.

Open issues: live Google OAuth and AI providers remain unverified interactively; automated provider tests use mocked fetch. Per-token MCP rate limiting is skipped and documented. Stateless GET SSE is closed at request completion; no persistent server push or resumability. Expired assistant action rows remain until workspace/user deletion; no cancel/pruning job yet. Deployment and UI remain the next phase.

## Backend complete

Batches 1–7 now provide the strict Next.js backend scaffold, eight ordered SQL migrations, non-owner app access and FORCE RLS, Auth.js Google database sessions, onboarding/tenancy/roles/clients/sites/invites, searchable and versioned work orders/comments/timeline, dashboard, CSV/XLSX staging/validation/approval/undo/bulk approval and optional AI drafts, Cobalt simulated supplier/signature/webhook/reconciliation/repair/crons, audit/notifications/preferences/settings, isolated per-visitor demo sandboxes/rotation/reset/cleanup, and personal-token MCP access plus a confirmation-based in-app assistant. Final verified count: **151 tests in 8 files**; migration, typecheck, full tests and production build all pass locally. Backend only, with no UI work or Git mutations.

### What the frontend needs next

- Create the Neon project, configure separate non-owner DATABASE_URL and migration-owner DATABASE_URL_OWNER, and run all migrations there. Keep app role NOBYPASSRLS and provision the login credentials separately from migration SQL.
- Create the GitHub repository under Adhil's personal account and upload/commit the reviewed backend from a writable Git environment.
- Create the Vercel project, set production environment variables privately, and enable the existing daily supplier/demo cleanup crons in vercel.json.
- Create Google OAuth client ID/secret, configure AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET, and add the production redirect URI `https://<your-deployment>/api/auth/callback/google`.
- Generate private AUTH_SECRET, CRON_SECRET and COBALT_WEBHOOK_SECRET values and configure them in deployment secret storage; never commit them.
- Obtain optional Gemini/Groq free keys and configure GEMINI_API_KEY/GROQ_API_KEY; verify the model chain and quotas live. Approval and pending-action confirmation continue without AI.
- Follow the UI milestones in docs/PLAN.md: sign-in/app shell and onboarding; work-order lifecycle/list/detail/forms and client home; import/mapping/validation/queue; supplier check/repair; audit/notifications/team/settings/dark mode; public landing/demo picker/isolation/reset; then live account/client tap-through, mobile/desktop accessibility and final screenshots/README/case study/portfolio review. Apply the latest neutral professional visual direction in PLAN.md. Add token management and assistant proposal/confirm states against the documented backend contracts.

## Frontend batch 1 — foundation, shell, and entry flows

Built neutral light/dark design tokens, self-hosted Geist through next/font, global hover/pressed/focus/touch/reduced-motion rules, and a no-flash light/dark/system provider synchronized with personal API preferences. Added small typed components under components/ui: buttons with fixed-width busy states, icon tooltips, badges/cards, shaped skeletons, empty/error states, portal toasts with Undo, trapped/locked dialogs, draggable phone sheets, custom keyboard menus/selects, calendar date picker, tabs, and hydration-safe browser-local times.

Added a persistent responsive signed-in shell with remembered sidebar collapse, visible workspace/client and role, phone navigation/drawer, account menu, real notification counts and a working read/unread/read-all list with Undo. Demo switch/reset and confirmed, busy-locked sign-out use the real session APIs; the only additive API is POST /api/auth/sign-out, using Auth.js signOut({redirect:false}). Added workspace onboarding, explicit invite acceptance, minimal real-count dashboard/client home, and working profile/appearance settings. Future-batch navigation stays hidden until its screens exist. Demo cards use the backend's exact keys and stored first names (Dana, Sam, Priya, Omar), rather than inventing surnames.

Replaced the API text page with a static product landing page, added demo entry and POST Google sign-in with safe callback paths/error copy, October 2026 privacy/terms, neutral no-access/404 pages, route loading/error boundaries, metadata, viewport safe areas, and an SVG icon. Existing API routes, auth/service behavior, RLS, secrets, and .git are unchanged.

Verified: pnpm typecheck, pnpm test (**159 passed across 10 files; all 151 existing tests plus 8 new helper/sign-out tests**), and pnpm build all pass. Dev curl checks returned **200/200/200/200/200/404** with real HTML for /, /demo, /sign-in, /privacy, /terms, and a random missing route. Chromium checks covered public pages at 320/390/430px without overflow, real Dana/Sam/Priya/Omar demo sessions and role-scoped counts, demo error/Retry, switch/reset, notification read/Undo, theme persistence after reload, profile save, phone sheet spring-back/dismiss, modal/menu Escape, busy Cancel/Escape locks, fixed-width sign-out, session termination (subsequent /api/me = 401), and desktop sidebar persistence. Production browser checks with the local host explicitly trusted also passed; no browser runtime errors were observed. Development/production QA servers were stopped.

Sign-out additionally checks that the original session is invalidated, catching silent Auth.js failures. Local production QA needs AUTH_TRUST_HOST=true; deployed Auth.js must trust its configured host.

Open verification: interactive Google OAuth with a real Google account has not been exercised. Full work-order/client workflows, imports, supplier tools, audit/team settings, token management, and assistant UI remain assigned to later frontend batches; their navigation is intentionally omitted here.

## Frontend batch 2 — provider dashboard and work-order lifecycle

Extended the batch 1 shell and UI primitives with provider Dashboard, Work orders, and Clients navigation; responsive list/detail/new/edit/client routes and shaped loading screens. Dashboard status counts, overdue, waiting on parts, approval count, recent activity, supplier sync and real-account setup checklist have independent loading/error/Retry states. Status and work-count links open URL-filtered work orders; pending approval rows are labeled separately because they are not yet work orders. The three-step checklist reports progress and persists dismissal per real workspace.

Built debounced search, custom status/client/priority/assignee filters, removable chips, all supported sort fields/directions with title ties, URL pagination and counts, desktop clickable rows, phone cards, cached Back/scroll restoration and detail prefetch. Existing API pages are gathered before presentation sorting and overdue filtering, preserving backend contracts. Detail supports valid lifecycle transitions, terminal-action confirmation, version-safe assignment/schedule/status updates, exact stale-conflict copy with Reload, supplier summaries, distinct client comments/internal notes, retained failed comments and actor/local-time activity. Reversible assignment/schedule transitions and client/site edits offer Undo.

Added labeled new/edit forms with dependent client/site dropdowns, blur/live validation, mapped server errors, busy Save, unchanged edit protection, success toasts/navigation, per-user/workspace saved drafts, in-app/browser Back discard protection and beforeunload confirmation. Extended dropdown/date-picker primitives with field labeling, invalid-state and disabled support. Client and site remain fixed in edit because the PATCH contract does not permit moving a work order. Clients include independent site/user counts, admin client/site creation/editing, client users, invite create/copy/check/revoke and all invite statuses, explicit no-email copy, and confirmed member role/removal controls with last-admin protection. Staff are read-only; demo invite/member management remains read-only as enforced by the server. API/service behavior, RLS, secrets and .git remain unchanged.

Verified final code: **pnpm typecheck, pnpm test (163 passed across 11 files: all 159 prior tests plus 4 presentation-logic tests), and pnpm build pass**. A fresh Sam staff session was issued by POST /api/demo/start using curl with a cookie jar. Dev curl checks returned **200 with real HTML and no error-boundary text** for Dashboard, list, detail, new, edit, Clients and client detail. Local demo rate limiting was already exhausted for the shared local IP; QA used the existing Vercel request-IP path with a fictional test IP, without changing environment files or backend behavior.

Production Chromium checks passed desktop workflows and 320/390/430px overflow checks, filtered in-app Back, no-results/Clear filters, work-order creation/status/internal comments, pristine edit Save, browser Back/Keep editing, stale conflict/Reload, retained failed comments, independent dashboard failure/Retry, native beforeunload/draft restore, assignment Undo, and stable dark-theme detail rendering. A temporary session for the seeded real Dana fixture also verified phone invite create/copy/Copied/revoke, role change and restoration, and a temporary real empty workspace's 0-of-3 → 2-of-3 checklist/dismissal without demo data/banner; the workspace and temporary session were removed. No browser runtime errors were observed. Dev and production QA servers were stopped.

Open limitations: interactive Google OAuth remains unverified as in batch 1. Existing list APIs use id ties and do not expose overdue filtering, so the frontend gathers matching pages for global title ties/overdue; very large workspaces would benefit from an additive server query in a later performance pass. Approval/import workflow screens remain assigned to the next batch. This environment's dev HMR repeatedly reloaded during Chromium checks; the requested dev/curl checks passed and signed-in interaction checks ran against the successful production build.

## Frontend batch 3 — client home and request detail

Added the client-facing Home (components/app/client-home.tsx): company heading, "New request", up to six open requests with plain client status wording (e.g. "Waiting on parts — we've ordered what's needed"), counts, recent updates, and independent loading/empty/error/Retry states. Clients get a "Requests" nav item reusing the list with client wording. Request detail for clients shows status, priority, site, schedule, description and client-visible comments only: internal notes are filtered (visibleComments), raw timeline bodies are replaced by safe client event labels (clientEvent), and assignee, edit, status-change, assignment/schedule and Cobalt supplier panels plus the internal-note toggle are staff-only (members/supplier requests are not even issued for clients). Client comments are always sent as client-visible. The new-request form for clients loads sites from a narrow additive GET /api/workspaces/[ws]/request-sites (client role only, scoped to the member's own client by RLS + client_id). The shell blocks provider-only paths (dashboard, import/queue, supplier, clients, audit, work-order edit) for client users with the neutral no-access screen.

Added the demo isolation check screen (/isolation, client demo personas only): shows the database role (now returned by isolation-check as database_role), portal role, client, the exact parameterized Northgate query, 0 rows for Priya, and the cross-workspace 0-row query.

Verified: **pnpm typecheck, pnpm test (166 passed across 12 files; 3 new client-ui tests covering client wording/comment filtering, provider-path guard, and request-sites scoping incl. 403/404), and pnpm build pass**. A planned Codex review pass could not run because the ChatGPT Plus usage limit was reached (resets 6:56 PM Dubai, Oct 10); the interrupted run's code was reviewed manually for client data gating before commit. Open: signed-in Priya/Omar browser tap-through at 390px is still to be done live.

## Frontend batch 4 — spreadsheet imports and approval queue

Added `/import`, `/import/[id]`, and `/queue` with route skeletons. Upload supports CSV/XLSX, drag/drop, sample files, plain limit errors, duplicate detection and explicit forced imports. Import details include custom column mapping, counted/filterable/paginated validation previews, error CSV downloads, excluded rows, locked mapping after queueing, and completion results linked to work orders.

Approval review uses a desktop list/detail layout and the existing draggable phone sheet. Added labeled edit/approve validation, required rejection reasons, optimistic removal with rollback, server-deadline Undo toasts and recent-rejection actions, page checkboxes, counted bulk confirmation with staff-limit copy, status filters, optional per-import draft summaries and calm unavailable notices. Added provider navigation with a pending-count badge and corrected the dashboard approval link. Existing client shell guard remains intact. Backend services, API handlers, database/RLS, auth and secrets are unchanged; no commit or push.

Verification: `pnpm typecheck` and `pnpm build` pass. Added eight pure presentation tests; **16 tests in three isolated frontend test files pass** (import, UI helpers, work-order UI). The requested `pnpm typecheck && pnpm test && pnpm build` stops in unchanged global database setup: sandbox connections to both localhost Postgres addresses on port 5432 fail with EPERM, before any full-suite tests execute. Build was run separately and passed. The 166 existing tests plus eight new tests cannot be certified as a passing full suite here. Attempted mocked-API Chromium checks, but browser startup is also blocked by sandbox socket restrictions (Crashpad setsockopt EPERM); interactive browser and 390px verification remain unconfirmed.

## Frontend batch 5 — supplier, audit, notifications, settings, agent access, assistant

Added `/supplier` and `/audit` with route loading skeletons and provider navigation in the sidebar and phone More sheet. Supplier shows portal/source orders with mismatch highlights, last sync and run history, admin-only Check and confirmed Repair with counts and “Nothing changed” on repeat, and secondary admin demo controls for valid supplier transitions, dropped webhooks and outage/restore. Staff supplier access remains read-only. Audit supports actor, action, entity, inclusive local date range, sort and pagination, and loads the separate detail API in a desktop drawer / phone sheet. API-token activity shows “via AI agent: <token name>”; assistant activity shows “via assistant”. There is no via-agent API filter, so no unsupported query was added.

Extended the existing notifications component with desktop popover / phone sheet presentation, visible-work-order links, read/unread, workspace-wide mark-all-read (including unread items on other pages), busy locks and unread-count refresh. Extended shared dialogs with desktop drawer/popover variants while preserving keyboard focus, Escape, and phone header-only swipe dismissal; scrolling inner content cannot initiate dismissal.

Replaced Settings with deep-linkable `?tab=` Profile, Appearance, Workspace, Members & invites (admin only), and Agent access tabs. Profile edits name, personal timezone and future email preference. Appearance reuses API persistence and the pre-paint theme script; the shell waits for preference synchronization before revealing account screens. Reviewed existing screen colors: surfaces, text, controls and status colors use light/dark CSS tokens; added a shared backdrop token. Workspace settings are admin-editable and read-only for other members. Reused the existing Team component with confirmed role changes/removal and last-admin protection; added all-role invite creation with client selection, copy links and confirmed revocation. Demo member/invite management stays read-only as required by the API.

Agent access creates named read/write keys with API-compatible optional expiry, presents the secret only once in a transient Copy dialog (never persisted by the UI), lists metadata/status and confirms revocation. Added a copyable remote MCP configuration for `https://groundwork-portal.vercel.app/api/mcp` with an Authorization placeholder. Added a shell assistant launcher for every workspace role, desktop chat drawer / phone sheet, inline answers, Enter / Shift+Enter handling, newest-message scrolling, busy locks, Retry, calm AI-unavailable notice, and Confirm/Cancel cards. Confirm sends exactly `{messages:[],confirm_action_id}`; Cancel discards the proposal locally and lets the server action expire without executing it.

Verification: **`pnpm typecheck` and `pnpm build` pass. Five pure presentation tests pass** with `pnpm vitest run tests/batch-five-ui.test.ts --config vitest.frontend.config.ts`; the isolated configuration excludes database global/setup fixtures. Tests cover audit attribution, MCP placeholder configuration, API expiry choices, revoked/expired/active key status, and valid/terminal supplier transitions. The full DB suite was then run from the box shell outside Codex: **`pnpm test` — 179 passed across 14 files** (174 prior + 5 new). Chromium launch was attempted but blocked by sandbox socket restrictions (`setsockopt: Operation not permitted`), so signed-in runtime tap-through, dark-mode visual inspection and measured 320px/390px overflow checks remain unverified; responsive CSS and interaction paths were reviewed statically. Backend services, database, RLS, auth and API contracts are unchanged. No secrets added. Committed and pushed from the box shell.

## Frontend batch 6 — polish

Completed the live-review polish already present in the working tree: varied fixture status counts; human activity and audit summaries with readable diffs; masked demo identities and supplier references; local dates, title-case labels and pluralization; queue/import layout and validation copy; named notification links; wider responsive pages, mobile work-order filters, scrolling settings tabs and a pinned assistant composer. Assistant provider handling and session chat persistence are in place. Earlier batch 6 presentation tests are retained.

### Final re-check leftovers

Added a scoped, RLS-protected work-order-number lookup for existing WO-number and fixture `/ number` labels; directed the assistant to use it and promptly propose requested writes; raised the bounded tool budget from four to ten rounds. Replies render bold, italics, lists and inline code as escaped React elements. Membership audit sentences include the member name; notification read-state updates remain stored but are excluded from the displayed feed. Shell role badges use title case. Schedule copy now explains that date changes use 9:00 AM browser-local time while existing schedules keep their recorded time; seed schedules/data are unchanged. Settings tab scrollbars are hidden, touch tooltips are disabled, and clicking a tooltip button clears its tooltip. Supplier links include the work-order title and its existing number label. `/approval-queue` permanently redirects to `/queue`; UI routes are not workspace-scoped.

Migration 0009 adds atomic client-requester notifications for staff/admin client-visible comments, including MCP and assistant writes; internal notes do not notify. Added regressions for lookup/isolation, proposal-before-confirmation, notification replay/internal visibility, membership wording and safe markdown rendering.

Verification: `pnpm typecheck` passes. All **23 tests across four files** in the isolated frontend configuration pass. `pnpm test` was run but cannot execute database tests: global setup receives sandbox `EPERM` connecting to both `::1:5432` and `127.0.0.1:5432`, despite the local server running. No permission escalation is available. Migration 0009 remains to be applied to the development database in an environment permitting Postgres connections; full database test results and live assistant behavior are not certified here. No development database reset, seed changes, commits or pushes.

# Redesign

## Redesign batch 1 — tokens, shell, assistant entry, landing

- Mood: calm, precise, dense operational tool, with quiet controls and plain copy.
- Palette: neutral light and dark surfaces with one deep teal accent and small status dots.
- Type: Geist at 14px for app surfaces, compact titles, and tabular numbers for tables, stats, and counts.
- Surfaces: flat hairline borders, 4/6/8/12px radii, compact spacing, and restrained overlay shadows.

Rewrote the light/dark tokens and restyled shared buttons, inputs, dropdowns, tabs, badges, cards, tables, skeletons, state blocks, dialogs, drawers, popovers, and toasts. Removed button lift/shadow hover effects and all UI eyebrow labels and Sparkles references. Kept keyboard focus, reduced motion, overlay stacking, the theme pre-paint script, and 44px touch targets.

Rebuilt the shell presentation around a 232px sidebar workspace block, quiet navigation with queue counts, bottom Settings/account controls, a 48px page-context header, and a slim demo strip. Added a labeled desktop Assistant control with platform-specific Cmd/Ctrl+J toggling and a neutral phone Assistant icon. Preserved persona/reset/sign-out confirmations, collapse persistence, unread polling, queue updates, client path guards, draft guards, and existing sheet dismissal behavior. The phone More sheet retains navigation and sign-out.

Replaced the landing hero and decorative feature sections with plain product copy, demo/sign-in links, a framed HTML app preview with seven work orders and a compact stat strip, and six short capability descriptions. Updated public header/footer and compact sign-in/demo picker presentation. The preview clips within its frame and hides the miniature sidebar on phones. Google sign-in and demo start handlers are unchanged. Assistant conversation content is deferred to batch 3.

Verification: `pnpm typecheck` and `pnpm build` passed. All 23 existing isolated frontend tests across four files passed with `pnpm vitest run --config vitest.frontend.config.ts`. Source grep found no Sparkles or eyebrow references in app/components. No database suite was run. Responsive layout and light/dark styles were reviewed statically; interactive browser flows and measured 320px/390px rendering were not verified in this batch. No dependencies, backend/API/auth/database changes, commits, pushes, or .git writes.

Files changed:
- app/globals.css; app/page.tsx; app/not-found.tsx
- app/(public)/sign-in/page.tsx; app/(public)/demo/page.tsx; app/(app)/onboarding/page.tsx
- components/app/shell.tsx; components/app/dashboard.tsx; components/app/approval-queue.tsx; components/app/import-upload.tsx
- components/public/chrome.tsx; components/ui/states.tsx; PROGRESS.md

## Redesign batch 2 — dashboard, first run, work orders

Reused batch 1 light/dark tokens and primitives. Dashboard now has a real workspace/count header, linked six-status strip and proportional muted bar, independently loaded attention items, avatar activity rows with the permitted audit link, and compact supplier sync. Real workspaces with zero orders show the checklist instead of zero metrics/activity. The five setup checks use existing read-only clients/imports/members/invites/tokens endpoints independently with inline Retry; team invitation is admin-only, staff client setup directs them to an admin, and the real Settings tab is `agent-access`. Existing `first-use:<workspace>` started/dismissed persistence remains compatible, and the checklist hides when complete. No demo data enters a real workspace.

Demo safety: `/demo` renders the public picker, whose `/api/demo/start` response sets the session cookie even for an already signed-in user. Opening a new tab would still share that cookie. The checklist therefore uses the requested fallback: “Explore the demo” links to `/`, without invoking demo entry or replacing the current session.

Work-order list now uses a compact search/filter toolbar, plain count header, priority indicators, assignee initials, right-aligned overdue dates, compact pagination, guided first-use/filter empty states, and phone rows with hairline dividers. Detail now places description/comments/composer in the main column, properties and existing assignment/supplier/activity controls on the right, and properties above comments on phones. Staff status/Edit controls remain available; client restrictions, visible comment filtering, retry/conflict/confirmation/undo handlers are retained. Added shared `InlineHint` with browser/user remembered “Got it” dismissal for staff internal-note guidance. Client home uses the same header/status strip and compact request rows with a New request empty-state action.

New/edit forms are narrow with hairline sections and header actions. The sole original submit button targets the same form via its `form` attribute; busy, validation, idempotency, draft restore/guard, conflict and Cancel behavior are unchanged. Dashboard/home and existing shared work-order route skeletons now follow the new header/strip/table/form/detail layouts.

Data limits: the current API has no dedicated work-order number or due-date field. Numbers are displayed only where existing title labels contain WO-number or trailing `/ number`; other orders receive no invented number. Due display follows the existing scheduled-date/overdue semantics. The list endpoint also has no site display name; retained its existing client column rather than fabricating site names.

Verification: `pnpm typecheck` and `pnpm build` passed. `pnpm vitest run --config vitest.frontend.config.ts` passed all 23 existing tests across four files. `git diff --check` passed. Responsive and light/dark presentation reviewed statically; signed-in browser interactions and measured 320px/390px layouts were not verified. No database suite, dependencies, backend/API/auth/database changes, commits or pushes.

Files changed:
- app/globals.css
- app/(app)/dashboard/loading.tsx; app/(app)/home/loading.tsx
- components/app/dashboard.tsx; components/app/client-home.tsx
- components/app/work-order-list.tsx; components/app/work-order-detail.tsx; components/app/work-order-form.tsx
- components/app/workflow-loading.tsx
- components/ui/inline-hint.tsx; components/ui/index.ts
- PROGRESS.md

## Redesign batch 3 — remaining screens and sweep

Reused the existing neutral light/dark tokens, compact heading rows, table wrappers, badges, hairlines and guided empty states. Import now has a compact dashed upload area, recent-import table, four-step progress indicator, two-column mapping table and dense validation table retaining all mapped values and issues. Mapping keeps the existing field-to-column selectors, including the ability to reuse a spreadsheet column. Approval queue has pending metadata and bulk action in its header, a compact list/detail split, properties and edit controls, and distinct first-use/caught-up states linked to Import. Mapping, queue and agent access reuse InlineHint with user-scoped browser dismissal.

Supplier orders and sync runs, clients, members, invites, audit entries and agent keys use compact tables. Supplier check/repair actions sit beside last-sync metadata; mismatch indicators remain small, with muted row backgrounds; demo controls remain at the bottom. Client sites use compact hairline rows. Audit retains filters, date range, sorting and pagination, with actor initials, attribution pills, a properties drawer and readable diffs. Settings retains every original tab key and ?tab= deep link, adds underline tabs and label/control rows within 760px, and uses Light/Dark/System segmented buttons. Agent access retains creation/revocation and one-time secret behavior, with monospace secrets and a bordered copyable MCP code panel.

Notifications have compact rows, accent unread dots, tabular times and Mark all read in the overlay header. Assistant uses a plain Assistant title, three role-appropriate prompts through the existing submit/send path, right-aligned neutral user messages, plain assistant markdown, bordered confirmation panels and an inset send button with keyboard hint. Confirm payload, retry, busy locks, session persistence, scrolling and header-only swipe dismissal remain intact. Client home sections, isolation, onboarding, invite acceptance and shared loading skeletons follow the same density. Existing no-access, not-found and error boundaries inherit the shared 22px titles and neutral state styles. Swept obsolete card sections and unused CSS rules; retained runtime-generated presentation/status/priority selectors. No native selects, sparkle/eyebrow, gradient or glow components were found in the final source sweep.

Verification: `pnpm typecheck` passed. `pnpm vitest run --config vitest.frontend.config.ts` passed all 23 tests in four files. `pnpm build` passed. `git diff --check` passed. Responsive and dark-mode rules were reviewed statically; signed-in browser interactions and measured 320px/390px layouts were not verified. No dependencies, tests, backend/API/auth/database/data changes, database suite, commits or pushes.

Files changed:
- app/globals.css; app/(app)/onboarding/page.tsx; app/(app)/invites/accept/page.tsx
- components/app/import-upload.tsx; import-detail.tsx; import-shared.tsx; approval-queue.tsx
- components/app/supplier.tsx; audit.tsx; clients.tsx; client-home.tsx; isolation.tsx
- components/app/settings.tsx; settings-invites.tsx; agent-access.tsx; notifications.tsx; assistant.tsx
- components/app/loading.tsx; work-order-form.tsx (unused import cleanup)
- components/ui/states.tsx; dialog.tsx; assistant-markdown.tsx
- PROGRESS.md


## Redesign batch 4 — live review polish

Flattened the work-order toolbar into one desktop row with a roughly 260px search, 32px filter triggers sized by all option labels, and sort aligned right. Removed the table’s padded card wrapper in favor of one flush hairline-bordered, 8px-radius container and subtle header background. Due dates and table dates across imports, supplier orders/sync history, audit, invites and agent keys now show short local dates, including the year only outside the current year, with full local date-time titles. Overdue dates retain danger text. Removed top-level Work orders, Clients, Supplier, Audit and Settings back links; Import and Queue already had none. Detail/new/edit navigation remains intact.

Tightened dashboard activity rows and matched their panel header padding to table headers. Times stay on one line, moving below summaries on phones. Phone demo strip is one 36px line with a Demo options sheet retaining Isolation check and the existing Switch persona/Reset confirmations. Dashboard, requests and work-order headers keep compact New actions beside titles with descriptive accessible labels. Phone status cells use one consistent 3-column divider grid and flush bottom bar; attention items form one bordered list with right-aligned View actions. Reduced phone panel padding. Retained 44px touch targets, existing handlers, filters, roles and confirmation flows.

Verification: `pnpm typecheck` and `pnpm build` passed. `pnpm vitest run --config vitest.frontend.config.ts` passed all 23 tests in four files. Responsive rules reviewed statically; live browser rendering at 1440px/390px was not verified. No dependencies, backend/API/auth/database/data/test changes, database suite, commits or pushes.

Files changed:
- app/globals.css
- components/ui/dropdown.tsx; components/ui/time.tsx
- components/app/work-order-list.tsx; dashboard.tsx; client-home.tsx; shell.tsx
- components/app/clients.tsx; supplier.tsx; audit.tsx; settings.tsx
- components/app/import-upload.tsx; settings-invites.tsx; agent-access.tsx
- PROGRESS.md

## Live fixes — phone tables, width, scroll, pager, empty keys, assistant input, hints, dark accent, overdue label

1. **Phone tables and lists:** Work orders/requests switch to stacked linked items through 720px: title, status, client (where available to the existing role), priority, then due date with danger colour for overdue orders. Hide the desktop table/header at this breakpoint. Reviewed approval queue, import history/mapping/validation, audit, supplier orders/sync runs, clients, members, invites, agent keys, and client-home request lists. All operational tables use their existing horizontal scroll wrappers with a 640px minimum table width and readable minimum cell widths on phones; validation values/issues receive extra width. Queue and request lists retain stacked content with shrink-safe containers. The existing work-order list payload has no site names; no extra requests or data logic were introduced.
2. **Page width:** Every `.app-main .page` uses a left-aligned shared container with up to 1240px content plus 32px side padding, matching the app header's left padding. Phone padding is 16px. New/edit forms retain a readable inner surface, and settings retain their inner form/panel width.
3. **Scroll and hover:** Removed work-order session scroll restoration and scroll-position recording, while preserving the return URL. A shell effect resets the main content, app-main, and window on pathname change and initial shell loading. Existing modal focus uses `preventScroll`; no mount autofocus was found in the work-order list. Row hover remains limited to hover-capable devices; touch devices receive no sticky row hover. Real queue selection remains visible.
4. **Pagers:** Removed the shared 32px fixed width that squeezed Previous/Next text. Text buttons size to content with an explicit 12px gap; work-order icon buttons retain 44px width. Existing page/range indicators remain.
5. **Empty keys:** Both Workspace keys and Your keys use the existing EmptyState with “No agent keys yet.” and “Create one above to connect an AI agent.” The existing focus-to-create action remains.
6. **Assistant input:** Textarea starts at one row, cannot be resized manually, and grows with content up to 156px (about six rows), then scrolls. The send button occupies its own 44px flex column aligned to the bottom, with an 8px gap; the keyboard hint occupies a separate line.
7. **Hints:** Moved internal-note and mapping hints above their panels/sections. Queue and agent-access hints already sit above their sections outside forms. All InlineHint usages remain outside forms, with compact padding and a small Got it button.
8. **Dark accent:** Rich teal primary background `#22776f` with white text; hover `#267f76`, active `#185e58`. Numeric Node calculation: normal **5.33:1**, hover **4.79:1**, active **7.55:1**. Separate accent `#68bdb2` supplies readable links/text; its minimum contrast across dark background/surface tokens is **7.56:1**. Added a regression test against the actual CSS tokens and button states.
9. **Overdue label:** Status strip contains only the six existing statuses (no overdue status). The separate attention row now reads “1 overdue work order across open statuses” or “N overdue work orders across open statuses,” with the existing overdue-filtered link retained.

**Verification:** `pnpm typecheck` passed; `pnpm vitest run --config vitest.frontend.config.ts` passed (4 files, 24 tests); `pnpm build` passed. `git diff --check` passed. Reviewed all listed table/list component markup and responsive rules for 390px constraints. Attempted a representative 390px headless Chrome layout check using the real stylesheet; Chrome exits before rendering because its crashpad socket operation is denied by the environment (`setsockopt: Operation not permitted`). Rendered phone/desktop visual verification remains unavailable in this sandbox; no screenshot/runtime-layout pass is claimed.

**Files changed:** `app/globals.css`; `components/app/work-order-list.tsx`; `components/app/shell.tsx`; `components/app/agent-access.tsx`; `components/app/assistant.tsx`; `components/app/work-order-detail.tsx`; `components/app/import-detail.tsx`; `components/app/dashboard.tsx`; `tests/polish-ui.test.ts`; `PROGRESS.md`. Frontend/CSS only; no backend, API, auth, database, dependencies, commits, or pushes changed.

Follow-up after live check (390px): the assistant input row still rendered the send button under the textarea with the hint beside it. Replaced it with a two-column grid (auto-growing textarea, 44px send button beside it, hint on its own line and hidden on touch devices). Typecheck, all 202 tests and build pass.

## Error states

Google sign-in now discards the incoming database session for provider sign-in/callback requests before Auth.js runs. OAuth state, PKCE, CSRF and callback cookies are preserved, including POST bodies. The adapter refuses to link any provider to a demo user. Only Google allows email account linking, and Google email verification must be strictly `true`.

| Error | Branded page/state | Recovery buttons |
| --- | --- | --- |
| Auth AccessDenied (demo or unverified Google email) | `/auth/error`; shared `lib/ui/auth-errors.ts` copy also used on `/sign-in` | Try again, Back to home; Google sign-in on sign-in page |
| OAuthAccountNotLinked | Same public auth page; explains previous session ended and different workspace login | Try again, Back to home |
| Auth Configuration | Same public auth page; temporary sign-in outage | Try again, Back to home |
| Auth Verification | Same public auth page; expired sign-in link | Try again, Back to home |
| OAuthCallbackError, OAuthSignin, CallbackRouteError, unknown auth codes | Same public auth page; safe default, never echoes codes | Try again, Back to home |
| 404 / missing route | `app/not-found.tsx` inherited by route groups (no group overrides) | Try again, Go to dashboard, Back to home |
| Unexpected page/render failure | `app/error.tsx`, `app/(public)/error.tsx`, `app/(app)/error.tsx`; shared ErrorState | Try again (Next.js 16 retry), Back to home, Sign in again |
| Root layout failure | `app/global-error.tsx`, own html/body, inline styling, no CSS dependency | Try again, Back to home, Sign in again |
| Expired session / unauthenticated API (401) | `lib/ui/api.ts` sends all client requests, including uploads, to public `/session-ended` | Sign in again with safe local callbackUrl, Back to home, Start a new demo |
| Expired or deleted demo sandbox | Demo marker set on start/reset/switch and existing demo shell loads; `requireUser` also recognizes expired demo sessions still in DB; public `/demo-ended` | Start a new demo, Back to home |
| No access (403) | Public `/no-access`, `components/app/no-access.tsx`; shared request recovery notice for denied actions | Go to dashboard, Back to home; notice also Try again |
| Network/offline fetch or server outage | `lib/ui/api.ts` normalizes transport/server messages; ErrorState in resources; persistent `components/ui/request-recovery.tsx` also covers background requests and mutation failures | Try again, Back to home; preserves drafts, resource retry reloads data, failed mutations are retried from their existing controls |
| Demo start 429 / sandbox creation outage | DemoPicker with plain wait-and-retry copy; persistent request recovery notice | Try again, Sign in, Back to home |
| Invite missing/invalid token | Invite acceptance page, specific missing/422 copy; asks admin for a new invite | Go to dashboard, Sign in with a different account, Back to home |
| Invite expired/revoked/no longer available | Invite acceptance page, expired code from service and friendly unavailable fallback | Accept invite (retry), Go to dashboard, Sign in with a different account, Back to home; ask admin for a new invite |
| Invite already used | Invite acceptance page; friendly used copy. Same-user reuse remains idempotent and goes to dashboard | Go to dashboard, Sign in with a different account, Back to home |
| Invite wrong account / unknown token | Invite acceptance page; shared 404 wording avoids disclosing invite existence | Sign in with a different account, Go to dashboard, Back to home; ask admin for a new invite |
| Upload wrong type, too large, empty, no data rows, unreadable, missing/duplicate header | ImportUpload, parser validation and `lib/ui/imports.ts` reason mapping | Choose another file, Try again |
| Duplicate import | Existing import conflict state | Open that import, Import again anyway; Choose file remains available |
| Import mapping/queue/row validation, conflicting updates, bulk permission, expired undo | Existing import/queue inline validation and refresh states; form/dialog controls stay available | Save/approve/reject again, Refresh import, Change mapping, Cancel; shared recovery for transport/permission failures |
| AI assistant provider down/quota/missing key | Assistant ErrorState; unavailable response retains failed payload for retry, rest of screen works | Try again, Back to home, Sign in again |
| AI summaries down/quota/missing key | Approval queue draft notice/error; manual review remains available | Try again, Draft summaries |
| Resource loading failures (dashboard, orders, clients/sites, imports/rows, queue, audit, supplier, settings, members/invites/tokens, isolation, notifications) | Existing resource ErrorState, now standardized with navigation; persistent recovery also catches background count failures | Try again, Back to home, Sign in again |
| Action failures (settings/preferences, work orders/comments, client/site edits, invites/members/tokens, supplier actions, demo reset/switch/sign-out) | Existing plain inline form/dialog messages and action controls, plus persistent request recovery on offline/403/429/5xx | Existing submit/confirm action retries and Cancel; recovery notice Try again, Back to home |
| Toast undo failure | Existing ToastItem plain error copy and retained undo action | Undo again, Dismiss notification |
| Clipboard unavailable | Existing invite/token dialogs keep selectable link/token fields and explain manual copying | Copy again or manually copy; Close/Cancel |
| Appearance preference load/save failure | Existing settings inline theme error; shared recovery for request failures | Retry in Settings / appearance selection again; recovery Try again, Back to home |

Recovery surfaces use pure white/black backgrounds. Unknown errors and provider/transport details are not displayed. The demo marker is a non-authoritative UI hint only and never grants access. Older already-deleted demo sessions whose browsers never received the marker cannot be distinguished from other missing sessions; they get the session-ended page, which also offers Start a new demo.

Validation: `pnpm typecheck`, full `pnpm test` (21 files, 223 tests) and `pnpm build` pass (verified outside the Codex sandbox).

Changed files for this task:

- `PROGRESS.md`
- `app/(app)/error.tsx`
- `app/(app)/invites/accept/page.tsx`
- `app/(public)/auth/error/page.tsx`
- `app/(public)/demo-ended/page.tsx`
- `app/(public)/error.tsx`
- `app/(public)/session-ended/page.tsx`
- `app/(public)/sign-in/page.tsx`
- `app/api/auth/[...nextauth]/route.ts`
- `app/api/auth/sign-out/route.ts`
- `app/api/demo/reset/route.ts`
- `app/api/demo/start/route.ts`
- `app/api/demo/switch/route.ts`
- `app/error.tsx`
- `app/global-error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/not-found.tsx`
- `components/app/approval-queue.tsx`
- `components/app/assistant.tsx`
- `components/app/import-upload.tsx`
- `components/app/no-access.tsx`
- `components/app/resource.ts`
- `components/app/shell.tsx`
- `components/public/demo-picker.tsx`
- `components/ui/request-recovery.tsx`
- `components/ui/states.tsx`
- `lib/auth-callback.ts`
- `lib/auth-guards.ts`
- `lib/auth.ts`
- `lib/import/parse.ts`
- `lib/services/invites.ts`
- `lib/ui/api.ts`
- `lib/ui/auth-errors.ts`
- `lib/ui/imports.ts`
- `lib/ui/request-errors.ts`
- `tests/auth-route.test.ts`
- `tests/auth-safety.test.ts`
- `tests/error-pages.test.tsx`
- `tests/request-errors.test.ts`
- `vitest.frontend.config.ts`

## Immersive landing

Replaced only the public `/` landing with a black, Geist-based scroll narrative: a fixed Groundwork bar, request-to-done hero, nine-floor procedural building, three workflow steps, agent MCP configuration with copy feedback, large final reveal, and legal footer. All copy and navigation remain server-rendered; application screens, shared public chrome, APIs, authentication, database behavior, and metadata are unchanged. New styles are scoped beneath `.lx-root` with `lx-` classes; existing landing CSS was retained.

The inline isometric SVG is rendered on the server and remains the complete fallback for reduced motion, small/coarse-pointer devices, low CPU/memory hints, data saving, unavailable WebGL, renderer initialization errors, and lost contexts. Mobile illustrations sit below content and behind the final reveal. IntersectionObserver reveals respect reduced motion. Ochre/black contrast is 7.95:1; muted text/black is 8.13:1. Links and buttons have hover, pressed, and keyboard focus states; copy feedback uses an aria-live region.

The scene module and Three.js load only after desktop eligibility checks. The low-power, antialiased renderer caps pixel ratio at 1.5, uses procedural matte geometry and thin edges with state-colored emissive bands, and renders on demand for scroll, pointer, and resize changes. It pauses while hidden or offscreen and disposes its renderer, geometry, materials, observers, and listeners. There are no models, textures, images, video, animation libraries, or continuous idle rendering.

Review pass (outside the Codex sandbox): installed `three@0.180.0` + `@types/three` and updated the lockfile. Desktop workflow steps moved to a left column so the 3D building is never cut by a text panel; floor lighting now paces with the steps (Scheduled from ~33% scroll, Done ~49%); removed the arrow glyph from "Try the demo"; page background forced to pure #000 on overscroll.

Size: the Three.js + scene chunk is ~174 KB gzip and loads only after the desktop eligibility and WebGL checks pass; the landing's own client code is ~3.4 KB gzip and CSS ~2.3 KB gzip. Verified in headless Chrome against the production build: desktop with WebGL renders the canvas (SVG hidden), while phone viewport, prefers-reduced-motion, and blocked WebGL keep the SVG and never request the Three.js chunk. No console errors.

Validation: `pnpm typecheck && pnpm test && pnpm build` green (all suites, including the landing render and eligibility tests).

## 2026-10-11 — QA work orders, dates, imports and request drafts

- **2:** Scheduling an Open work order now moves it to Scheduled through the database insert/update guards. Create and detail/form changes give a scheduling toast; status counts follow the stored status. Migration also promotes existing Open orders with visits.
- **3:** Added new migration `0010_work_order_dates_numbers.sql` with a real `due_on` date and workspace-local backfill from the existing visit timestamp (`scheduled_for`). Threaded independent deadlines through services/API schemas, forms, detail, lists, overdue filtering, sorting, imports, assistant/MCP, fixtures, and API/database documentation. Postgres dates remain calendar strings. Visits resolve to 09:00 in the workspace timezone; existing timestamp precision is retained when dates do not change.
- **4:** Timeline details record specific assignment, schedule, due date, request-detail and status changes. Staff see named actions; client activity describes the change. Audit/dashboard summaries also explain assignments and dates.
- **7:** Done orders reject edits and deletion on the server/database, with comments still allowed. Detail/edit pages enforce the read-only view. Admin Reopen requires a confirmation and explicit versioned request, restoring Scheduled when a visit is retained or Open otherwise. Closing/reopening copy matches this behavior.
- **10:** The status button shows the current status. The menu shows every status, disables unavailable transitions, and explains the required prior step. Done and Cancelled retain confirmation when allowed by the existing workflow.
- **14:** Added shared overdue logic in `lib/dates.ts`: due date before today in the workspace timezone, excluding Done/Cancelled. Dashboard and list SQL share the predicate; list/detail badges and assistant/MCP use the same definition. Tools expose an overdue filter plus timezone/today and stored numbers.
- **18:** Date-only import cells remain local calendar strings through validation/review. Preview, review and error CSV format workspace dates; invalid values remain visible for correction. Queue edits use date pickers, including conversion of legacy timestamps to the workspace day.
- **19:** Repeated external references are errors under External reference, including references on closed orders and repeated references in a file. Exact duplicates require matching title, site, reference and dates; similar titles with different site/reference/dates are warnings. Approval rechecks these rules under the existing import lock.
- **20:** Due date/Due/Deadline/Date map to Due (`due_on`); Scheduled for/Scheduled date/Visit date map separately to the visit. Migration upgrades old Due date mappings and their stored row values.
- **49:** Shared development/demo fixtures have clean titles, Sam/Dana/unassigned assignments, mixed priorities, spread calendar deadlines, varied visit/creation times, and repeatable values for a given workspace day. The pending demo import includes real client/site names and separate due/visit dates. Updated the sample CSV to demonstrate both dates while retaining 37 eligible rows and 3 errors.
- **52:** Import preview and review use shared date/priority formatting and field labels; warning/error counts use the plural helper, including zero warnings.
- **56:** Opening a work-order notification waits for its read receipt, refreshes the bell, then navigates; failures preserve the notification and show feedback. Added Overdue badges to detail and desktop/phone/client request lists. Schedule picker labels show readable dates.
- **61:** Seed creation events match record creation, subsequent activity/comments follow creation in order, and notification/audit seed times track the underlying record history. Migration also repairs existing creation-event timestamps. Client activity now names visit/deadline/assignment/detail changes instead of attributing an unexplained update to the workspace.
- **62:** Permanent workspace-unique work order numbers are assigned by an atomic database counter for every source, including imports and concurrent creates. Existing displayed numbers are backfilled; number lookup uses the stored value. Numbers appear on client home/list/detail as well as provider lists.
- **63:** Form initialization happens once per user/workspace/order draft and preserves description/site across resource/context re-renders. Submission sends the chosen site and uses the version captured when editing began. Client feedback says “Request WO-N submitted.” Explicit conflict reload retrieves the latest version and resets the draft.

Validation: `pnpm typecheck` passes. The focused frontend/helper regression run passes (7 files, 47 tests after the final assertions), including new calendar-boundary, independent-mapping, duplicate-validation, activity, seed-date, notification-navigation and rendered import/picker tests. The broader frontend run passed 12 files / 74 tests before the final small formatting/validation additions. `git diff --check` passes. Added six database-backed QA cases and updated existing tests for the intended new semantics.

Verification limits: `node --import tsx scripts/migrate.ts` and the requested database-backed Vitest run stop at the local Postgres connection with `EPERM` for localhost:5432, before migrations/tests execute. Migration 0010 is therefore **not applied here**, and database/RLS/runtime behavior still needs the full suite outside this sandbox (`pnpm db:migrate`, then `pnpm test`). `pnpm build` is blocked fetching the existing Geist font from Google Fonts; no font/landing changes were made. Phone controls retain the shared 44px touch targets and existing 390px layout rules; browser interaction/layout was not measured here. All requested items have code changes; none is claimed fully verified against Postgres or a browser in this environment. Existing development data is not reset automatically; new fixture data appears on the next seed/reset or newly created demo. `components/landing` and `app/page.tsx` remain untouched.

## 2026-10-11 — QA backgrounds, client lists and phone controls

- **47:** Changed shared light/dark page and surface tokens to pure #FFFFFF/#000000. Sidebar and demo banner use the same canvas; existing 1px borders separate surfaces. Subtle tokens are #fafafa/#0a0a0a for headers, hover and small control states.
- **60:** Shared badges have intrinsic width and cannot stretch in column layouts. Client home sections and request lists have tighter spacing; recent update metadata is grouped beneath each title.
- **71:** Added final coarse-pointer rules so auth/recovery buttons, hint dismiss buttons, dashboard links and legal footer links have at least 44px in both dimensions. Queue and Settings checkbox labels provide padded 44px hit areas while the checkbox stays small. Desktop control density is retained.
- **72:** The shared badge fix also keeps drawer roles as inline bordered pills.
- **73:** Recent updates place the status, optional Overdue pill and updated time together in one wrapping metadata row, with compact spacing and hairline separators. Interactive titles and times retain 44px touch height.
- **74:** Public/auth/legal pages and footer inherit the pure canvas tokens. Signed-out No access now offers Sign in and Back to home without a dashboard link; signed-in clients get Go to requests and staff/admins get Go to dashboard.
- **75:** Attention rows show the short Overdue label on phones while preserving the desktop explanation. Phone status cells use tighter padding and keep each status label with its dot on one line, including Waiting on Parts.
- **78:** Assistant sheet footer adds 16px plus the bottom safe-area inset on phones. Disabled Send has a neutral fill, border and muted icon at full opacity.

Validation: `pnpm typecheck` passes; `pnpm exec vitest run tests/qa-layout.test.tsx tests/error-pages.test.tsx tests/polish-ui.test.ts --config vitest.frontend.config.ts` passes **22 tests in 3 files**, including four new regression tests. `git diff --check` passes. The same requested Vitest command with the default database configuration is blocked during global setup by `EPERM` connecting to localhost:5432; no database tests execute. No database/migration/seed changes were needed. Landing components and `app/page.tsx` remain untouched.

Outstanding verification: all eight items have implementation changes; phone browser layout and actual touch hit areas have not been measured here. Please rerun the full database suite outside this sandbox and visually review at 390px, including a device with a bottom safe-area inset.

## 2026-10-11 — QA phone headers, tables, request cards and notifications

- **66:** Added shared `PageHeader` and adopted it throughout app pages. At 640px and below, work-order/request detail stacks the number, full-width title, status and actions. Title wrapping no longer competes with the status controls; cancelled/completed notices have their own space below the title. Form actions stack with full-width touch controls.
- **67:** Shared badges wrap within their available width, with long words allowed to break. Flex/grid content and detail metadata shrink correctly. Phone modal layers and assistant/notification panels are constrained to the viewport with full-width panels, preventing inherited desktop sizing from shifting their left edges.
- **68:** Approval queue, Supplier, new/edit work-order/request forms, lists, dashboards, client pages, imports, Settings and other app pages use the same responsive header. Titles/subtitles take the full phone width before actions; staff Supplier's read-only note sits below the title block.
- **69:** Added shared `ResponsiveTable`, preserving table/row/cell semantics and deriving phone cell labels from column headings. At 640px and below, rows become labeled cards for Audit, Settings members/invites/keys, Clients/team, Supplier orders/history, Recent imports and Import review. Custom client rows supply their labels explicitly. Desktop tables remain intact.
- **70:** Shared tabs have a constrained horizontal scroll area, a phone edge fade and visible thin scrollbar. Active tabs scroll into view on selection and when loading a linked Settings tab; existing keyboard navigation remains available.
- **76:** Phone work-order/request cards show number, clean title, status plus priority, client · site, local due date with Overdue where applicable, and assignee/Unassigned. The list API supplies client/site/assignee names through existing tenant reads and the permission-checked assignee function. A shared title formatter removes only the exact matching legacy ` — Site / number` suffix, including on client home/detail; clean fixtures from item 49 remain unchanged. No seed reset or schema migration is needed.
- **77:** Notifications prefetch when the signed-in workspace mounts. Closing and reopening retains the loaded or empty list; reopening within 30 seconds avoids another list request. Older results refresh in the background without clearing the list, as do read actions and returning to a visible tab. Request generations reject stale responses, the component is keyed by user/workspace, and following a notification updates its retained read state before navigation.

Validation: `pnpm typecheck` passes. The focused frontend Vitest run passes **54 tests in 8 files**, including six new phone layout/card/table/prefetch regression cases in `tests/qa-phone-layout.test.tsx`. Added a database-backed list-name and client/workspace isolation case in `tests/qa-work-orders-db.test.ts`. `git diff --check` passes. API documentation describes the added list fields. No database migrations, fixture edits, permission changes, landing component edits or `app/page.tsx` edits were needed.

Outstanding verification: implementation changes cover all seven requested items; none is left without a code fix. The database-backed Vitest run cannot execute because sandbox connections to local Postgres (`::1` and `127.0.0.1`, port 5432) fail with `EPERM`. Headless Chrome also exits before rendering because crashpad's socket operation is denied (`setsockopt: Operation not permitted`). Therefore **66, 67, 68, 69, 70 and 76 still need a rendered 390px check**, and **76/77 still need live database/browser verification** outside this sandbox. No measured viewport-width or notification-latency pass is claimed. Run the full database suite and review the phone layouts in the normal local environment.
