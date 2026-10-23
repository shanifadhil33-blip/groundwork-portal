# LANG12 local sweep

**Status: incomplete. The final sweep is NOT clean; LANG12 must remain open.**

Only http://127.0.0.1:3000 and local Postgres were used. No deployment, push, or live verification. Static language files were tested with fresh mobile browser contexts at 360×844; the translation API returned an empty dictionary so cache or AI translations could not hide missing file entries. No new migration was added.

The scanner discovers static app routes from app/(app), follows navigation, visits one accessible job and its edit route, one client detail, settings tabs and subpages, opens the bell and navigation drawer, and visits a missing job. Role-denied routes are recorded separately. Visible text fragments and accessibility attributes are checked. Exact names, addresses, email addresses, job identifiers, Groundwork, currency/timezone codes, language names, sample filenames and executable code are data exemptions. Editable values stay as typed.

The baseline navigation drawer interaction was blocked by the development indicator; each baseline role has one recorded interaction error. The final sweep hides that development-only overlay. The owner supplier navigation timed out once and was retried successfully. A persona switch revokes all sessions in that demo: the script now uses the existing sandbox start endpoint to create concurrent sessions, without resetting sample data.

## Before and after

Counts are visible Latin text fragments / accessibility attributes, with repeated fragments across screens counted separately. Extra final screens include the drawer that the baseline could not open.

| Persona | Before screens | Before Latin | Before attributes | After screens | After Latin | After attributes | RTL failures | Overflow failures | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| imran | 38 | 152 | 217 | 39 | 57 | 30 | 0 | 0 | 0 |
| hassan | 38 | 177 | 228 | 39 | 76 | 32 | 0 | 0 | 0 |
| sam | 36 | 163 | 189 | 37 | 118 | 34 | 0 | 0 | 0 |
| ravi | 24 | 72 | 38 | 24 | 10 | 2 | 0 | 0 | 1 |
| pranav | 22 | 84 | 38 | 23 | 45 | 2 | 0 | 0 | 0 |
| faisal | 22 | 64 | 33 | 23 | 14 | 2 | 0 | 0 | 0 |
| omar | 22 | 72 | 38 | 23 | 28 | 2 | 0 | 0 | 0 |
| nabil | 35 | 137 | 190 | 36 | 49 | 28 | 0 | 0 | 0 |
| kevin | 22 | 66 | 39 | 23 | 26 | 2 | 0 | 0 | 0 |

## Changes completed

Added 42 static language keys per non-English language (41 for Chinese, where one already existed), preserving the file layout and appending keys as text. Added dynamic count, expiry, demo banner and accessibility templates; translated contact titles without changing names; used per-user Intl relative times with calendar fallbacks; separated record identifiers from seeded job titles; replaced English Agent occurrences in Arabic values with الوكيل. Real authored text remains protected.

## Local validation

- Typecheck: passed.
- Focused localization suite: 81 tests passed.
- Final focused template and copy checks: 27 tests passed.
- Full npm test: 4318 passed, 7 failed across 237 files. Four are the known D1 report/rating failures. Two timed out (demo isolation and one Hindi screen). The additional copy-dash failure was the newly introduced technical attribute literal; it was fixed, then its focused suite passed. The full suite was not rerun after that correction.

## Same-job language isolation

```json
{
  "sameJob": true,
  "differentUsers": true,
  "arabic": {
    "lang": "ar-AE",
    "dir": "rtl",
    "heading": "اضبط تبريد غرفة الاجتماعات"
  },
  "english": {
    "lang": "en-IN",
    "dir": "ltr",
    "heading": "Adjust meeting room cooling"
  },
  "preferences": [
    "ar-AE",
    "en-IN"
  ]
}
```

## Final output: remaining visible lines

These are unresolved findings, not a clean certificate. Most remaining work is seeded suggestions/messages/site notes, audit and Agent summaries, diagnostic interface text, scheduling hints, and dynamic labels. New static keys are covered in every app language, but these remaining phrases still require translations in all languages.

### imran

- /dashboard
  - Attribute: "Needs you"
- /documents
  - Text: "SAMPLE Hot work permit, Marina Exchange"
- /how-agent-works
  - Text: "Reads the message, photo or voice note from the app and writes it up as a suggested job."
- /import
  - Text: "Excel or CSV file, up to 500 lines"
  - Text: "Up to 2 MB · 500 data rows · unique column headings"
  - Text: "Try the flow with a sample file of 40 jobs."
  - Text: "sample.csv"
