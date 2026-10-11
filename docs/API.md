# Groundwork API — Complete backend (Batches 1–7)

Backend only. JSON bodies and query parameters are validated with Zod. Auth.js v5 Google sign-in uses database sessions and the owner-only pg adapter. Tenant operations use the non-owner app role inside `withUser`. Signing in never accepts an invite automatically. Tests inject identity through `setAuthResolverForTests`, which throws outside `NODE_ENV=test`; there is no auth header bypass.

All paths below start with `/api`. `[ws]`, `[id]`, and `[userId]` are UUIDs. “Member” means admin, staff, or client in that workspace; client work-order access is restricted by RLS to their own company.

| Method | Path | Allowed roles | Body / query | Successful response |
|---|---|---|---|---|
| GET, POST | /auth/[...nextauth] | Public / signed in | Auth.js Google/session/CSRF protocol | Auth.js response |
| GET | /me | Signed in | — | 200 `{user, memberships:[{workspace_id, role, client_id, workspace_name, client_name}]}` |
| POST | /workspaces | Signed in | `{name, timezone?}` | 201 workspace; creator becomes admin |
| GET | /workspaces/[ws] | Member | — | 200 workspace |
| PATCH | /workspaces/[ws] | Admin | `{name?, timezone?}`, at least one | 200 updated workspace |
| DELETE | /workspaces/[ws] | Admin | `{confirm_name}`, exact current name | 200 `{deleted:true}`; dependent tenant data removed atomically, audit retained |
| GET | /workspaces/[ws]/dashboard | Member | — | 200 `{by_status, overdue, waiting_on_parts, pending_queue_rows, last_supplier_sync_at}` |
| GET | /workspaces/[ws]/clients | Admin, staff | — | 200 client array, name ascending |
| POST | /workspaces/[ws]/clients | Admin | `{name}` | 201 client |
| GET | /workspaces/[ws]/clients/[id] | Admin, staff | — | 200 client |
| PATCH | /workspaces/[ws]/clients/[id] | Admin | `{name}` | 200 client |
| DELETE | /workspaces/[ws]/clients/[id] | Admin | — | 200 `{deleted:true}`; 409 when referenced |
| GET | /workspaces/[ws]/clients/[id]/sites | Admin, staff | — | 200 site array, name ascending |
| POST | /workspaces/[ws]/clients/[id]/sites | Admin | `{name,address}` | 201 site |
| PATCH | /workspaces/[ws]/sites/[id] | Admin | `{name?,address?}`, at least one | 200 site |
| DELETE | /workspaces/[ws]/sites/[id] | Admin | — | 200 `{deleted:true}`; 409 when referenced |
| GET | /workspaces/[ws]/members | Admin, staff | — | 200 memberships with user name/email |
| PATCH | /workspaces/[ws]/members/[userId] | Admin | `{role,client_id?}` | 200 member |
| DELETE | /workspaces/[ws]/members/[userId] | Admin | — | 200 `{deleted:true}`; clears assignments and recipient notifications, preserves work history |
| GET | /workspaces/[ws]/invites | Admin, staff | — | 200 invite array; never includes hash or token |
| POST | /workspaces/[ws]/invites | Admin | `{email,role,client_id?}` | 201 invite plus `token`; no email sent |
| POST | /workspaces/[ws]/invites/[id]/revoke | Admin | — | 200 `{id,status}`; accepted invite gives 409 |
| POST | /invites/accept | Signed in | `{token}` | 200 `{workspace_id,status:"accepted"}` |
| GET | /workspaces/[ws]/work-orders | Member | List query below | 200 `{data,total,page,pageSize,next_cursor}` |
| POST | /workspaces/[ws]/work-orders | Member | Create body below | 201 work order, `ETag` |
| GET | /workspaces/[ws]/work-orders/[id] | Member, visible order | — | 200 order with `site,client,assignee,comments,timeline`, `ETag` |
| PATCH | /workspaces/[ws]/work-orders/[id] | Admin, staff | Patch body below; `If-Match` or `updated_at` | 200 work order, new `ETag` |
| POST | /workspaces/[ws]/work-orders/[id]/comments | Member, visible order | `{body,visibility:"client"|"internal"}` | 201 comment; clients may use only `client` |

Workspace timezone defaults to `Asia/Dubai`; supplied values must be valid IANA timezone names. Names/titles are trimmed, nonempty, at most 200 characters. Descriptions/comments are at most 20,000 characters, site addresses 2,000. Times are ISO timestamps with offsets; nullable assignee/schedule fields can be cleared with `null`.

Client role membership and invites require `client_id`; admin/staff roles require it absent or null. Client must belong to this workspace. Last-admin removal or demotion gives 409, and parent-row locking serializes competing admin changes. A member assigned work cannot be converted to a client until unassigned (422).

Dashboard returns all six status counts, overdue nonterminal orders (`due_on < today` in the workspace timezone, excluding `done` and `cancelled`), waiting-on-parts count, pending import-row count, and latest finished supplier sync-run time (null until one exists). Client counts cover only their company, and internal queue/supplier regions return zero/null.

## Work-order list

