# Portal build plan (approved 9 Oct 2026)

Status: approved by Adhil as the next build, including spreadsheet import and approval queue. Working app name: **Groundwork** (placeholder, see Q3).
Sources: spec-conduit.md / spec-opslayer.md (two proofs), portfolio-build-method.md, portfolio/README.md, app-behavior-full SKILL.md, earthy-editorial-colors.md, lessons/ (all files).

## 1. Pitch and audience
**One line:** A client portal and back office for a service company. Staff run work orders, clients see only their own company, spreadsheets become approved work, and missed updates from a supplier get caught and fixed.
**For:** agency founders checking whether Adhil can own a multi-tenant backend (RLS, roles, audit, sync), and SMB owners who run jobs from spreadsheets and email and want a portal for their clients.

## 2. Scenario
**Recommended: facilities maintenance.** *Ridgeline Facility Services* (the provider) maintains buildings for client companies. The clients are *Harbor & Pine Coworking* (company A, 3 sites) and *Northgate Self Storage* (company B, 2 sites), plus *Larkspur Coworking Studio*, a third client used only for long-name and empty-state cases. Ridgeline orders parts from *Cobalt Parts Supply*, the outside system. Everyone recognizes the flow: request, then triage, then schedule, then waiting on parts, then done.
**Alternative: B2B supplier portal.** A wholesale distributor and its retail customers, covering orders, price-list imports and carrier status. It works, but it reads more like e-commerce, which is a weaker match for the "internal tools and portals" lane.

All names are fictional. There's no medical content: Larkspur is just a tenant name and can be swapped if Adhil prefers.

## 3. Roles and permissions
| Action | Admin (Ridgeline owner) | Staff (coordinator/tech) | Client user (A or B) |
|---|---|---|---|
| See work orders | All clients in the workspace | All clients in the workspace | Own company only (RLS) |
| Create request | Yes | Yes | Yes, for own sites only |
| Change status, assign, schedule | Yes | Yes | No |
| Internal notes | Read/write | Read/write | Never visible (RLS + column split) |
| Client-visible comments | Yes | Yes | Read, plus write on own |
| Import spreadsheet | Yes | Yes | No |
| Approve or reject queue items | Yes | Yes, except bulk-approve over 25 rows | No |
| Supplier sync and repair | Run and repair | View only | No |
| Clients, sites, invites, roles | Yes | View only | No |
| Audit log | Full | Own actions | No |
| Workspace settings, delete workspace | Yes (level-3 confirm) | No | No |

The server and Postgres enforce every row. Hiding a button is never the control.

## 4. Screens (key states)
Public
1. **Landing:** pitch, "Try the demo", one filled "Sign in". The page still loads if the DB is down (static).
2. **Demo picker:** choose who to be (Dana, admin; Sam, staff; Priya at Harbor & Pine; Omar at Northgate). States: creating your sandbox, then ready, or an error with Retry.
3. **Sign in:** Google only, and keeps the busy state until the next screen shows.
4. **404 / no access:** neutral wording that never reveals that a record exists, with a way home.

Provider side
5. **Dashboard:** open by status, overdue, waiting on parts, queue count, last sync. Each region loads and fails on its own.
6. **Work orders list:** search, status/client/priority filter chips, sort, pagination, URL state. Shows cards on phone. Empty-first-use, no-results and error states.
7. **Work order detail:** status, site, assignee, schedule, parts, client comments vs internal notes (visibly different), activity timeline. States: loading, not found, no access.
8. **New / edit work order:** labeled form, validation, busy, then save to the record. Unsaved changes are protected.
9. **Clients:** list, then client detail (sites, users, invite links: pending, accepted, expired, revoked).
10. **Import:** drop or "Use sample file", column mapping, then validation preview (valid, warning, error per row, with downloadable error report), then send to queue. Handles partial success.
11. **Approval queue:** list beside detail. Optional AI summary and priority suggestion marked "Suggestion". Approve, edit-then-approve, reject with reason, bulk with count. "All caught up" when empty.
12. **Supplier sync:** Cobalt order events, last sync, "Check for missed updates", mismatches found, then Repair (per item or all), with the result. Shows Cobalt down as an error with Retry.
13. **Audit log:** who, what, record, when, result. Filterable, read-only.
14. **Team & roles, Settings:** profile, appearance (light/dark/system), notifications, workspace name, danger zone.
15. **Notifications drawer:** real events only, mark read, mark all read.

Client side
16. **Client home:** my open requests and statuses, plus "New request".
17. **Client request detail:** status, schedule, client-visible comments only.

Demo only
18. **Isolation check:** as Priya, try to open a Northgate work order. The DB returns 0 rows, and the screen shows the query, the role and the empty result.