- /overview
  - Attribute: "Needs you"
- /queue
  - Text: "sample.csv"
  - Attribute: "Select row 1: Inspect reception lighting"
- /schedule
  - Text: "Anil (On leave)"
  - Text: "9 AM"
  - Text: "2 PM"
  - Text: "11 AM"
  - Text: "4 PM"
  - Attribute: "Move Service rooftop ventilation"
  - Attribute: "Move Follow up: Sample tap repair"
- /settings (tab:company)
  - Text: "Asia/Dubai"
- /suggestions
  - Text: "Lobby lights flickering"
  - Text: "Tomorrow morning"
  - Text: "Two lights in the lobby keep flickering since this morning."
  - Text: "Replace the second pump seal"
  - Text: "The pump next to this one is also leaking a little. Better to change the seal before it gets worse."
  - Text: "Open job"
- /team
  - Text: "Nobody is away. Add leave here, and jobs are not given to that person on those days."
  - Attribute: "0 Today for Anil"
  - Attribute: "0 Late for Anil"
  - Attribute: "0 Open for Anil"
  - Attribute: "0 Today for Bilal"
  - Attribute: "0 Late for Bilal"
  - Attribute: "0 Open for Bilal"
  - Attribute: "1 Today for Ravi"
  - Attribute: "8 Late for Ravi"
  - Attribute: "16 Open for Ravi"
  - Attribute: "0 Today for Nabil"
  - Attribute: "0 Late for Nabil"
  - Attribute: "0 Open for Nabil"
  - Attribute: "2 Today for Sam"
  - Attribute: "3 Late for Sam"
  - Attribute: "7 Open for Sam"
  - Attribute: "0 Today for Hassan"
  - Attribute: "0 Late for Hassan"
  - Attribute: "0 Open for Hassan"
  - Attribute: "0 Today for Imran"
  - Attribute: "3 Late for Imran"
  - Attribute: "4 Open for Imran"
- /team-space
  - Text: "You"
  - Text: "Good morning team. Northgate asked for an early visit today, please check your jobs."
  - Text: "On my way. I have the spare filters in the van."
- /work-orders (bell open)
  - Text: "SAMPLE Civil Defence certificate"
- /work-orders (navigation open)
  - Text: "Your workspace"
  - Text: "Sign out"
  - Attribute: "Drawer navigation"
  - Attribute: "New requests, 1 waiting"
- /work-orders/new
  - Text: "Visits are scheduled for 9:00 AM in the workspace timezone. Scheduling an Open job moves it to Scheduled."
  - Attribute: "For example, weekday mornings 9 to 12"
- /settings/agent/log
  - Text: "big chiller"
  - Text: "Roof AC 1"
  - Text: "the tower"
  - Text: "Change priority for WO 1 Replace lobby light fixture: low to high"
  - Text: "Change priority for WO 2 Service rooftop ventilation: high to low"
  - Text: "· Undone by Imran"
- /clients/:id
  - Text: "Edit client"
  - Text: "Main contact"
  - Text: "Billing address"
  - Text: "Pine House, Office 1204, Al Marsa Street, Dubai Marina, Dubai"
  - Text: "· ends"
  - Text: "Monthly maintenance retainer. Put the PO number on every invoice."
  - Text: "Add site"
  - Text: "Site contact:"
  - Text: "Access:"
  - Text: "Visitor parking at P2. Sign in at the ground floor security desk with your Emirates ID."
  - Text: "Main panel"
  - Text: "Ground floor"
  - Text: "Roof AC 1"
  - Text: "Roof"
  - Text: "Roof AC 2"
  - Text: "Use the loading bay on the lake side. Keys are at reception until 6 pm."
  - Text: "Sends requests and sees their own jobs."
- /work-orders/:id
  - Text: "AC · Dubai Marina · 0 today"
  - Text: "Changing the date sets the visit to 9:00 AM in the workspace timezone. Scheduling Open work moves it to Scheduled."
- /work-orders/:id/edit
  - Text: "Client and site are fixed for an existing job."
  - Text: "Routine facilities request 1; coordinate access with the site manager."
  - Text: "None"
  - Text: "Oct 15, 2026"
  - Text: "Visits are scheduled for 9:00 AM in the workspace timezone. Scheduling an Open job moves it to Scheduled."
  - Attribute: "For example, weekday mornings 9 to 12"