Optional query: `q` (title/description substring, case-insensitive; literal SQL wildcard characters are escaped), repeated `status[]` and `priority[]` (plain repeated `status`/`priority` also supported), `client_id`, `assignee_id`, `overdue=true|false`, `sort=updated_at|created_at|due_on|scheduled_for|priority|title`, `dir=asc|desc`, `page`, `pageSize`, `cursor`.

Defaults: updated_at descending, page 1, pageSize 25. Page size must be 1–100. Total is the count after all filters and RLS, before pagination. Sorts use id as a deterministic tie breaker and put null schedules last. Priority sorts low → normal → high → urgent ascending. Cursor is opaque and bound to user/workspace/filter/sort/pageSize; pass it with the same query and without page. Cursor pagination uses an offset, so concurrent inserts or updates can shift page boundaries. Invalid or unknown query values give 422.

Each listed order also includes `client_name`, `site_name`, and nullable `assignee_name`. Client/site names use the existing tenant-scoped RLS reads; assignee names use the same permission-checked lookup as order detail.

## Work-order writes

Create: `{title,description?,client_id?,site_id,priority?,status?,assignee_id?,due_on?,scheduled_for?}`. Requests start `open`; supplying a visit on an Open order automatically sets `scheduled`. Staff/admin may set assignment/schedule/priority and omit client_id to use the site's company. Assignee must be a staff/admin member of the same workspace. `due_on` is a nullable `YYYY-MM-DD` deadline. `scheduled_for` is a nullable offset ISO timestamp or calendar date; calendar visits resolve to 09:00 in the workspace timezone. Every source gets a permanent, workspace-unique `order_number` (display as `WO-N`).

Clients use `{title,description?,client_id?,site_id,priority?}`. The service forces their own client and `source="client"`, accepts only their sites, and rejects status/assignee/schedule fields (422). Hidden sites return neutral 404.

Patch: `{title?,description?,priority?,status?,assignee_id?,due_on?,scheduled_for?,updated_at?,reopen?}`, at least one mutable field. Provide the quoted ISO `ETag` from detail/create/update as `If-Match`, or provide the original ISO `updated_at` in the body. If-Match takes precedence. Missing/invalid version gives 422; stale version gives 409. Database versions advance monotonically at millisecond precision, including rapid updates. Changes lock the row; specific assignment, visit, deadline, details and status timeline entries, audit, and notifications commit together. Done orders allow comments but reject edits. An admin may explicitly send `reopen:true` with only `status` (Scheduled when a visit is retained, otherwise Open). Reopen has a confirmation in the UI. Other transitions remain unchanged. Lists/details and dashboard expose workspace timezone; lists expose `today` and each order’s `overdue` flag.

PLAN §5's progression is enforced as:

- open → scheduled or cancelled
- scheduled → in_progress or cancelled
- in_progress → waiting_on_parts, done, or cancelled
- waiting_on_parts → in_progress, done, or cancelled
- done/cancelled are terminal; setting the current status is allowed

Invalid transitions give 422 with `fields.status`. Every actual status change writes one timeline event and notifications for distinct requester/assignee recipients who still have access, excluding the actor. Notifications retain the actor name, event-time title, and previous/new statuses. Internal comments never reach client detail responses. Assignee detail exposes id/name/image, not email.

## Invites and request replay

Invite tokens expire seven days after creation. Only their SHA-256 hash is stored. Tokens are derived from a random invite UUID with HMAC-SHA256 and `AUTH_SECRET`, allowing keyed request replay without storing a plaintext token. Keep that secret stable. POST create returns the token for a link the caller can copy; no email is sent. Listing never returns it. States are pending, accepted, expired, revoked; listing reports elapsed pending invites as expired, and acceptance persists expiry.

Acceptance requires a signed-in email matching case-insensitively. Wrong email and unknown token return neutral 404. Expired/revoked tokens give 409. Accepted-token reuse by the same user returns the original successful acceptance; another user cannot reuse it. An existing workspace member cannot replace their role through an invite (409). Capability functions perform these operations with explicit caller/token checks, without granting the app general owner access.

Core POST create routes (workspaces, clients, sites, invites, work orders, comments) and invite acceptance support an optional `Idempotency-Key` header (1–200 characters). A key is scoped to the authenticated user and operation/path. Same key and parsed input return the original result with the original success status; a changed body gives 409. Advisory locking prevents concurrent duplicates. RLS isolates stored results by user, and the result and business write commit atomically. Failed writes roll back the key. Keys currently have no expiry. Revocation is state-idempotent and does not create records.

## Errors

Uniform JSON: `{error:{code,message,fields?}}`. No raw database/provider messages.

| Status | Meaning | Message |
|---|---|---|
| 401 | Missing session | Sign in to continue. |
| 403 | Role forbidden on accessible workspace/record | You don't have permission to make this change. |
| 404 | Not found or no access | We couldn't find that, or you don't have access. |
| 409 | Unique, stale update, last admin, key collision, invite unavailable, referenced delete | Plain explanation appropriate to the conflict |
| 422 | Zod/body/query validation or invalid transition | Plain message plus field errors |
| 500 | Unexpected failure | Something went wrong on our side. Your changes weren't saved. Try again. |

Priya PATCH on her own work order returns **403**. PATCH on a Northgate order returns **404**, as do all cross-workspace record requests.

