# DEMO10 coverage

This slice grows the existing Dune Harbour fixture towards the six month history in the story's section 7. The scope below records the requested “What” items, the planted cases in section 6, and the remaining full demo work. The story at `/tmp/dune-story.md` was read only. The fixture's trimmed cast wins: 13 men, with three office users, six technicians and four client logins. Yousuf remains a contact only. Sanjay, Paolo and the other removed people are not added.

## What is seeded

| What asks for | Seeded now | Remaining work and reason |
| --- | --- | --- |
| About six months of jobs, every status | 52 jobs, starting 180 local calendar days before reset. Each of six 30 day bands has four completed visits and one cancelled request. Current work covers open, scheduled, in progress and waiting for parts. | This is a compact sample history, rather than a full company's daily workload. |
| Every trade and area | AC, plumbing, electrical and general repairs. History for all six technicians across the clinic, Creekgate and both homes. Sites remain in Al Qusais, Deira and Al Nahda in Dubai. | No invented Sharjah sites. Anil's existing area preferences remain as defined in the trimmed fixture. |
| Reports with all four outcomes and short why notes | 37 reports: 31 fixed, three temporary, two needing a part and one that cannot be fixed. Problem and work notes explain the cause, repair or blocker. Completed job timelines record booking, starting and finishing on their historical dates. Cancelled requests explain why they were cancelled. | Reports are authored fixture examples in English, translated for viewing. No claim that they came from real recordings or live Agent work. |
| Off days, leave and the demo day | Existing weekly off days remain. Murali has approved leave from reset day through three days later and no active bookings. Kamau's same day sick request stays pending while Joseph moves his three jobs. Generated historical visits avoid each technician's weekly off day. | Reset day follows the actual workspace date, rather than pretending every day is Tuesday. Sanjay is outside the cast, so Murali demonstrates approved leave. Automatic sick day reassignment is not fabricated. |
| Assets and unit service history | Six assets across all four sites. Clinic waiting room AC, server room AC, Creekgate riser panel and basement pump, Faisal's water heater and Vikram's bedroom AC. Existing jobs link to their actual units. | More equipment and fuller asset specifications can follow later. |
| Ratings | Arun gives two stars on the second clinic leak repair, Kevin gives four on the latest one, and Faisal gives five on his tap repair. Each rating belongs to a completed job for that client's company. Faisal's job was created by Faisal. | No Paolo login or invented client is required. Seeds do not send notifications. |
| Invoices, prices and payments | Three signed off fixed jobs have waiting draft bills in `draft_invoices`, using the existing `draftLines` SAMPLE price list. Existing approved repair prices, clinic contract receipt and three supplier costs remain. Owner overview stays at AED 11150 received and AED 645 spent. | These are draft bills awaiting the owner, not issued invoices or sent payment requests. Ridgeline has no issued invoice seed to reuse. No new invoice or payment system is introduced. |
| SAMPLE documents, including two near expiry | Not added in this slice. | Reuse Ridgeline's existing SAMPLE document generator in a later slice. This is deferred scope, not a schema limitation. |
| Past Agent decisions with why notes and some undone | Report reasons and cancellation explanations are present. | Dune does not yet seed `assistant_actions` or undone decisions. Ridgeline supports this path; it is deferred beyond this history slice. No synthetic Agent actions are claimed. |
| WhatsApp conversations | Not seeded. | Wait for WA01 and an agreed conversation fixture. The voice note descriptions are sample text, not actual WhatsApp messages. |
| Before and after photos and voice media | Not seeded. | Photos need staged fictional site images. Voice reports need staged recordings in the cast's languages. No real sites or people are represented. |

## Planted cases

1. Clinic repeat fault: the same waiting room 2 AC has three leak visits at 118, 62 and nine days before reset. The first report records a temporary fix and a cracked tray. All three jobs share one asset ID, so ordinary asset history exposes the pattern.
2. Creekgate repeat fault: two earlier breaker reports and Rashid's current job share the floor 9 riser panel. Anil's report explicitly names the worn 63 amp breaker. No extra inferred diagnosis is seeded.
3. Overdue job: Rashid's Creekgate job is scheduled and due yesterday on every reset. Its report and description say the replacement breaker has not arrived. It satisfies the existing overdue query without waiting for a time of day or running a demo control.

The retained sick request, fan motor price note and Kevin's suggested clinic request also remain available. The fixture supplies evidence for existing screens; it does not simulate live alerts, Agent suggestions, learning, message delivery or a completed reassignment.

## Dates, localization and isolation

The database reset instant anchors the workspace's local date. Visits, due dates, reports, leave, ratings and draft bills derive from that date. Future reset tests cross the leap day boundary and a new year, including a UTC date that is already the next day in Dubai. Random IDs are sandbox specific; the cast, counts, history bands and relative cases rebuild consistently.

Dune prose uses the same LANG12 exact fixture allowlist and Translator path as Ridgeline. `lib/demo-dune-harbour-copy.ts` lists the permitted sample text. Gulf Arabic translations ship in `public/i18n/ar-AE.json`, covering job titles and descriptions, report reasons and work, asset labels and locations, leave, ratings, suggestion text, money notes and price comments. Names, brands, addresses and editable values remain data. Changed notes and real workspace records stay verbatim. Other languages use the existing translation path; complete offline Dune dictionaries for those languages remain future work. Ridgeline's existing offline dictionaries and tests retain their scope.

All people remain male, and seeded prose contains no dashes. No migrations, schema changes or real logins are introduced. Seeding uses existing table inserts and helpers, as Ridgeline does, rather than notification sending service calls. `lib/services/demo.ts` is unchanged: Dune still requires server flag `DEMO_DUNE_HARBOUR=1`; without it judges get the existing Ridgeline demo. Both companies retain their existing six hour sandbox expiry and reset paths.

## Local validation

Only local Postgres and local tests were used. No live verification, push or deployment was performed.

* `npm run typecheck`: passed.
* `npm test -- tests/demo-dune-harbour.test.ts tests/demo.test.ts tests/demo-language.test.ts tests/demo-cleanup-new-tables.test.ts`: 24 tests passed. Covers status and outcome counts, six history bands, reports and timelines, relative dates at calendar boundaries, assets, overdue detection, leave, rating ownership, draft bill contents, overview money, hidden flag, reset cleanup and unchanged Ridgeline fixture counts.
* `npm run test:i18n -- tests/screens-i18n.test.tsx tests/demo-job-i18n.test.ts tests/notification-templates.test.tsx tests/i18n-word-hyphens.test.ts`: 256 tests passed. Includes actual Arabic rendering of every Dune allowlisted phrase without runtime translation, real workspace and editable text protection, and existing Ridgeline locale coverage.