Denied routes: /isolation, /my-record, /suggestions/new

### hassan

- /audit
  - Text: "Imran assigned Anil on Seal loading bay threshold"
  - Text: "Sam updated Seal loading bay threshold"
  - Text: "Imran updated Repair stairwell handrail"
  - Text: "Sam updated Service water pump"
  - Text: "Imran updated Replace washroom tap"
  - Text: "Sam updated Clear courtyard drainage"
  - Text: "Imran changed Pranav’s role to Client"
  - Text: "Sam updated Repair entry door closer"
  - Text: "Imran created site 'Harbor Annex'"
  - Text: "Sam updated Repair stairwell handrail"
  - Text: "Imran created site 'Northgate East'"
  - Text: "Imran updated Test access control reader"
  - Text: "Imran updated supplier order COBALT-DEMO-2 for Service rooftop ventilation · Ordered"
  - Text: "Imran changed Ravi’s role to Technician"
  - Text: "Imran added Faisal as Client"
  - Text: "Imran updated Inspect emergency lighting"
  - Text: "Sam updated Replace washroom tap"
  - Text: "Imran created site 'Northgate West'"
  - Text: "Sam updated Inspect emergency lighting"
  - Text: "Sam updated Service rooftop ventilation"
  - Text: "Sam updated Replace lobby light fixture"
  - Text: "Imran assigned Ravi and scheduled for Oct 20, 2026 and set the due date to Oct 20, 2026 on Service water pump"
- /dashboard
  - Text: "United Arab Emirates, Dubai. Sets address fields, phone format and currency."
- /documents
  - Text: "SAMPLE Hot work permit, Marina Exchange"
- /home
  - Text: "United Arab Emirates, Dubai. Sets address fields, phone format and currency."
- /how-agent-works
  - Text: "Reads the message, photo or voice note from the app and writes it up as a suggested job."
- /import
  - Text: "Excel or CSV file, up to 500 lines"
  - Text: "Up to 2 MB · 500 data rows · unique column headings"
  - Text: "Try the flow with a sample file of 40 jobs."
  - Text: "sample.csv"
- /overview
  - Attribute: "Needs you"
- /queue
  - Text: "sample.csv"
  - Attribute: "Select row 1: Inspect reception lighting"
- /schedule
  - Text: "Anil (On leave)"
  - Text: "9 AM"
  - Text: "2 PM"
  - Text: "11 AM"
  - Text: "4 PM"
  - Attribute: "Move Service rooftop ventilation"
  - Attribute: "Move Follow up: Sample tap repair"
- /settings (tab:company)
  - Text: "Asia/Dubai"
- /suggestions
  - Text: "Lobby lights flickering"
  - Text: "Tomorrow morning"
  - Text: "Two lights in the lobby keep flickering since this morning."
  - Text: "Replace the second pump seal"
  - Text: "The pump next to this one is also leaking a little. Better to change the seal before it gets worse."
  - Text: "Open job"
- /team
  - Attribute: "0 Today for Anil"
  - Attribute: "0 Late for Anil"
  - Attribute: "0 Open for Anil"
  - Attribute: "0 Today for Bilal"
  - Attribute: "0 Late for Bilal"
  - Attribute: "0 Open for Bilal"
  - Attribute: "1 Today for Ravi"
  - Attribute: "8 Late for Ravi"
  - Attribute: "16 Open for Ravi"
  - Attribute: "0 Today for Nabil"
  - Attribute: "0 Late for Nabil"
  - Attribute: "0 Open for Nabil"
  - Attribute: "2 Today for Sam"
  - Attribute: "3 Late for Sam"
  - Attribute: "7 Open for Sam"
  - Attribute: "0 Today for Hassan"
  - Attribute: "0 Late for Hassan"
  - Attribute: "0 Open for Hassan"
  - Attribute: "0 Today for Imran"
  - Attribute: "3 Late for Imran"
  - Attribute: "4 Open for Imran"
  - Attribute: "Remove leave for Anil"
  - Attribute: "Remove leave for Ravi"
  - Attribute: "Remove leave for Bilal"
- /team-space
  - Text: "Good morning team. Northgate asked for an early visit today, please check your jobs."
  - Text: "On my way. I have the spare filters in the van."
- /today
  - Text: "When the office gives you a job, it shows here."