## 5. Main flows
**Onboarding (real user):** Sign in with Google. If this is your first sign-in, name your workspace. You land on an empty dashboard with a 3-step checklist: add a client, add a site, import or create the first work order. Invite a client user by copying an invite link (no email is sent, and the screen says so). When the invitee signs in with Google using the invited email, they're linked to that client company and land on Client home.
**Core workflow:** A client or staff member creates a request, staff triage it (priority, assignee, schedule), and status moves Open, Scheduled, In progress, Waiting on parts, Done. Each step writes to the timeline and the audit log, notifies the right people, and is visible to the client in client wording.
**Import to approval:** Pick a CSV/XLSX file (max 2 MB, 500 rows) or the sample. Map columns (auto-guessed). The validation preview flags unknown sites, bad dates and duplicates of open orders. "Send 37 valid rows to queue" (rows with errors are excluded and listed). Optional "Draft summaries" runs AI in batches of 25 rows per call. A reviewer approves, edits or rejects each row, or bulk-approves with a count. Approved rows become work orders. The result reads "35 created, 2 rejected (View)".
**Client view:** Priya signs in. She sees Harbor & Pine only, can raise a request for her sites only, and gets status changes and comments. A Northgate URL shows the neutral no-access page.
**Repair:** Ridgeline orders a part, and Cobalt (a small simulated supplier service inside this repo, labeled as such) sends signed webhooks. The demo can drop one delivery ("Simulate a missed webhook"). The reconciler reads Cobalt's events API, the same source the webhook comes from, and compares it with local state. It flags "Cobalt says delivered, we still show waiting on parts". Repair updates the order, logs "repaired by sync", and is idempotent. It runs on "Check now" and on a daily Vercel cron (the Hobby limit).

## 6. Data model (Postgres; every table has RLS, forced, and the app connects as a non-owner role)
- `workspaces` (id, name, is_demo, demo_expires_at)
- `members` (workspace_id, user_id, role admin|staff|client, client_id null unless client)
- `users` (Auth.js tables: users, accounts, sessions)
- `clients` (id, workspace_id, name), `sites` (id, client_id, workspace_id, address)
- `work_orders` (id, workspace_id, client_id, site_id, title, status, priority, assignee_id, scheduled_for, created_by, updated_at)
- `comments` (work_order_id, workspace_id, client_id, body, visibility client|internal, author_id)
- `invites` (workspace_id, client_id, email, role, token_hash, status, expires_at)
- `imports` (id, workspace_id, filename, row_count, status), `import_rows` (import_id, data jsonb, errors jsonb, ai_summary, ai_priority, decision pending|approved|rejected, reason, work_order_id)
- `supplier_orders` (workspace_id, work_order_id, cobalt_ref, local_status), `supplier_events` (cobalt_ref, event_id unique, status, received_via webhook|reconcile)
- `audit_log` (workspace_id, actor_id, action, entity, entity_id, before jsonb, after jsonb, at). Append-only: insert by trigger, no update/delete grant.
- `notifications` (user_id, workspace_id, kind, entity_id, read_at)

**RLS rules:** each request runs in a transaction that sets `app.user_id`. A helper `my_role(ws)` / `my_client(ws)` reads `members`. Staff and admin see rows where workspace_id is one of theirs. Client users additionally need `client_id = my_client(ws)`, and `comments.visibility = 'client'`. Writes have the same rules with `WITH CHECK`. The audit log is visible to admins only (staff see their own rows). Tests run in Vitest against PGlite with the same migrations: A gets 0 rows of B, the client role can't read internal notes, staff can't touch another workspace, and repair is idempotent.

## 7. Skill rules by screen (classified as multi-tenant platform + admin panel + customer portal + portfolio demo)
- **All screens:** §18 mobile, B5 smooth transitions, §3 global focus/tap rules (no autofocus in dialogs; no native select or date inputs, use custom ones), §7 no dead ends (in-app Back), Escape closes everything, swipe-down on phone sheets, overlays in a portal, earthy palette.
- **Lists (6, 9, 11, 13):** §9 visible sort with distinct seed data, URL state, chips, counts, cards on phone. Skeleton, never a false empty state.
- **Detail and forms (7, 8, 17):** §5 forms, §12 timeline, §11 internal vs client wording.
- **Import / queue (10, 11):** §13 imports (mapping, preview, error report, partial), "Use sample file", §15 AI marked as a suggestion with plain errors, never raw provider text.
- **Supplier sync (12):** §21 honest labels (simulated supplier), real stages, idempotent Retry.
- **Sign-in and exit actions:** the approved sign-out pattern, one Sign in button, §4 risk ladder (reject = Undo toast, delete workspace = type the name).
- **Multi-tenant (all signed-in):** §16 workspace/client name always visible, scoped search, neutral no-access.
- **Demo:** C1 kept separate from real accounts (per-visitor sandbox, Demo badge, Reset demo with confirm), C2 about 60 work orders with spread dates.
- **Palette:** parchment background, oat surfaces, charcoal ink text, deep muted teal primary, ochre accent used sparingly. Status badges are text plus color. Designed dark mode. Times in local time without seconds.