## Spreadsheet imports and approval queue

All import/queue routes require staff or admin. Client members consistently receive **404**, including list/upload routes; other workspace users also receive neutral 404. Authentication is required first. `[rowId]` is a UUID. Writes use the existing audit triggers and tenant transaction context.

| Method | Path | Allowed roles | Body / query | Successful response |
|---|---|---|---|---|
| POST | /workspaces/[ws]/imports | Admin, staff | Multipart `file` (CSV/XLSX), or JSON `{sample:true}`; `force=true` optional | 200 `{id,status,headers,mapping,row_count}` |
| GET | /workspaces/[ws]/imports | Admin, staff | — | 200 import array, newest first |
| GET | /workspaces/[ws]/imports/[id] | Admin, staff | — | 200 import metadata, `counts`, `result_summary` |
| POST | /workspaces/[ws]/imports/[id]/mapping | Admin, staff | `{mapping:{title,description?,client?,site?,priority?,due_on?,scheduled_for?,external_ref?}}`, values are detected headers | 200 import summary plus `rows:{data,total,page,pageSize}` |
| GET | /workspaces/[ws]/imports/[id]/rows | Admin, staff | `status=valid|warning|error`, `decision=pending|approved|rejected`, `page` | 200 `{data,total,page,pageSize}` |
| GET | /workspaces/[ws]/imports/[id]/error-report | Admin, staff | — | 200 `text/csv` attachment; error rows, mapped columns and `reason` |
| POST | /workspaces/[ws]/imports/[id]/queue | Admin, staff | — | 200 summary and `excluded:[{id,row_number,errors}]` |
| GET | /workspaces/[ws]/queue | Admin, staff | Same row filters and `page` | 200 pending queued rows across imports, `{data,total,page,pageSize}` |
| POST | /workspaces/[ws]/queue/[rowId]/approve | Admin, staff | `{edits?}`, mapped field names with string values | 200 created work order, or original work order on replay |
| POST | /workspaces/[ws]/queue/[rowId]/reject | Admin, staff | `{reason}` (nonblank, at most 2,000 characters) | 200 rejected row and ISO `undo_until` |
| POST | /workspaces/[ws]/queue/[rowId]/undo | Admin, staff | — | 200 row returned to pending; expired/inapplicable undo gives 409 |
| POST | /workspaces/[ws]/queue/bulk-approve | Admin, staff | `{row_ids:[uuid,...]}` (1–500) | 200 `{data:[work_order,...],created}`; staff over 25 gives 403 |
| POST | /workspaces/[ws]/imports/[id]/draft-summaries | Admin, staff | — | 200 `{available:true,stored,suggestion:true}` or unavailable response below |
| GET | /ai-health | Any signed-in user | — | 200 `{providers:[{provider,status:"ok"|"error"}]}`; one entry per configured Gemini model/Groq provider |

CSV and XLSX use SheetJS CE 0.20.3. The first sheet contains unique, nonempty headers and at most 500 nonblank data rows; file content must be at most 2 MiB (displayed as “2 MB”). Limit/format errors are 422 and name the file and applicable limit. UTF-8 CSV is supported. Header guessing uses normalized aliases and substring matching; reviewers can replace the mapping. Header-only files are accepted. The bundled fictional sample has 40 data rows: 37 eligible, one unknown site, one invalid date, and one duplicate of a seeded open work order. Reject two eligible rows and approve 35 to get `result_summary:"35 created, 2 rejected"`.

The SHA-256 content hash is scoped to workspace. Re-upload returns 409 `already_imported`, message `You already imported this file on <date>.`, and the existing id in `error.fields.import_id[0]`. `?force=true` creates a fresh import. The dedupe check is serialized against concurrent uploads. Imports use their own content/state idempotency rather than `Idempotency-Key`.

States: `uploaded` → `mapped` → `queued` → `completed`. Remapping is allowed before queueing and replaces the validation rows atomically; it gives 409 after queueing. Rows store normalized `data`, `errors` and `warnings` (each a list of `{field,code,message}`), and `status=valid|warning|error`. Titles are required, trimmed and at most 200 characters. Site names/addresses and supplied client names match case-insensitively within the workspace; ambiguous or mismatched sites are errors. Blank client means derive the client from the site. Blank priority becomes normal; unknown priority becomes normal with a warning. Dates accept `YYYY-MM-DD`, `M/D/YYYY` (two-digit years interpreted as 20xx), or explicit ISO timestamps with offsets. Date-only values stay calendar dates during review. On approval, visit dates resolve to 09:00 in the workspace timezone; deadline dates remain dates. Impossible dates are errors.

Within-file duplicates use site plus whitespace-normalized lowercase title, and the later row gets `Duplicate of row N`. Open-order duplicates use the same site/title or the same nonblank external reference in the workspace; done/cancelled orders do not block. The error says `Already open as work order <title>`. Row numbers start at 1 for the first data row.

Queueing is idempotent: only valid/warning rows get `queued=true`; errors are excluded, remain undecided, and never appear in the queue. Rows initially have `decision=pending`, even before queueing; summary `counts.pending` counts only queued pending rows. Other counts are `valid,warning,error,approved,rejected`. Pagination defaults to page 1, 50 rows per page. Rows with AI fields carry `ai_is_suggestion:true`; AI never changes the mapped priority or summary/title automatically. Dashboard pending counts include only queued pending rows.