- /work-orders (navigation open)
  - Text: "Your workspace"
  - Text: "Sign out"
  - Attribute: "Drawer navigation"
  - Attribute: "New requests, 1 waiting"
- /work-orders/new
  - Text: "Visits are scheduled for 9:00 AM in the workspace timezone. Scheduling an Open job moves it to Scheduled."
  - Attribute: "For example, weekday mornings 9 to 12"
- /settings/agent/log
  - Text: "big chiller"
  - Text: "Roof AC 1"
  - Text: "the tower"
- /clients/:id
  - Text: "Edit client"
  - Text: "Main contact"
  - Text: "Billing address"
  - Text: "Pine House, Office 1204, Al Marsa Street, Dubai Marina, Dubai"
  - Text: "· ends"
  - Text: "Monthly maintenance retainer. Put the PO number on every invoice."
  - Text: "Add site"
  - Text: "Site contact:"
  - Text: "Access:"
  - Text: "Visitor parking at P2. Sign in at the ground floor security desk with your Emirates ID."
  - Text: "Main panel"
  - Text: "Ground floor"
  - Text: "Roof AC 1"
  - Text: "Roof"
  - Text: "Roof AC 2"
  - Text: "Use the loading bay on the lake side. Keys are at reception until 6 pm."
  - Text: "Sends requests and sees their own jobs."
- /work-orders/:id
  - Text: "AC · Dubai Marina · 0 today"
  - Text: "Changing the date sets the visit to 9:00 AM in the workspace timezone. Scheduling Open work moves it to Scheduled."
- /work-orders/:id/edit
  - Text: "Client and site are fixed for an existing job."
  - Text: "Routine facilities request 1; coordinate access with the site manager."
  - Text: "None"
  - Text: "Oct 15, 2026"
  - Text: "Visits are scheduled for 9:00 AM in the workspace timezone. Scheduling an Open job moves it to Scheduled."
  - Attribute: "For example, weekday mornings 9 to 12"

Denied routes: /isolation, /my-record, /suggestions/new

### sam

- /audit
  - Text: "Sam updated Seal loading bay threshold"
  - Text: "Sam updated Service water pump"
  - Text: "Sam updated Clear courtyard drainage"
  - Text: "Sam updated Repair entry door closer"
  - Text: "Sam updated Repair stairwell handrail"
  - Text: "Sam updated Replace washroom tap"
  - Text: "Sam updated Inspect emergency lighting"
  - Text: "Sam updated Service rooftop ventilation"
  - Text: "Sam updated Replace lobby light fixture"
  - Text: "Sam changed Sam’s role to Staff"
  - Text: "Sam updated Adjust meeting room cooling"
  - Text: "Sam updated Test access control reader"
- /dashboard
  - Text: "Agent needs your call"
  - Text: "asked"
  - Text: "Agent suggests:"
  - Text: "Yes, approve"
  - Text: "Fix it"
  - Text: "Lobby lights flickering"
  - Text: "Tomorrow morning"
  - Text: "Two lights in the lobby keep flickering since this morning."
  - Text: "Replace the second pump seal"
  - Text: "The pump next to this one is also leaking a little. Better to change the seal before it gets worse."
  - Text: "SAMPLE Hot work permit, Marina Exchange"
- /documents
  - Text: "SAMPLE Hot work permit, Marina Exchange"
- /home
  - Text: "Today's plan"
  - Text: "open jobs can be placed."
  - Text: "Nothing is saved until you say yes."
  - Text: "Adjust meeting room cooling"
  - Text: "covers this trade."
  - Text: "Replace lobby light fixture"
  - Text: "Approve the plan"
  - Text: "Mark this job late"
  - Text: "This practice control marks the job late. No message is sent."
  - Text: "Agent needs your call"
  - Text: "asked"
  - Text: "Sample question: Record the filter size?"
  - Text: "Agent suggests:"
  - Text: "Record the filter size."
  - Text: "Yes, approve"
  - Text: "Fix it"
  - Text: "scheduled today"
  - Text: "Late"
  - Text: "Lobby lights flickering"
  - Text: "WhatsApp"
  - Text: "Best time for the visit:"
  - Text: "Tomorrow morning"
  - Text: "Two lights in the lobby keep flickering since this morning."
  - Text: "Approve"
  - Text: "Edit then approve"
  - Text: "Decline"
  - Text: "Replace the second pump seal"
  - Text: "Technician"
  - Text: "The pump next to this one is also leaking a little. Better to change the seal before it gets worse."
  - Text: "Quote visit"
  - Text: "Client"
  - Text: "How much will it cost to fix my water heater?"
  - Text: "Follow up: Sample tap repair"
  - Text: "Agent"
  - Text: "Seal"
  - Text: "Time off requests"
  - Text: "On leave"
  - Text: "Documents expiring soon"
  - Text: "See all"
  - Text: "SAMPLE Hot work permit, Marina Exchange"
  - Text: "Expired"
  - Text: "SAMPLE Civil Defence certificate"
  - Text: "Expires in 7 days"
  - Text: "SAMPLE Trade licence"
  - Text: "Expires in 20 days"
  - Text: "No changes saved yet."
  - Attribute: "Real name: Kevin"
  - Attribute: "Real name: Ravi"
  - Attribute: "Real name: Pranav"
