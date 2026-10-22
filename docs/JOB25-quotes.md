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
* Entry 18 requires a confirmed technician report of Client refused, closure with a client summary, and charges decided by the owner. A client saying no first leaves the job held; the technician then confirms that the visit ended. A later change of mind uses a new linked request.
* Demo case 3 needs a held new price awaiting client approval plus a quote visit request. Add all new copy to every language file, including Gulf Arabic.

## Connection map

Technician finding > job event and hold > owner, supervisor and office waiting prices view > owner or authorized admin sends price > client approval and notification > approval releases hold; no keeps hold and tells team. Technician confirms Client refused > closed visit and client summary; no invented charge. Quote visit > charge read from company/site > client confirmation card > existing requests queue and saved charge.

## Local verification

Pending implementation and local checks.