Approval validates edits with the same rules and rechecks live work-order duplicates. Workspace advisory locking and row locking serialize concurrent approvals, and the work order plus decision/link commit atomically. Approved replay returns the linked original order; it never creates a second order. Orders have `source="import"`. Bulk approval is atomic: any invalid/inaccessible row rolls back the entire batch. Duplicate ids in an allowed batch are processed once; `created` is the number of unique returned work orders, including replayed approvals. Rejected and unqueued rows cannot be approved (409). Undo is available for ten minutes, including after import completion; it reopens the queue. Completion occurs when no queued pending rows remain, including imports with only errors.

AI drafts process the next at most 25 pending queued rows without summaries per call. The provider chain tries Gemini `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite`, then Groq `openai/gpt-oss-120b`. Missing keys are skipped; errors/timeouts, invalid JSON and unavailable models fall through. Requests use a ten-second timeout and approximately 2,000 output tokens. Zod accepts only known row ids, summaries at most 140 characters, and valid priority values; invalid items are ignored. AI runs outside the tenant transaction; storage rechecks pending state and tenant scope. No raw provider response, exception or key is exposed. When unavailable, HTTP 200 returns `{available:false,message:"AI summaries are unavailable right now. You can still review and approve rows."}` and review/approval continue normally. Health pings configured endpoints with a minimal prompt; no configured keys yields an empty provider list. Live provider availability is optional and is not needed for tests or approval.

## Supplier simulator, signed ingest, check, repair, and cron

Cobalt is a **simulated supplier, part of this repo**. Responses include `supplier` with that label. Its tables are a separate source of truth; a dropped webhook still appears in its events API. Supplier routes require a session. Clients and other-workspace users receive neutral 404; staff receive 403 on admin operations. Placement is the explicit admin/staff write exception; all other staff supplier access is GET only.

| Method | Path | Allowed roles | Body / query | Successful response | Errors |
|---|---|---|---|---|---|
| GET | /workspaces/[ws]/supplier/orders | Admin, staff | — | 200 `{supplier,data:[{id,workspace_id,work_order_id,cobalt_ref,local_status,cobalt_status,last_sequence,updated_at}]}` | 401, neutral 404 |
| POST | /workspaces/[ws]/supplier/orders | Admin, staff | `{work_order_id:uuid}` | 201 order plus `supplier,event,webhook_delivered` | 401, neutral 404 for hidden work, 422 for closed work/invalid body |
| POST | /workspaces/[ws]/supplier/simulator/advance | Admin | `{cobalt_ref,status:"shipped"|"delivered"|"cancelled",drop?:boolean}` | 200 `{supplier,event,drop,delivered,receipt?}`; drop returns message `Simulate a missed webhook` | 401, 403 staff, neutral 404, 422 invalid transition/body |
| POST | /workspaces/[ws]/supplier/simulator/outage | Admin | `{outage:boolean}` | 200 `{supplier,outage}` | 401, 403 staff, neutral 404, 422 |
| GET | /workspaces/[ws]/supplier/simulator/events | Admin, staff | `since` optional nonnegative integer sequence (default 0) | 200 `{supplier,orders:[{cobalt_ref,work_order_id,status}],events:[event],cursor}`; events strictly after cursor | 401, neutral 404, 422 query, 503 Cobalt unavailable |
| POST | /workspaces/[ws]/supplier/check | Admin | No body | 200 `{supplier,run_id,mismatches:[mismatch],repaired:0}` | 401, 403 staff, neutral 404, 503 retryable supplier outage |
| POST | /workspaces/[ws]/supplier/repair | Admin | `{cobalt_ref?:string}`; `{}` repairs all | 200 `{supplier,run_id,mismatches:[mismatch],repaired:number}` (count of orders repaired) | 401, 403 staff, neutral 404 including unknown ref, 422 body, 503 retryable supplier outage |
| GET | /workspaces/[ws]/supplier/sync-runs | Admin, staff | — | 200 newest 100 runs: `{id,workspace_id,trigger,operation,started_at,finished_at,mismatches_found,repaired_count,status,error_message}` | 401, neutral 404 |
| POST | /webhooks/cobalt | Signed supplier, no session | Raw JSON event, signed headers below | 200 `{duplicate:false}`; repeat event id: 200 `{duplicate:true}` | 401 invalid/missing/expired signature, 400 malformed JSON, 422 invalid event or unavailable order |
| GET, POST | /cron/supplier-sync | Bearer cron capability, no session | `Authorization: Bearer <CRON_SECRET>`; no body | 200 `{workspaces,checked,repaired,errors,results:[{workspace_id,mismatches,repaired}|{workspace_id,error}]}` | 401 missing/invalid token; unexpected job setup errors 500 |

