# Groundwork connections

Local review of the master feature ledger and current code, October 13 2026. No deployment or real database access.

Status describes the code connection. Tests are listed in the local progress log. External delivery and future ledger features remain separate from local service checks.

## Technician suggests a job

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Technician | Admin and supervisor | Suggested jobs on Home, Suggested list, bell, Agent list_suggestions | Review then approve or decline | fixed now |

## Client or household sends a request

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Client or household | Admin and supervisor, then sender | Suggested jobs on Home, Suggested list, sender request list, bell, Agent | Request Received becomes a linked job or Not accepted with a reason | fixed now |

## Household preferred visit time

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Household | Supervisor | Suggested review, job detail, schedule and assignment form, Agent get_work_order | Assign a visit that suits the household | fixed now |

## Leave request and decision

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Technician | Admin and supervisor, then technician | Home leave requests, bell, schedule away rows, Agent list_leave_requests | Approved leave blocks booking; existing clashes are shown for a supervisor to move | works |

## Quote sent and answered

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Admin or supervisor | Client manager, then office | Job price panel, bell, Agent answer_quote | Manager accepts or declines; office sees the decision | works |

## Job closed with an outcome

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Technician or office | Client and supervisor | Job report, fix history, Today job counts, job list, bell, Agent | History keeps the outcome and worker; counts update from jobs | works |

## Role change

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Admin | Changed member and office | Team, live permissions, navigation, Agent whoami | Next request uses the new permissions | works |

## Member archived

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Admin | Office and affected technician | Team, picker, schedule, job list, live sign in guard, Agent | Open jobs become unassigned and preserved history retains the name | works |

## Client or site archived

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Admin | Office and client | Active lists, archived lists, job form, Suggested approval, Agent | No new jobs until restored; history remains readable | works |

## Job cancelled or restored

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Office | Assigned technician and client | Job list, schedule, history, bell, Agent | Cancelled work leaves active counts and returns when restored | works |

## WhatsApp incoming message

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Known client contact or caller | Admin and supervisor | Suggested list, Home suggested jobs, bell, Agent | Review unmatched client and site before approval | fixed now |

## WhatsApp provider connection

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| External provider | Intake | Guarded webhook stub | Connect a provider outside this task | missing |

## Feedback sent

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Any signed in member | Private feedback inbox owner | Ideas and help, external inbox | Owner reviews the idea or problem | works |

## Job assignment

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Admin or supervisor | Assigned technician | Today, My jobs, schedule, push, bell, Agent | Technician starts work or asks the office for help | fixed now |

## Job status changes

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Technician or office | Client manager, office staff and owning household | Request list, client Home, job detail, bell, Agent | Client follows the booked visit and final result | fixed now |

## Comment visible to client

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Office or technician | Client readers of this job | Job comments, Messages tab, bell, Agent | Client replies on the same job | fixed now |

## Client comment

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Client or household | Office and assigned technician | Job comments, Messages tab, bell, Agent | Team answers the request | fixed now |

## Import review

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Office | Admin or supervisor | New requests count, review list, Agent list_queue | Approved rows become jobs; refused rows retain reasons | works |

## Job report needs a part

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Technician | Office | Waiting on parts jobs, job report, dashboard count, Agent | Office orders a part and returns the job to work | works |

## Supplier event

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Supplier simulator | Office and assigned worker | Parts list, job history, bell and Agent supplier_status | Delivery permits the next job step | works |

## Company document expiry

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Office | Responsible person and office | Home reminder, Documents, push, Agent list_documents | Replace the expired document | works |

## Field sign in code

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Admin or supervisor | Invited technician | Team sign in link, join page | Technician signs in once and reaches Today | works |

## Client manager confirms visit

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Client manager | Office | Job visit panel, bell, Agent confirm_visit | A new booked time needs a new confirmation | works |

## Personal Agent settings

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Each user | That user only | Settings, own Agent, own Agent log | Name and voice choices follow that user | works |

## Connected Agent writes

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Token owner | That user or approval queue | Confirm card or approval queue, own action log | Authorized service runs after confirmation | works |

## Private photo

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Technician or message sender | Authorized job or thread readers | Photo view, job history or message | Readers can open the photo through the private API | works |

## Personal language

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Each user | That reader only | Settings, translated interface and messages | Original content stays available | works |

## Demo reset

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Demo member | Members of that visitor sandbox | Demo controls, all lists and counts | Old sandbox is removed and fresh fictional data appears | works |

## Web push device delivery

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Each member | That device | Bell plus browser push | Delivery needs a real device check outside this task | missing |

## Planned ledger features

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Future product work | Future roles and readers | Future invoices, ratings, assets, reminders, memory and planning | These are future features rather than broken links in existing actions | missing |

## Verification limits

The requested shared folder is outside the writable workspace. This repository copy is ready to copy to groundwork-connections.md in that folder. The ordinary test runner needs sockets, which this sandbox denies. Serial service and RLS tests use a temporary Postgres cluster with no sockets. Concurrent transaction tests still require the ordinary runner. Real WhatsApp wiring, push delivery on a real phone and external feedback delivery were not contacted.

## Messages: Technician and client

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Technician, client or household | The other person in either direction | Messages or the job Messages tab, unread dot, bell, Agent list_messages and attention | Their assigned job connects them; reply in the same private thread | fixed now |

## Messages: Technician and admin

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Technician or admin | The other person in either direction | Messages or the job Messages tab, unread dot, bell, Agent list_messages and attention | Company support; reply in the same private thread | fixed now |

## Messages: Technician and supervisor

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Technician or supervisor | The other person in either direction | Messages or the job Messages tab, unread dot, bell, Agent list_messages and attention | Work planning; reply in the same private thread | fixed now |

## Messages: Client and admin

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Client or admin | The other person in either direction | Messages or the job Messages tab, unread dot, bell, Agent list_messages and attention | Service company support; reply in the same private thread | fixed now |

## Messages: Client and supervisor

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Client or supervisor | The other person in either direction | Messages or the job Messages tab, unread dot, bell, Agent list_messages and attention | Visit and job questions; reply in the same private thread | fixed now |

## Messages: Admin and supervisor

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Admin or supervisor | The other person in either direction | Messages or the job Messages tab, unread dot, bell, Agent list_messages and attention | Company work; reply in the same private thread | fixed now |

## Messages: Client manager and client office staff

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Client manager or client office staff | The other person in either direction | Messages or the job Messages tab, unread dot, bell, Agent list_messages and attention | Same client company only; reply in the same private thread | fixed now |

## Messages: Office staff and technician

| Who does it | Who it reaches | Where it shows | What happens next | Status |
| --- | --- | --- | --- | --- |
| Office staff or technician | The other person in either direction | Messages or the job Messages tab, unread dot, bell, Agent list_messages and attention | Company work; reply in the same private thread | fixed now |
