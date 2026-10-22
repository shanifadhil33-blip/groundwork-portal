# JOB25 Quotes and price changes

Core loop: request, visit and report. Show the company visit charge before a quote visit; stop work when a new finding needs a price and wait for the client to approve.

## Gate, October 22 2026

Read the project start gate, known issues, JOB24 style reference, exact real world entries 8, 9 and 18, universal roles, edge cases and connection map, phone and desktop notes, existing Groundwork competitor study and installed Next route guidance. Reuse current job, dialog, confirmation and translation patterns. No new migration, push, deployment or live verification in this run. Local typecheck and full tests are required. Reviewer owns the live role and responsive sweep.

## Initial audit and gaps

Existing: company visit_charge and visit_charge_regions settings, owner settings permissions, region aware visitChargeFor, visit_charge agent read, household confirmation card with visit charge snapshot, job suggestions, quote columns and statuses, send_quote and answer_quote agent tools, client approval screen, waiting_prices read and notifications. Reuse these.

Missing or unsafe:

* No technician price change report or durable hold. Only a technician start after a declined quote is blocked; pending prices and report completion can bypass it.
* sendQuote currently allows supervisors and office staff to price. Reuse owner payments handover for owner authorized admins, with current membership checks inside the locked transaction.
* No waiting for office price state/list or exact technician finding snapshot. Store the price change state in existing work_order_events.details, preserving his words without interpreting a mentioned number as a price.
* No explicit quote visit request for both client and household with company charge on the confirmation card. Preserve the shown charge and request purpose without new columns.
* Price writes/answers need idempotency and serialization with work/report writes. Price answers must target the current price.
* Entry 18 requires a confirmed technician report of Client refused, closure with a client summary, and charges decided by the owner. A client saying no first leaves the job held; the technician then confirms that the visit ended. A technician may also confirm a refusal said in person while the sent price is pending. A later change of mind uses a new linked request.
* Demo case 3 needs a held new price awaiting client approval plus a quote visit request. Add all new copy to every language file, including Gulf Arabic.

## Connection map

Technician finding > job event and hold > owner, supervisor and office waiting prices view > owner or authorized admin sends price > client approval and notification > approval releases hold; no keeps hold and tells team. Technician confirms Client refused > closed visit and client summary; no invented charge. Quote visit > charge read from company/site > client confirmation card > existing requests queue and saved charge.

## Local verification, October 23 2026

Typecheck passed. Final full npm test: 3791 passed, 4 failed, 3795 total across 229 files, completed in 415.69 seconds. The only failures are the four existing D1 RLS failures in tests/demo-proof.test.ts and tests/technician-ratings.test.ts specified in the run request. No new test failures remain.

Implementation commits: b03d2689 audit, 65b8297b backend, 13cbf3ca screens and demo, 2a828c94 agent. No schema migration was added. No push, deployment or live verification was performed. The reviewer owns the live role walkthrough and the 360 phone, 1440 desktop and RTL sweep. No remaining JOB25 code gaps are known.

## Screens and demo case 3

Job detail shows Price changed and the technician statement. The assigned technician records his words without a price field. Owner or admin with the existing payments handover sees Send price. Other office roles can read the held status and Waiting prices list. Client managers and households on their own request see Approve price and Say no. Failed saves keep typed fields and reuse the request key. Existing stacked forms, wrapping action rows and logical styles serve phone and RTL layouts.

Demo case 3: sign in as Imran and open Waiting prices on Dashboard. The Adjust meeting room cooling job is held with Ravi's new fan motor finding and a new AED 850 price waiting for Pranav. Switch to Pranav, review the same job and approve or say no. Approval allows work again. No leaves it held; Ravi can then confirm Client refused to close the visit. Suggested jobs also contains Pranav's Quote visit request for his water heater with the AED 150 visit charge. The shared sandbox fixture seeds both records on creation and reset.

Client refusal does not create a bill or invent a waiver. The event saves the region aware company visit charge or null and says the owner decides any charge. A later change of mind uses New request on the closed visit and the existing from_work_order_id field. The client form and agent keep that link. Restoring a refused visit is blocked on the server. A refusal closes as cancelled with the explicit Client refused event and client summary, since the existing report_outcome column has a fixed database constraint and no migration is allowed.

## Backend and agent proof

The hold is the latest price_change event in work_order_events.details. Existing work order status values stay intact. Status writes, report closure, checklist work and return visit actions lock the job and check the hold. Quote writes and answers use the same job lock, current membership and replay keys. Displayed price amount and version protect client approval cards from a replacement quote. Owner money handover remains the existing payments setting; its screen label now explicitly includes prices.

Existing quote and quote/decision endpoints accept Idempotency-Key. New endpoints: POST work-orders/{id}/price-change, POST work-orders/{id}/client-refused, GET waiting-prices, all below /api/workspaces/{ws}. Reads retain normal job visibility. Refusal closes the visit with a client visible summary and preserves the company visit charge for the owner to decide.

Quote visit preparation uses existing assistant confirmation cards and job suggestions. The saved visit charge is the one shown on the card, including zero or null. Technician agent reports save the person's exact message, overriding any model paraphrase. New tools require confirmation and recheck assignment when saving. All new labels, errors, settings and seeded phrases are present in every language file, with Gulf Arabic wording reviewed.

Focused proof: tests/price-changes.test.ts, tests/quote-visits.test.ts, tests/quotes-ui.test.tsx and tests/quotes-i18n.test.ts. Permission inventory, owner settings, notification connections, SSR preload, request form and copy checks retain their existing tests. The final focused set passed 52 tests; the role and screen set passed 1229 tests.