- /how-agent-works
  - Text: "Reads the message, photo or voice note from the app and writes it up as a suggested job."
- /import
  - Text: "Excel or CSV file, up to 500 lines"
  - Text: "Up to 2 MB · 500 data rows · unique column headings"
  - Text: "Try the flow with a sample file of 40 jobs."
  - Text: "sample.csv"
- /queue
  - Text: "sample.csv"
  - Attribute: "Select row 1: Inspect reception lighting"
- /schedule
  - Text: "Anil (On leave)"
  - Text: "9 AM"
  - Text: "2 PM"
  - Text: "11 AM"
  - Text: "4 PM"
  - Attribute: "Move Service rooftop ventilation"
  - Attribute: "Move Follow up: Sample tap repair"
- /settings (tab:company)
  - Text: "Asia/Dubai"
- /suggestions
  - Text: "Lobby lights flickering"
  - Text: "Tomorrow morning"
  - Text: "Two lights in the lobby keep flickering since this morning."
  - Text: "Replace the second pump seal"
  - Text: "The pump next to this one is also leaking a little. Better to change the seal before it gets worse."
  - Text: "Open job"
- /team
  - Attribute: "0 Today for Anil"
  - Attribute: "0 Late for Anil"
  - Attribute: "0 Open for Anil"
  - Attribute: "0 Today for Bilal"
  - Attribute: "0 Late for Bilal"
  - Attribute: "0 Open for Bilal"
  - Attribute: "1 Today for Ravi"
  - Attribute: "8 Late for Ravi"
  - Attribute: "16 Open for Ravi"
  - Attribute: "0 Today for Nabil"
  - Attribute: "0 Late for Nabil"
  - Attribute: "0 Open for Nabil"
  - Attribute: "2 Today for Sam"
  - Attribute: "3 Late for Sam"
  - Attribute: "7 Open for Sam"
  - Attribute: "0 Today for Hassan"
  - Attribute: "0 Late for Hassan"
  - Attribute: "0 Open for Hassan"
  - Attribute: "0 Today for Imran"
  - Attribute: "3 Late for Imran"
  - Attribute: "4 Open for Imran"
  - Attribute: "Remove leave for Anil"
  - Attribute: "Remove leave for Ravi"
  - Attribute: "Remove leave for Bilal"
- /team-space
  - Text: "Good morning team. Northgate asked for an early visit today, please check your jobs."
  - Text: "You"
  - Text: "On my way. I have the spare filters in the van."
- /work-orders (navigation open)
  - Text: "Your workspace"
  - Text: "Sign out"
  - Attribute: "Drawer navigation"
  - Attribute: "New requests, 1 waiting"
- /work-orders/new
  - Text: "Visits are scheduled for 9:00 AM in the workspace timezone. Scheduling an Open job moves it to Scheduled."
  - Attribute: "For example, weekday mornings 9 to 12"
- /settings/agent/log
  - Text: "big chiller"
  - Text: "Roof AC 1"
  - Text: "the tower"
- /clients/:id
  - Text: "Main contact"
  - Text: "Billing address"
  - Text: "Pine House, Office 1204, Al Marsa Street, Dubai Marina, Dubai"
  - Text: "· ends"
  - Text: "Monthly maintenance retainer. Put the PO number on every invoice."
  - Text: "Site contact:"
  - Text: "Access:"
  - Text: "Visitor parking at P2. Sign in at the ground floor security desk with your Emirates ID."
  - Text: "Main panel"
  - Text: "Ground floor"
  - Text: "Roof AC 1"
  - Text: "Roof"
  - Text: "Roof AC 2"
  - Text: "Use the loading bay on the lake side. Keys are at reception until 6 pm."