Event: `{workspace_id:uuid,cobalt_ref,event_id,sequence:positiveInteger,status:"ordered"|"shipped"|"delivered"|"cancelled",occurred_at:ISO}`. The signature is hex HMAC-SHA256 of `${timestamp}.${rawBody}`, keyed by `COBALT_WEBHOOK_SECRET`. Headers: `x-cobalt-timestamp` (Unix seconds), `x-cobalt-signature` (64 hex characters). Comparison is constant time for equal-length inputs. Timestamps more than five minutes in either direction are rejected. Verification precedes JSON parsing; errors never include the signing secret, raw body, or database text.

Supplier progression: ordered → shipped → delivered; ordered/shipped may become cancelled. Delivered/cancelled are terminal. Placement moves an in-progress work order to waiting_on_parts; other eligible nonterminal work retains its current status to respect the existing transition table. Delivery resumes waiting_on_parts → in_progress, using the existing timeline/audit and requester/assignee notification triggers. Older sequence receipts are stored without regressing local status; terminal states do not regress. Duplicate event ids never update local state, audits, timeline, or notifications.

A mismatch has `{cobalt_ref,work_order_id,cobalt_status,local_status,missing_event_ids,message}`. Check pulls the complete source stream from cursor 0 and compares receipt ids and statuses, without changing business data. It records a sync run. Repair applies missing events in sequence order with `received_via="reconcile"`, also heals a damaged local projection, and adds one `Repaired by sync` timeline entry per repaired order. Existing audit triggers capture the receipts, projection, timeline and work changes. Workspace locking and unique event ids serialize repairs and webhooks. Repeating repair returns `repaired:0` and creates no business audit/timeline/notification rows; it still records its own sync run and one completed-run audit entry. A late webhook for an event applied by repair returns `duplicate:true`.

Simulator source writes commit before signed in-process delivery, so delivery failures remain recoverable by repair. Placement/advance can succeed with `webhook_delivered:false` / `delivered:false` and a plain retry message; the source event remains durable. The outage flag blocks source reads and reconciliation with 503 `cobalt_unavailable`, message `Cobalt is unavailable right now. Try again.`; a failed check/repair persists a finished error sync run. Toggle the flag off to retry.

Cobalt is demo-only. All supplier session routes reject real workspaces with 409 `supplier_not_connected`; signed Cobalt webhooks reject them with neutral 404. Live supplier connections are not implemented. Cron preserves demo scenarios and currently returns zero counts because there are no live connections. `vercel.json` schedules the path daily at 03:00 UTC. Dashboard `last_supplier_sync_at` is the latest finished sync-run time (including failed runs), null before any run and always null for clients.

## Audit, notifications, and settings (Batch 5)

All paths below have the `/api` prefix and require a session. Unknown body/query keys and invalid values return 422. Cross-workspace access returns neutral 404.

| Method | Path | Roles | Input | Response |
|---|---|---|---|---|
| GET | /workspaces/[ws]/audit | Admin: all; staff: own actor rows; client: 404 | `actor` UUID, `action`, `entity`, `entity_id` UUID, `from`, `to` ISO timestamps, `sort=newest\|oldest`, `page`, `pageSize`, `cursor` | `{data,total,page,pageSize,next_cursor}` |
| GET | /workspaces/[ws]/audit/[id] | Same audit RLS | — | Audit item; hidden actor row gives 404 |
| GET | /workspaces/[ws]/notifications | Any member, own notifications only | `unread=true\|false`, `page`, `pageSize`, `cursor` | `{data,total,unread_count,page,pageSize,next_cursor}` |
| GET | /notifications/unread-count | Any signed-in user | — | `{unread_count,workspaces:[{workspace_id,unread_count}]}` across current memberships |
| POST | /workspaces/[ws]/notifications/[id]/read | Recipient member | No body | `{id,read_at}`; repeated read preserves timestamp |
| POST | /workspaces/[ws]/notifications/[id]/unread | Recipient member | No body | `{id,read_at:null}` |
| POST | /workspaces/[ws]/notifications/read-all | Recipient member | No body | `{changed}`; repeat returns zero |
| GET | /me/preferences | Any signed-in user | — | `{user_id,theme,email_notifications,timezone,updated_at}` |
| PATCH | /me/preferences | Any signed-in user | Nonempty `{theme?,email_notifications?,timezone?}` | Updated preferences |
| PATCH | /me | Any signed-in user | `{name}` trimmed, 1–80 characters | `{id,name,email,image}` |
| GET | /workspaces/[ws]/settings | Any member | — | `{id,name,timezone}` |
| PATCH | /workspaces/[ws]/settings | Admin; staff/client 403 | Nonempty `{name?,timezone?}` | Updated workspace |

Audit items contain `id,at,actor,action,entity,entity_id,summary,before,after,link_target` plus actor attribution. `link_target` links to the visible work order. Feed totals and pagination exclude notification events, duplicate timeline records, import-row churn without a changed review decision, unchanged import stages, and unknown internal tables. Raw audit storage remains complete. Event-time titles are persisted independently of current titles. `actor` is `{id,name,email}` (identity fields may be null), or null for system operations. Snapshot redaction recursively removes token, secret, password, credential, authorization and API/private-key fields. Status summaries use human wording. Audit is read-only with no write routes or app INSERT/UPDATE/DELETE privilege. There is no stored result column, so `result` filtering is unsupported (422). Dates are inclusive; from must not exceed to.

