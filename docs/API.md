# Groundwork API — Milestone 2

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

Dashboard returns all six status counts, overdue nonterminal orders (`scheduled_for < now`), waiting-on-parts count, pending import-row count, and latest recorded supplier-event receipt time (null until one exists). Client counts cover only their company, and internal queue/supplier regions return zero/null.

## Work-order list

Optional query: `q` (title/description substring, case-insensitive; literal SQL wildcard characters are escaped), repeated `status[]` and `priority[]` (plain repeated `status`/`priority` also supported), `client_id`, `assignee_id`, `sort=updated_at|created_at|scheduled_for|priority|title`, `dir=asc|desc`, `page`, `pageSize`, `cursor`.

Defaults: updated_at descending, page 1, pageSize 25. Page size must be 1–100. Total is the count after all filters and RLS, before pagination. Sorts use id as a deterministic tie breaker and put null schedules last. Priority sorts low → normal → high → urgent ascending. Cursor is opaque and bound to user/workspace/filter/sort/pageSize; pass it with the same query and without page. Cursor pagination uses an offset, so concurrent inserts or updates can shift page boundaries. Invalid or unknown query values give 422.

## Work-order writes

Create: `{title,description?,client_id?,site_id,priority?,status?,assignee_id?,scheduled_for?}`. Requests start `open`; staff/admin may set assignment/schedule/priority and omit client_id to use the site's company. Assignee must be a staff/admin member of the same workspace.

Clients use `{title,description?,client_id?,site_id,priority?}`. The service forces their own client and `source="client"`, accepts only their sites, and rejects status/assignee/schedule fields (422). Hidden sites return neutral 404.

Patch: `{title?,description?,priority?,status?,assignee_id?,scheduled_for?,updated_at?}`, at least one mutable field. Provide the quoted ISO `ETag` from detail/create/update as `If-Match`, or provide the original ISO `updated_at` in the body. If-Match takes precedence. Missing/invalid version gives 422; stale version gives 409. Database versions advance monotonically at millisecond precision, including rapid updates. Changes lock the row; timeline, audit, and notifications commit together.

PLAN §5's progression is enforced as:

- open → scheduled or cancelled
- scheduled → in_progress or cancelled
- in_progress → waiting_on_parts, done, or cancelled
- waiting_on_parts → in_progress, done, or cancelled
- done/cancelled are terminal; setting the current status is allowed

Invalid transitions give 422 with `fields.status`. Every actual status change writes one timeline event and notifications for distinct requester/assignee recipients who still have access. Internal comments never reach client detail responses. Assignee detail exposes id/name/image, not email.

## Invites and request replay

Invite tokens expire seven days after creation. Only their SHA-256 hash is stored. Tokens are derived from a random invite UUID with HMAC-SHA256 and `AUTH_SECRET`, allowing keyed request replay without storing a plaintext token. Keep that secret stable. POST create returns the token for a link the caller can copy; no email is sent. Listing never returns it. States are pending, accepted, expired, revoked; listing reports elapsed pending invites as expired, and acceptance persists expiry.

Acceptance requires a signed-in email matching case-insensitively. Wrong email and unknown token return neutral 404. Expired/revoked tokens give 409. Accepted-token reuse by the same user returns the original successful acceptance; another user cannot reuse it. An existing workspace member cannot replace their role through an invite (409). Capability functions perform these operations with explicit caller/token checks, without granting the app general owner access.

All POST create routes and invite acceptance support an optional `Idempotency-Key` header (1–200 characters). A key is scoped to the authenticated user and operation/path. Same key and parsed input return the original result with the original success status; a changed body gives 409. Advisory locking prevents concurrent duplicates. RLS isolates stored results by user, and the result and business write commit atomically. Failed writes roll back the key. Keys currently have no expiry. Revocation is state-idempotent and does not create records.

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