- /work-orders/:id
  - Text: "AC · Dubai Marina · 0 today"
  - Text: "Changing the date sets the visit to 9:00 AM in the workspace timezone. Scheduling Open work moves it to Scheduled."
- /work-orders/:id/edit
  - Text: "Client and site are fixed for an existing job."
  - Text: "Routine facilities request 1; coordinate access with the site manager."
  - Text: "None"
  - Text: "Oct 15, 2026"
  - Text: "Visits are scheduled for 9:00 AM in the workspace timezone. Scheduling an Open job moves it to Scheduled."
  - Attribute: "For example, weekday mornings 9 to 12"

Denied routes: /isolation, /my-record, /suggestions/new

### ravi

- /how-agent-works
  - Text: "Reads the message, photo or voice note from the app and writes it up as a suggested job."
- /my-record
  - Attribute: "Loading"
- /settings (tab:company)
  - Text: "Asia/Dubai"
- /team-space
  - Text: "Good morning team. Northgate asked for an early visit today, please check your jobs."
  - Text: "On my way. I have the spare filters in the van."
- /work-orders (navigation open)
  - Text: "Your workspace"
  - Text: "Sign out"
  - Attribute: "Drawer navigation"
- /settings/agent/log
  - Text: "the annex"
  - Text: "big chiller"
  - Text: "Roof AC 1"
  - Text: "the tower"

Errors: [{"path":"/dashboard","message":"page.goto: Timeout 60000ms exceeded."}]

Denied routes: /audit, /clients, /documents, /import, /isolation, /overview, /queue, /schedule, /suggestions, /supplier, /team, /work-orders/new, /work-orders/16fcd613-53be-48b6-9769-482a06ef8c25/edit

### pranav

- /dashboard
  - Text: "Your requests"
  - Text: "Withdraw request"
  - Text: "23 open requests"
  - Text: "Main panel"
  - Text: "Ground floor"
  - Text: "Roof AC 1"
  - Text: "Roof"
  - Text: "Roof AC 2"
- /home
  - Text: "Your requests"
  - Text: "Withdraw request"
  - Text: "23 open requests"
  - Text: "Main panel"
  - Text: "Ground floor"
  - Text: "Roof AC 1"
  - Text: "Roof"
  - Text: "Roof AC 2"
- /how-agent-works
  - Text: "Reads the message, photo or voice note from the app and writes it up as a suggested job."
- /isolation
  - Text: "Demo ·"
  - Text: "Your session belongs to Harbor & Pine Coworking."
  - Text: "Northgate query"
  - Text: "Database role"
  - Text: "· application connection"
  - Text: "Portal role"
  - Text: "client"
  - Text: "returned"
  - Text: "Postgres row level security returned nothing because this session belongs to another client."
  - Text: "Run isolation check again"
- /settings (tab:company)
  - Text: "Asia/Dubai"
- /work-orders
  - Text: "42 requests"
  - Text: "Your requests"
  - Text: "Withdraw request"
  - Text: "Unassigned"
- /work-orders (bell open)
  - Text: "42 requests"
  - Text: "Your requests"
  - Text: "Withdraw request"
  - Text: "Unassigned"
- /work-orders (navigation open)
  - Text: "42 requests"
  - Text: "Your requests"
  - Text: "Withdraw request"
  - Text: "Unassigned"
  - Text: "Your workspace"
  - Text: "Sign out"
  - Attribute: "Drawer navigation"
- /work-orders/new
  - Text: "Ask for"
  - Text: "again"
  - Attribute: "For example, weekday mornings 9 to 12"
- /work-orders/:id
  - Text: "No description provided."

Denied routes: /audit, /clients, /documents, /import, /my-record, /overview, /queue, /schedule, /suggestions, /supplier, /team, /team-space, /today, /suggestions/new, /work-orders/b5427456-5e15-4942-b943-c54d54390336/edit

### faisal

- /dashboard
  - Text: "4 open requests"
- /home
  - Text: "4 open requests"
- /how-agent-works
  - Text: "Reads the message, photo or voice note from the app and writes it up as a suggested job."
- /isolation
  - Text: "Demo ·"
  - Text: "Your session belongs to Northgate Self Storage."
- /settings (tab:company)
  - Text: "Asia/Dubai"
- /work-orders
  - Text: "5 requests"
