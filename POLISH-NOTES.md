# Polish notes for frontend batch 6 (from live review, Oct 10 5:10 PM)
- Demo data: dashboard status counts are all exactly 10; vary the seed so counts look realistic.
- Recent activity reads like raw labels ("work order events created", "work orders created →"); write human sentences ("Sam moved WO-1042 to Scheduled"), with realistic spread times and even indentation.
- The "Awaiting approval" card link should say "Review approval queue" and go to the queue.
- The content column is too narrow on desktop (tables wrap); widen the max width for list/table pages.
- Make the primary button hover more visible (clear darken/lift).

# Live QA tap-through findings (Oct 10, 9:57 PM), screenshots in /workspace/portal-shots/qa/
1. The assistant never answers live: always "The assistant is resting right now". Debug with `vercel logs` (tool calling with gemini-3.5-flash-lite? timeout? request format?) and fix so it works live. Reword the unavailable message seriously: "The assistant is unavailable right now. Everything else works as normal." Keep the chat on sheet reopen within a session.
2. No raw DB names/IDs in the UI: activity/audit entries become human sentences ("Dana changed WO-1042 status to In progress"); the audit drawer shows a readable field diff (field label: old → new), not JSON or UUIDs; supplier order names without UUID prefixes (COBALT-DEMO-1); demo emails shown as e.g. dana@ridgeline.demo (display-level mask, or seed shorter emails).
3. Import/Queue: format dates in local time, title-case priorities and status badges.
4. Pluralization everywhere ("1 row", "1 mismatch", "0 warnings"); hide or relabel "Approve 0 rows" when nothing is selected.
5. Supplier mismatch message must match the actual states; replace "part of this repo" with "part of this portfolio demo".
6. Notifications name the work order and link to it.
7. Layout: the queue stray "·" when client/site are missing; the selected-row highlight covers the checkbox; audit filters (entity type as a custom dropdown with labels, the date picker not clipped, Clear filters inline); the work orders sort dropdown doesn't wrap; consistent page widths (import matches others, wider for tables); client request detail uses full width; the Save button isn't full width on desktop.
8. Mobile 390: work-order filters collapse behind a "Filters" button opening a sheet; settings tabs scroll horizontally on one row; the demo bar is compact (~40px); the assistant sheet has messages above and the input pinned at the bottom.
9. Wording: "Client-visible comment" only once; clients see the staff name or company, not "Workspace member"; agent key expiry defaults correctly for demos (24h max shown); no validation error before submit (only after a submit attempt or blur with a change); hide "Isolation check" from the client demo bar (keep it in the landing tech section/admin); vary seed status counts (not all 10); consistent card link styles.

# Final re-check leftovers (Oct 10, 10:57 PM)
- Assistant: the first write request sometimes hits "I reached the tool limit" (raise the round limit sensibly / make the model look up by number directly, e.g. a get_work_order_by_number tool or search by number); render the assistant reply markdown (bold, lists) safely instead of showing asterisks.
- Audit wording: "Dana created team member" / "Sam updated notification" become natural sentences (e.g. "Dana added Sam as staff", hide or rephrase notification-read events).
- Role badge title case ("Admin", "Staff", "Client").
- Work order scheduled time vs the "new dates set for 9:00 AM local" note: make the seed and the note consistent.
- Mobile: hide the visible horizontal scrollbar on the settings tab row; the "Open assistant" tooltip must not stick after the sheet closes (no tooltips on touch).
- Supplier order link shows the work order title, not just "→ Work order".
- /approval-queue redirects to /queue.
- Check that a client-visible comment by staff creates a notification for the client requester (add a test if missing).
- Add the missing "Frontend batch 6 — polish" section to PROGRESS.md.