Both feeds default to newest first, page 1 and pageSize 25 (1–100). Total is after RLS and filters. Sort ties use id. Opaque cursors are scoped to user, workspace, filters, sort and pageSize; use the same query without `page`. As with work-order pagination, offsets may shift under concurrent writes. Notifications contain `id,kind,entity,entity_id,message,created_at,read_at,link_target`; the link is `{entity,id}` only when the referenced work order is still visible through RLS, otherwise null. Current event producers and the existing fixture use work-order targets. Another recipient's id or an id in another workspace gives 404. List `unread_count` counts all unread notifications in that workspace regardless of list filter; cross-workspace counts omit zero-count workspaces. Management never creates synthetic notifications.

Preferences initialize on first GET/PATCH with theme `system`, email notifications enabled, timezone null. Theme accepts `light|dark|system`; timezone accepts a valid IANA name or null. Email preference is stored for future delivery; this backend sends no email. Personal preferences and profile changes are excluded from workspace audit because they have no workspace scope.

Workspace settings reuse Batch 2's existing service, RLS and audit trigger. The original `/workspaces/[ws]` PATCH remains available with the same admin permission and now the same trimmed 1–80 character name limit. Workspace timezone is non-null and validated using Intl. Existing confirmed deletion at DELETE `/workspaces/[ws]` is reused without a second deletion route.

## Per-visitor demo sandboxes

All demo names/data are fictional. Demo entry is public and requires no Google sign-in. Each successful start creates an independent 24-hour sandbox, four demo identities and one Auth.js database session. Responses set the same configured Auth.js session cookie: `authjs.session-token` locally, `__Secure-authjs.session-token` in production, Path=/, HttpOnly, SameSite=Lax, Secure in production, with expiry at the sandbox deadline. The token is never returned in JSON. Demo endpoints do not support request replay; retry start after a failed transaction.

| Method | Path | Allowed roles | Body / query | Successful response |
|---|---|---|---|---|
| POST | /demo/start | Public | `{persona:"dana"|"sam"|"priya"|"omar"}` | 201 `{workspace_id,persona,expires_at}` plus session cookie |
| POST | /demo/switch | Current live demo session | Same persona body | 200 same sandbox id and deadline, chosen persona, replacement session cookie |
| POST | /demo/reset | Current live demo session | `{confirm:true}` | 200 replacement sandbox id, preserved persona, new 24-hour deadline and session cookie |
| GET | /demo/isolation-check | Current live demo session | — | 200 `{database_role,role,client,query,params,row_count,cross_workspace,explanation?}` |
| GET, POST | /cron/demo-cleanup | Bearer CRON_SECRET | — | 200 `{workspaces,users,sessions}` deleted counts |
| GET | /workspaces | Signed in | — | 200 accessible workspace array, ordered by name; real accounts never list demo sandboxes |

Dana is admin, Sam staff, Priya a Harbor & Pine client, Omar a Northgate client. Sandbox data comes from the shared development fixture builder: three clients (including empty Larkspur Coworking Studio), six sites, 60 orders across six statuses/four priorities with dates relative to creation time, both comment visibilities, four supplier orders/source orders, one dropped delivery to repair, one pending import queue row, and three event notifications. Supplier references/event ids are namespaced by sandbox so visitors cannot collide.

Switch deletes all sessions for identities in that sandbox before creating the selected identity's session. Reset requires literal `confirm:true` (missing/false → 422); it atomically deletes the old sandbox and all its demo users/sessions, then creates a replacement with a **new workspace id**. Existing record URLs become unavailable. The persona is preserved; client/site/order ids change. Failures roll back the replacement operation. Real sessions receive neutral 404 from demo-only operations; missing/expired sessions receive 401.

Isolation evidence runs parameterized work-order SQL inside `withUser` on the non-owner app connection. Priya gets zero Northgate rows; Omar can see Northgate because it is his company. Staff/admin responses explain workspace-wide client access and show the Northgate rows they are allowed to see. Every persona also receives a cross-workspace query with zero rows, targeting an existing other workspace if available. Params contain UUIDs only; no cookie/token/email appears. Owner metadata lookup chooses ids, but never supplies the work-order query/result evidence.

Start serializes live-cap/rate checks and creation in one transaction. `DEMO_MAX_SANDBOXES` defaults to 200; positive integer configuration overrides it. Each IP hash may create five sandboxes per rolling hour; only an HMAC-SHA256 hash using AUTH_SECRET is stored, never a raw IP. On Vercel the trusted `x-vercel-forwarded-for` first address supplies the IP; local/non-Vercel execution shares a `local` bucket because a Web Request has no socket peer address. Untrusted forwarded headers are ignored. Other hosts need a trusted peer-address integration before exposing public entry. Limits return 429 `demo_limit` with “The demo is busy. Please try again later.” Unexpected creation failure returns 503 `demo_retry` with a plain retry message and no partial data/session/rate charge.

Demo users receive 403 for workspace creation/deletion, invite creation/revocation/acceptance, and member mutation. Member/invite reads retain ordinary role permissions. Other work-order/client/site/import/settings/supplier operations retain their sandbox role rules. Inviting a reserved demo address returns 422; DB triggers also reject demo targets and invites into demo workspaces. DB triggers prevent real/demo mixed membership, cross-sandbox membership, and Google account attachment to demo users; no auth accounts are seeded for demo identities. Auth.js sign-in also rejects demo identities/reserved emails. Real workspace deletion continues to retain its audit history.