- /work-orders (bell open)
  - Text: "5 requests"
- /work-orders (navigation open)
  - Text: "5 requests"
  - Text: "Your workspace"
  - Text: "Sign out"
  - Attribute: "Drawer navigation"
- /work-orders/new
  - Text: "Ask for"
  - Text: "again"
  - Attribute: "For example, weekday mornings 9 to 12"
- /work-orders/:id
  - Text: "Reschedule"

Denied routes: /audit, /clients, /documents, /import, /my-record, /overview, /queue, /schedule, /suggestions, /supplier, /team, /team-space, /today, /suggestions/new, /work-orders/3bb9e30b-ddd2-416c-8bc0-f3481dfe7b4a/edit

### omar

- /dashboard
  - Text: "12 open requests"
- /home
  - Text: "12 open requests"
  - Text: "Office water heater"
  - Text: "Office kitchen"
  - Text: "Water pump"
  - Text: "Plant room"
- /how-agent-works
  - Text: "Reads the message, photo or voice note from the app and writes it up as a suggested job."
- /isolation
  - Text: "Demo ·"
  - Text: "Your session belongs to Northgate Self Storage."
  - Text: "Northgate query · your company"
  - Text: "Database role"
  - Text: "· application connection"
  - Text: "Portal role"
  - Text: "client"
  - Text: "returned"
  - Text: "Northgate is your company, so Postgres row level security allows these rows."
  - Text: "Another workspace"
  - Text: "Postgres row level security returned nothing because this session belongs to another workspace."
  - Text: "Run isolation check again"
- /settings (tab:company)
  - Text: "Asia/Dubai"
- /work-orders
  - Text: "26 requests"
  - Text: "Unassigned"
- /work-orders (bell open)
  - Text: "26 requests"
  - Text: "Unassigned"
- /work-orders (navigation open)
  - Text: "26 requests"
  - Text: "Unassigned"
  - Text: "Your workspace"
  - Text: "Sign out"
  - Attribute: "Drawer navigation"
- /work-orders/new
  - Attribute: "For example, weekday mornings 9 to 12"

Denied routes: /audit, /clients, /documents, /import, /my-record, /overview, /queue, /schedule, /suggestions, /supplier, /team, /team-space, /today, /suggestions/new, /work-orders/3bb9e30b-ddd2-416c-8bc0-f3481dfe7b4a/edit

### nabil

- /dashboard
  - Text: "United Arab Emirates, Dubai. Sets address fields, phone format and currency."
- /documents
  - Text: "SAMPLE Hot work permit, Marina Exchange"
- /home
  - Text: "Replace the second pump seal"
  - Text: "The pump next to this one is also leaking a little. Better to change the seal before it gets worse."
  - Text: "Lobby lights flickering"
  - Text: "Tomorrow morning"
  - Text: "Two lights in the lobby keep flickering since this morning."
  - Text: "SAMPLE Hot work permit, Marina Exchange"
- /how-agent-works
  - Text: "Reads the message, photo or voice note from the app and writes it up as a suggested job."
- /import
  - Text: "Excel or CSV file, up to 500 lines"
  - Text: "Up to 2 MB · 500 data rows · unique column headings"
  - Text: "Try the flow with a sample file of 40 jobs."
  - Text: "sample.csv"
- /queue
  - Text: "sample.csv"
  - Attribute: "Select row 1: Inspect reception lighting"
- /schedule
  - Text: "Anil (On leave)"
  - Text: "9 AM"
  - Text: "2 PM"
  - Text: "11 AM"
  - Text: "4 PM"
  - Attribute: "Move Service rooftop ventilation"
  - Attribute: "Move Follow up: Sample tap repair"
- /settings (tab:company)
  - Text: "Asia/Dubai"
- /team
  - Attribute: "0 Today for Anil"
  - Attribute: "0 Late for Anil"
  - Attribute: "0 Open for Anil"
  - Attribute: "0 Today for Bilal"
  - Attribute: "0 Late for Bilal"
  - Attribute: "0 Open for Bilal"
  - Attribute: "1 Today for Ravi"
  - Attribute: "8 Late for Ravi"
  - Attribute: "16 Open for Ravi"
  - Attribute: "0 Today for Nabil"
  - Attribute: "0 Late for Nabil"
  - Attribute: "0 Open for Nabil"
  - Attribute: "2 Today for Sam"
  - Attribute: "3 Late for Sam"
  - Attribute: "7 Open for Sam"
  - Attribute: "0 Today for Hassan"
  - Attribute: "0 Late for Hassan"
  - Attribute: "0 Open for Hassan"
  - Attribute: "0 Today for Imran"
  - Attribute: "3 Late for Imran"
  - Attribute: "4 Open for Imran"