## 8. Milestones (1 evening = about 4 h)
| # | Evenings | Milestone | Done when |
|---|---|---|---|
| 1 | 1 | Setup: repo, Neon project, Vercel, Auth.js Google, Vitest, palette tokens, app shell, docs/STATE.md | Live sign-in works and the gates pass |
| 2 | 2 | Schema + RLS + PGlite tests | Migrations applied; cross-tenant, client-notes and staff tests fail once on purpose, then pass |
| 3 | 2 | Onboarding, clients, sites, invites, roles | A real second Google account joins via invite and sees only its client |
| 4 | 3 | Work orders: list, detail, create/edit, status, timeline, search/sort/filter | Full lifecycle is live at 390 px and desktop |
| 5 | 1 | Client home and request detail | Client sees own company only; internal notes are never shown |
| 6 | 3 | Import, mapping, preview, queue, AI summaries (Gemini Flash-Lite, then Groq free) | Sample file reaches "35 created, 2 rejected"; with AI unavailable, the queue still works and says so |
| 7 | 2 | Cobalt sim, webhooks, reconciler, repair, cron | A dropped webhook is detected and repaired live; a second repair changes nothing |
| 8 | 1 | Audit log, notifications, settings, dark mode | Every write appears in the log; settings persist |
| 9 | 2 | Landing, demo picker, per-visitor sandbox (24 h cleanup), isolation check, Reset demo | One click to a full demo; real accounts show no demo data |
| 10 | 2 | Skill Done audit (§22 + C6), real signed-in tap-through, 2880×1800 shots, README, two-layer case study, portfolio card | All checks pass on the live site; then it goes on the site |

**Total: about 19 evenings.** That's more than my earlier 12 to 16 guess, because it adds the per-visitor demo sandbox and full settings. Nothing goes on the portfolio site until milestone 10 passes.

**Stack ($0, no card, nothing that expires):** Next.js on Vercel Hobby; Neon Postgres free (see Q1); Auth.js with Google; Gemini free key with Flash-Lite first, then a Groq free model as backup, max_tokens about 2000, plus a signed-in /api/ai-health route; SheetJS CE (from its official tarball) for XLSX; Zod validation on the server. Check each free tier at setup.

**Two-layer case study notes**
- *In plain words:* A maintenance company and its clients share one portal. Each client sees only its own jobs. A spreadsheet of 40 issues becomes approved work orders in minutes, with AI drafting a short summary for each. If the parts supplier's update gets lost, the app notices and fixes it.
- *Under the hood:* Postgres RLS forced on every table, with a non-owner app role and per-transaction user context. Role and client scoping lives in SQL helpers. Isolation is proven by tests and by a live 0-row screen. An append-only audit log is filled by triggers. Import uses a staged validation then approval pipeline with idempotent creation. Webhooks are signed, with a pull-based reconciler and idempotent repair. AI falls back from one free model to another and is never required for the flow. Demo sandboxes are cloned per visitor.

## 9. Open questions for Adhil
1. **Database: Neon, not Supabase?** Our free-tier check (doctalk-free-tier-check.md) found Supabase free projects pause after 1 week of inactivity, which breaks the "nothing that pauses" rule. Supabase free also allows only 2 active projects per org, which Reclaim and EOB Reader probably already use. The spec already says Neon, so I recommend Neon + Auth.js, the same as DocTalk. RLS is plain Postgres either way.
2. **Scenario:** facilities maintenance (recommended) or the B2B supplier portal?
3. **App name:** keep "Groundwork" or pick another?

## Adhil's rules added Oct 9 2026 (override anything above)
- Backend first: build and verify the full backend (schema, RLS, auth, roles, every API and server action, CSV import/validation/approval, audit log, supplier sync and repair, AI drafts with a free-tier fallback, demo seeding, tests) before any frontend work. Frontend starts only after the backend is completely working.
- Look: serious and professional, like ChatGPT or Grok Bot's UI. Dark (near-black and neutral greys) or clean white, neutral palette, one restrained accent, nothing playful or cartoonish.
- Database: Neon free tier plus Google sign-in, as in DocTalk (free Supabase pauses after a week).
- Fictional tenant "Larkspur Dental Studio" renamed to "Larkspur Coworking Studio" (no medical hints).
- MCP memory agent and clinic demo are dropped for good.
