# ROLE20 Permission table and confirmation rules

Written Oct 18 2026 from the live code (lib/agent/role-tools.ts, lib/agent/tools.ts, lib/services/assistant.ts). The table below is generated from those files, so it matches what the server enforces today.

## The one rule

The agent never does more than the person could do with the buttons. Every tool call is checked on the server, for the in app Agent and for Connect AI keys alike. A refused call goes back to the model as a plain reason it can repeat to the person; it never shows an error page.

## Roles

| Role | Who | Home |
|---|---|---|
| Owner | Admin who owns the company. Big companies can turn on Company overview. | /overview or /dashboard |
| Admin | Runs the company: people, money, settings, clients and sites. | /dashboard |
| Supervisor | Runs the work: approves requests, books people, sends prices, decides time off. | /dashboard |
| Office staff | Books jobs and answers clients. Can not run the team, money or company settings. | /dashboard |
| Technician | His own jobs only: status, report, notes, suggestions, time off. | /today |
| Facility manager | Client side lead: raises requests, answers prices, confirms visits, sees fix history. | /home |
| Client staff and household | Raise and follow requests for their own client only. | /home |

Opening another role's home sends the person to their own home (fixed Oct 18: this used to show an error page).

## What needs a confirmation card

1. Every tool marked Change below shows a card with what will change, and runs only after the person taps Confirm. The card is single use: a second tap gets "This action has already been confirmed."
2. Exception: a team note (internal comment) by admin, supervisor or technician is saved straight away and still logged in What I did, when the company is on Ask before important changes. On Ask before every action, even a team note waits for a card.
3. The admin chooses the mode (set_approval_mode, admin only): important or every.
4. Connect AI keys: in Ask before every action, a key's change waits in Waiting for your approval on Home until an admin approves or declines it.
5. Read tools never need a card.

## What is refused, and the reason given

| Request | Who is refused | Reason |
|---|---|---|
| Change how a job is paid, approval mode, role names, member roles | Everyone but admin | Admin only. |
| Add or change clients and sites | Everyone but admin | Only workspace admins can add or change clients and sites. |
| Approve or decline a request or suggestion, decide time off, set skills, add a worker | Office staff | Supervisor or admin decides. |
| Reassign a job, change another person's job | Technician | His own jobs only (server returns 403). |
| Create a job | Technician | Ask a supervisor to create the job; he can suggest one. |
| See another client's job | Every client user | Not found, never a hint that it exists. |
| See internal notes | Every client user | Notes marked internal are never sent to client users. |
| Rate a job twice | Client users | One rating per job. |
| Answer a visit check | Everyone but client users | Only the client answers the visit check. |
| Create sign in links | Everyone | Rejected on purpose (AGENT14): an agent holding a login link is an account takeover risk. |
| Book someone on leave | Everyone | The booking is refused while the person is away. |

Emergencies (gas, fire, water near power and similar) get a safety line first, before any tool runs, and the request is marked urgent.

## Tool table

Change tools need a card (see the rules above). Counts: owner and admin 63, supervisor 55, office staff 50, technician 31, facility manager 25, client staff and household 22.