- /team-space
  - Text: "Good morning team. Northgate asked for an early visit today, please check your jobs."
  - Text: "On my way. I have the spare filters in the van."
- /today
  - Text: "When the office gives you a job, it shows here."
- /work-orders (navigation open)
  - Text: "Your workspace"
  - Text: "Sign out"
  - Attribute: "Drawer navigation"
  - Attribute: "New requests, 1 waiting"
- /work-orders/new
  - Text: "Visits are scheduled for 9:00 AM in the workspace timezone. Scheduling an Open job moves it to Scheduled."
  - Attribute: "For example, weekday mornings 9 to 12"
- /settings/agent/log
  - Text: "big chiller"
  - Text: "Roof AC 1"
  - Text: "the tower"
- /clients/:id
  - Text: "Main contact"
  - Text: "Billing address"
  - Text: "Pine House, Office 1204, Al Marsa Street, Dubai Marina, Dubai"
  - Text: "· ends"
  - Text: "Monthly maintenance retainer. Put the PO number on every invoice."
  - Text: "Site contact:"
  - Text: "Access:"
  - Text: "Visitor parking at P2. Sign in at the ground floor security desk with your Emirates ID."
  - Text: "Main panel"
  - Text: "Ground floor"
  - Text: "Roof AC 1"
  - Text: "Roof"
  - Text: "Roof AC 2"
  - Text: "Use the loading bay on the lake side. Keys are at reception until 6 pm."
- /work-orders/:id
  - Text: "Changing the date sets the visit to 9:00 AM in the workspace timezone. Scheduling Open work moves it to Scheduled."
- /work-orders/:id/edit
  - Text: "Client and site are fixed for an existing job."
  - Text: "Routine facilities request 1; coordinate access with the site manager."
  - Text: "None"
  - Text: "Oct 15, 2026"
  - Text: "Visits are scheduled for 9:00 AM in the workspace timezone. Scheduling an Open job moves it to Scheduled."
  - Attribute: "For example, weekday mornings 9 to 12"

Denied routes: /isolation, /my-record, /suggestions/new

### kevin

- /dashboard
  - Text: "23 open requests"
- /home
  - Text: "23 open requests"
- /how-agent-works
  - Text: "Reads the message, photo or voice note from the app and writes it up as a suggested job."
- /isolation
  - Text: "Demo ·"
  - Text: "Your session belongs to Northgate Self Storage."
  - Text: "Northgate query · your company"
  - Text: "Database role"
  - Text: "· application connection"
  - Text: "Portal role"
  - Text: "client"
  - Text: "returned"
  - Text: "Postgres row level security returned nothing because this session belongs to another client."
  - Text: "Another workspace"
  - Text: "Postgres row level security returned nothing because this session belongs to another workspace."
  - Text: "Run isolation check again"
- /settings (tab:company)
  - Text: "Asia/Dubai"
- /work-orders
  - Text: "42 requests"
  - Text: "Unassigned"
- /work-orders (bell open)
  - Text: "42 requests"
  - Text: "Unassigned"
- /work-orders (navigation open)
  - Text: "42 requests"
  - Text: "Unassigned"
  - Text: "Your workspace"
  - Text: "Sign out"
  - Attribute: "Drawer navigation"
- /work-orders/new
  - Text: "Ask for"
  - Text: "again"
  - Attribute: "For example, weekday mornings 9 to 12"

Denied routes: /audit, /clients, /documents, /import, /my-record, /overview, /queue, /schedule, /suggestions, /supplier, /team, /team-space, /today, /suggestions/new, /work-orders/459f7aca-4984-40c6-a5ff-116a8f582acc/edit

## Reproduce locally

Start the app with `npm run dev -- --hostname 127.0.0.1`, then run:

```sh
node e2e/lang12-sweep.mjs --out=/tmp/lang12-sweep.json
npm run typecheck
npm test
```

The sweep rejects non-local hosts and exits nonzero for remaining Latin text, accessibility leaks, RTL/overflow failures, or navigation errors. Tokens are stored only in a mode-0600 temporary file and never printed or committed.
