# JOB25 Quotes and price changes

Core loop: request, visit and report. Show the company visit charge before a quote visit; stop work when a new finding needs a price and wait for the client to approve.

## Gate, October 22 2026

Read the project start gate, known issues, JOB24 style reference, exact real world entries 8, 9 and 18, universal roles, edge cases and connection map, phone and desktop notes, existing Groundwork competitor study and installed Next route guidance. Reuse current job, dialog, confirmation and translation patterns. No migration, push, deployment or live verification in this run. Local typecheck and full tests are required. Reviewer owns the live role and responsive sweep.

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

## Local verification

Backend implemented in lib/services/price-changes.ts and existing quotes, work orders, report and checklist services. Focused backend tests: 10 passed across price changes and quotes office. Initial typecheck passed. Full verification pending.

## Screens and demo case 3

Job detail shows Price changed and the technician statement. The assigned technician records his words without a price field. Owner or admin with the existing payments handover sees Send price. Other office roles can read the held status and Waiting prices list. Client managers and households on their own request see Approve price and Say no. Failed saves keep typed fields and reuse the request key. Existing stacked forms, wrapping action rows and logical styles serve phone and RTL layouts.

Demo case 3: sign in as Imran and open Waiting prices on Dashboard. The Adjust meeting room cooling job is held with Ravi's new fan motor finding and a new AED 850 price waiting for Pranav. Switch to Pranav, review the same job and approve or say no. Approval allows work again. No leaves it held; Ravi can then confirm Client refused to close the visit. Suggested jobs also contains Pranav's Quote visit request for his water heater with the AED 150 visit charge. The shared sandbox fixture seeds both records on creation and reset.

Client refusal does not create a bill or invent a waiver. The event saves the region aware company visit charge or null and says the owner decides any charge. A later change of mind uses the existing linked suggestion/request field from_work_order_id. A refusal closes as cancelled with the explicit Client refused event and client summary, since the existing report_outcome column has a fixed database constraint and no migration is allowed.