Cleanup requires constant-time Bearer CRON_SECRET authentication for both methods (401 otherwise), deletes only expired demos, and is idempotent. It removes dependent tenant data, Cobalt state, demo audit history, request replay records, users, preferences and sessions. Counts represent actual deleted workspaces/users/sessions. Daily Vercel cleanup is scheduled at 04:00 UTC; the existing supplier cron stays at 03:00 UTC. Start opportunistically cleans up at most ten expired sandboxes. Scheduled supplier sync skips all demos to preserve their missed-delivery scenario; manual sync and authenticated webhooks still work within their scoped sandbox until deletion.

## Agent access: API tokens, MCP server, assistant

All paths below include `/api`. Token management and the assistant require a session (including a live demo cookie). Bearer tokens authenticate **only** MCP and cannot create further tokens or access session routes.

| Method | Path | Authentication / role | Input | Response |
|---|---|---|---|---|
| POST | /workspaces/[ws]/tokens | Session, any member; creates own | `{name,scope:"read"\|"write",expires_in_days?:1..365}` | 201 token metadata plus `token`, shown once |
| GET | /workspaces/[ws]/tokens | Session, own tokens; admin may list workspace | `all=true` for admins (other roles still own only) | Token metadata array, never hash/plaintext |
| POST | /workspaces/[ws]/tokens/[id]/revoke | Session, owner or workspace admin | No body | Revoked metadata; repeats preserve revoked_at; hidden id 404 |
| POST | /mcp | Bearer API token | Streamable HTTP JSON-RPC initialize, tools/list, tools/call, notifications | Official MCP protocol responses; tool errors have `isError:true` |
| GET | /mcp | Bearer API token | Accept text/event-stream | SDK SSE response; closed at request completion, no persistent notifications |
| DELETE | /mcp | Bearer API token | No body | 200; stateless, no session retained |
| POST | /workspaces/[ws]/assistant | Session, any member | `{messages:[{role:"user"\|"assistant",content}],confirm_action_id?:uuid}` | Read reply, pending action, confirmation result, or unavailable response |

Tokens use `gw_` plus 32 cryptographically random bytes encoded base64url. Only SHA-256 hashes are stored; the nonsecret short prefix supports display. Names are trimmed, 1–80 characters. Real users may omit expiry (null); supplied days are integer 1–365. Demo expiry is always capped to both 24 hours and the sandbox deadline, even when omitted. Workspace/user cascade deletion removes tokens and pending actions during demo reset/cleanup and workspace deletion. Removed membership invalidates the capability immediately; changing a role/client takes effect on subsequent tool calls through the current membership. Revoked/expired/demo-expired/unknown/missing tokens yield 401 with `WWW-Authenticate: Bearer` and the same message: `Invalid or expired token.` Hash lookup is parameterized on a fixed-length SHA-256 digest; no plaintext equality comparison occurs. Successful authentication updates last_used_at at most once per five minutes.

The official SDK server is named `groundwork`, with the package.json version. Each HTTP request gets a fresh McpServer and WebStandardStreamableHTTPServerTransport, `sessionIdGenerator:undefined`, JSON responses enabled: no sticky sessions, persistent MCP session IDs or owner-connection business-data access. POST requires `Accept: application/json, text/event-stream` and JSON content type. SDK protocol errors preserve protocol status codes. Per-token rate limiting is **not implemented**; deployment-level limits can be added later.

MCP and the assistant use the single registry in `lib/agent/tools.ts` and the existing REST services. All tenant data runs through `withUser` on the non-owner app role and FORCE RLS. Results include JSON in text content and `{result:...}` structuredContent; sanitized API errors include isError, a plain text message and structuredContent.error. Read-scoped tokens **list write tools but reject every write call** with `This token is read-only.` before argument validation or mutation. MCP input validation uses the same plain error boundary as REST. No bulk approval, management, supplier or token-creation tools are exposed.

| Tool | Scope required | Roles / inputs |
|---|---|---|
| list_work_orders | read or write | Any member; q, status[], priority[], client_id, sort, dir, page, pageSize; same REST filters/pagination |
| get_work_order | read or write | Any member; id; clients never receive internal comments, hidden/cross-workspace ids return neutral not found |
| create_request | write | Any member; title, site_id, description?, client_id?, priority?; client company/source forced |
| update_work_order_status | write | Staff/admin; id, status, **updated_at required** from get_work_order; stale 409, same workflow transitions |
| add_comment | write | Any member on visible work; work_order_id, body, visibility; clients only client visibility |
| list_approval_queue | read or write | Staff/admin; page, status?, decision?; client access neutral not found |
| approve_queue_row | write | Staff/admin; row_id, edits? with mapped spreadsheet fields; existing validation and replay behavior |
| reject_queue_row | write | Staff/admin; row_id, reason |
| get_dashboard | read or write | Any member; visible metrics only |
| list_sites | read or write | Any member; visible sites only, useful for request IDs |
| whoami | read or write | Any member; current user/workspace/role/client/scope |