| Tool | Kind | Owner and admin | Supervisor | Office staff | Technician | Facility manager | Client staff and household |
|---|---|---|---|---|---|---|---|
| add_comment | Change | Yes | Yes | Yes | Yes | Yes | Yes |
| add_worker | Change | Yes | Yes |  |  |  |  |
| answer_quote | Change | Yes | Yes | Yes |  | Yes |  |
| approve_queue_row | Change | Yes | Yes | Yes |  |  |  |
| approve_suggestion | Change | Yes | Yes |  |  |  |  |
| ask_supervisor | Change | Yes | Yes | Yes | Yes |  |  |
| assign_work_order | Change | Yes | Yes | Yes |  |  |  |
| confirm_visit | Change | Yes | Yes | Yes |  | Yes |  |
| create_client | Change | Yes |  |  |  |  |  |
| create_request | Change | Yes | Yes | Yes |  | Yes | Yes |
| create_site | Change | Yes |  |  |  |  |  |
| decide_time_off | Change | Yes | Yes |  |  |  |  |
| decline_suggestion | Change | Yes | Yes |  |  |  |  |
| fill_onboarding | Change | Yes | Yes | Yes | Yes | Yes | Yes |
| forget_about_me | Change | Yes | Yes | Yes | Yes | Yes | Yes |
| reject_queue_row | Change | Yes | Yes | Yes |  |  |  |
| remember_about_me | Change | Yes | Yes | Yes | Yes | Yes | Yes |
| remove_document | Change | Yes | Yes | Yes |  |  |  |
| rename_role | Change | Yes |  |  |  |  |  |
| request_time_off | Change | Yes | Yes | Yes | Yes |  |  |
| save_job_report | Change | Yes | Yes | Yes | Yes |  |  |
| send_message | Change | Yes | Yes | Yes | Yes | Yes | Yes |
| send_quote | Change | Yes | Yes | Yes |  |  |  |
| send_team_message | Change | Yes | Yes | Yes | Yes |  |  |
| set_approval_mode | Change | Yes |  |  |  |  |  |
| set_call_me | Change | Yes | Yes | Yes | Yes | Yes | Yes |
| set_job_payment | Change | Yes |  |  |  |  |  |
| set_job_trade | Change | Yes | Yes | Yes |  |  |  |
| set_member_roles | Change | Yes |  |  |  |  |  |
| set_priority | Change | Yes | Yes | Yes |  |  |  |
| set_worker_skills | Change | Yes | Yes |  |  |  |  |
| suggest_contact_name | Change | Yes | Yes | Yes | Yes | Yes | Yes |
| suggest_job | Change | Yes | Yes | Yes | Yes |  |  |
| update_client | Change | Yes |  |  |  |  |  |
| update_document | Change | Yes | Yes | Yes |  |  |  |
| update_site | Change | Yes |  |  |  |  |  |
| update_work_order_dates | Change | Yes | Yes | Yes |  |  |  |
| update_work_order_status | Change | Yes | Yes | Yes | Yes |  |  |
| ask_choice | Read | Yes | Yes | Yes | Yes | Yes | Yes |
| fix_history | Read | Yes | Yes | Yes |  | Yes |  |
| get_dashboard | Read | Yes | Yes | Yes |  |  |  |
| get_onboarding | Read | Yes | Yes | Yes | Yes | Yes | Yes |
| get_schedule | Read | Yes | Yes | Yes | Yes |  |  |
| get_work_order | Read | Yes | Yes | Yes | Yes | Yes | Yes |
| get_work_order_by_number | Read | Yes | Yes | Yes | Yes | Yes | Yes |
| list_approval_queue | Read | Yes | Yes | Yes |  |  |  |
| list_clients | Read | Yes | Yes | Yes |  |  |  |
| list_contacts | Read | Yes | Yes | Yes | Yes | Yes | Yes |
| list_documents | Read | Yes | Yes | Yes | Yes |  |  |
| list_job_photos | Read | Yes | Yes | Yes | Yes | Yes | Yes |
| list_leave_requests | Read | Yes | Yes | Yes | Yes |  |  |
| list_messages | Read | Yes | Yes | Yes | Yes | Yes | Yes |
| list_sites | Read | Yes | Yes | Yes |  | Yes | Yes |
| list_suggestions | Read | Yes | Yes | Yes | Yes | Yes | Yes |
| list_team | Read | Yes | Yes | Yes |  |  |  |
| list_team_messages | Read | Yes | Yes | Yes | Yes |  |  |
| list_work_orders | Read | Yes | Yes | Yes | Yes | Yes | Yes |
| my_day | Read | Yes | Yes | Yes | Yes |  |  |
| my_memory | Read | Yes | Yes | Yes | Yes | Yes | Yes |
| needs_attention | Read | Yes | Yes | Yes | Yes | Yes | Yes |
| notification_status | Read | Yes | Yes | Yes | Yes | Yes | Yes |
| suggest_worker | Read | Yes | Yes | Yes |  |  |  |
| whoami | Read | Yes | Yes | Yes | Yes | Yes | Yes |

## How this is tested

* tests in the gate check the role lists and the refusals (759 tests on Oct 18).
* e2e/walk-flows.mjs walks the full job life across every role on the live demo: 41 checks, 0 gaps on Oct 18.
* e2e/crawl-routes.mjs opens 22 pages for 8 people at 390: no crash pages, no page errors, no sideways scroll on Oct 18.

## SEC07 data controls

Every signed in role can export their own profile, preferences and authored or assigned work through Settings, and can confirm their own account deletion request. Company exports and deletion request handling require an active admin or owner membership in that exact company. Supervisors and office staff do not inherit those powers. Only an owner can close a company. Another company returns 404; a disallowed role in the same company returns 403. Multiple company memberships each need approval before account deletion completes. Demo deletion and closure are labelled practice actions that preserve the sandbox. See [SEC07 data protection](SEC07-data-protection.md) for retained history, expiry and schema limitations.