Token tool writes retain actor_id = token owner and record actor_kind=`agent`, via_token_id and a snapshot via_token_name in audit rows. Assistant confirmed writes record actor_kind=`assistant`, with null token attribution. Session writes retain actor_kind=`user`. GET audit list/detail now include actor_kind, via_token_id and via_token_name under their existing admin/all and staff/own RLS. Token management is audit-triggered, and hashes are omitted from stored token audit snapshots. Before/after response redaction remains unchanged; token ids/names are exposed only in the explicit attribution fields. Attribution settings are transaction-local and isolated with AsyncLocalStorage; they never persist on pooled connections.

Assistant messages accept at most 30 entries, each 1–20,000 characters. Function calling uses the configured Gemini model chain from lib/ai.ts, then Groq; missing keys are skipped, provider errors/timeouts/malformed responses fall through, output is capped at 2,000 tokens per turn, with at most four tool iterations and eight calls per iteration. Native provider function-call/result messages carry read results. Read tools execute immediately. A proposed write never executes: the backend validates and stores `{user_id,workspace_id,tool,args}` for ten minutes and returns `{available:true,reply,pending_action:{id,tool,args,summary}}`. The summary is generated server-side for review; work-order actions use the visible order title. The assistant acts with current session permissions, including demos.

Confirm with `{messages:[],confirm_action_id:"..."}`. The same user and workspace must own the action. The backend locks the pending row and executes its stored arguments through the shared registry, then consumes it **in the same app-role transaction**. Simultaneous/repeated confirmations cannot double-write: consumed actions return plain 409. Expired actions return plain 409; other-user/workspace/unknown ids return neutral 404. Service permission or validation failures return a sanitized isError result and consume the action when the transaction remains valid; DB failures roll back both mutation and consumption. Confirmation needs no AI key and makes no provider calls. No cancel route is implemented; unconfirmed actions expire.

When no provider is configured or all fail, HTTP 200 returns exactly:
`{"available":false,"message":"The assistant is unavailable right now. You can still do everything from the app."}`.
Live provider calls and interactive Google OAuth remain deployment verification tasks; automated tests mock providers.

For clients supporting remote HTTP MCP, use a token created in the desired workspace:

```json
{"mcpServers":{"groundwork":{"url":"https://<your-deployment>/api/mcp","headers":{"Authorization":"Bearer gw_..."}}}}
```

For stdio-only clients with `mcp-remote` available:

```json
{"mcpServers":{"groundwork":{"command":"npx","args":["-y","mcp-remote","https://<your-deployment>/api/mcp","--header","Authorization:${GROUNDWORK_AUTH}"],"env":{"GROUNDWORK_AUTH":"Bearer gw_..."}}}}
```

Keep the actual token in the client's private configuration/secret storage, never source control. An initialize request (set GROUNDWORK_TOKEN privately first):

```sh
curl 'https://<your-deployment>/api/mcp' \
  -H "Authorization: Bearer $GROUNDWORK_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

Client request form lookup: `GET /api/workspaces/[ws]/request-sites` is client-only and returns `{id,client_id,name,address}[]` for the current membership’s company, ordered by name/id under app-role RLS. Provider roles receive 403; missing workspace membership receives neutral 404. Isolation evidence also includes `database_role`, read with `current_user` on the same non-owner connection that ran the evidence query.

## QA date and import behavior (2026-10-11)

Import mapping separates `due_on` (Due date / Due / Deadline / Date) from `scheduled_for` (Scheduled for / Scheduled date / Visit date). Calendar cells remain YYYY-MM-DD throughout validation and review. Visits become workspace-local 09:00 timestamps only on approval. Explicit offset timestamps remain instants; deadlines derived from them use the workspace day. Review and error CSV render readable workspace-local dates and priorities.

A reused external reference, even on completed work, is an error under `external_ref`. Exact repeats match title, site, reference and dates; similar titles with another site/reference/date are warnings under `title`. Approval rechecks the same rules. The sample still has 37 eligible and 3 error rows, with 35 created and 2 rejected after the sample review. Demo rows include actual client/site names and both calendar date fields.

Assistant/MCP `list_work_orders` supports `overdue:true` and `sort:due_on`; `update_work_order_dates` sets independent deadlines and visits through the same versioned service. `get_dashboard` and work-order lookups use the shared overdue definition. `get_work_order_by_number` uses the stored number, never title parsing.


QA API updates (2026-10-11): `GET /api/invites/accept?token=…` validates the signed-in recipient, status and expiry without accepting or consuming the invite. Invalid token shape returns 422, unknown/wrong-account returns neutral 404, expired/used/unavailable returns 409, and a valid invite returns `{status:"pending"}` (same-user reuse returns `accepted`). POST still revalidates atomically. Staff REST comments and MCP comments default to `internal` when visibility is omitted; REST client comments default to `client` and reject `internal`. The assistant additionally requires an explicit client-visibility instruction before proposing a staff client-visible comment. Signed-out requests return 401 `unauthenticated`; an invalid session cookie or retained session-presence hint returns `session_expired`, and expired demos return `demo_ended`. Presence hints are non-authoritative and cleared by intentional sign-out.
