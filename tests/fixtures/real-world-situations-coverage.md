# Real world situations coverage

Prepared for JOB22. The measured run is December 1 to 7, 2026. Build gaps before November 30.

80 catalogue entries across 9 sections. Tool coverage means every needed capability for the described flow has an Agent tool for the mapped actor. It does not mean the situation passed a measured run. Missing items include approval handoffs and required record changes that an ordinary comment cannot replace. Human confirmations by another role still need separate turns.

| Section | Entries | Every needed tool today | With gaps |
| :--- | ---: | ---: | ---: |
| Payment and contracts | 14 | 0 | 14 |
| Job outcomes | 13 | 2 | 11 |
| People | 12 | 1 | 11 |
| Clients | 12 | 0 | 12 |
| Data errors | 9 | 0 | 9 |
| Emergencies | 7 | 0 | 7 |
| Language and channel | 3 | 0 | 3 |
| Memory | 4 | 1 | 3 |
| How the agent behaves | 6 | 0 | 6 |
| Total | 80 | 4 | 76 |

## Missing capabilities

Account deactivation with retained records: RW30.

Additional visit outcomes and charge rules: RW18, RW19, RW21, RW22, RW26.

Arrival window updates: RW21, RW35, RW79.

Asset creation and duplicate lookup: RW41.

Asset history updates: RW04, RW15, RW57.

Asset relinking and history recalculation: RW58.

Audited arrival time corrections: RW59.

Cancel accepted client requests: RW60.

Clear all personal memory: RW73.

Client address correction and visit rerouting: RW40.

Client booking with leave checks: RW04, RW17, RW20, RW48.

Client supplied parts and warranty acceptance: RW12.

Combined approval for affected jobs: RW28, RW29, RW30, RW34.

Company memory approval and provenance: RW71, RW73.

Company memory editing and causal lookup: RW72.

Configured visit charges and quote visits: RW09.

Contract expiry reporting and billing transition: RW44.

Contract invoice suppression and scope review: RW01.

Contract renewal and maintenance planning: RW43.

Contract response time alerts: RW35, RW79.

Contract scope split and extra work approval: RW06.

Duplicate request detection and merge: RW53.

Early language safety fallback: RW66.

Emergency cancellation with retained alert history: RW67.

English report copy through the Agent tool: RW75.

Follow up visit drafts: RW15, RW16.

Immediate safety alerts and dispatch: RW38, RW61, RW62, RW63, RW64, RW65, RW66.

Invoice discounts and corrections: RW07.

Invoice disputes and reminder pause: RW05.

Invoice draft correction: RW54.

Invoice lookup and bank transfer recording: RW11.

Job billing contacts and invoice resend: RW13.

Mixed language voice input and review: RW68.

Monthly contract invoicing: RW14.

Move requests between sites and clients: RW45, RW54.

Multiple technician and guest helper assignments: RW25, RW31.

Multiple visits on one job: RW20.

Off day swaps with both technicians consent: RW29.

On call escalation: RW65.

Owner read receipts: RW05.

Partial invoice payments: RW02.

Parts arrival tracking: RW16, RW17.

Personal language setting with Undo: RW37.

Photo upload and correction: RW22, RW56, RW76.

Private complaints with supervisor review: RW50.

Proactive late job suggestion cards: RW80.

Proxy completion with report pending: RW36.

Reopen own job before sign off: RW52.

Report sickness for another team member: RW28.

Required certificate assignment blocks: RW39.

Signed report corrections: RW57.

Technician cash receipt and owner handover: RW03, RW77.

Technician site note editing: RW78.

Unclear voice retry and text fallback: RW69.

Undo earlier Agent actions: RW55.

Unit billing rules and payer selection: RW42.

Unit lookup and creation: RW46.

Unknown sender intake and lead review: RW51, RW70.

Unsafe job stop outcome: RW38.

Verified phone and WhatsApp number changes: RW47.

Visit charge waivers: RW10.

Warranty callback links and billing decision: RW04, RW27.

Work hold pending revised price approval: RW08.

Worker invites and initial language and off days: RW33.

Working hours and available slot lookup: RW49.

## Data and run limits

The external catalogue remains outside this repository. This fixture is the test representation of entries 1 through 80. Sections 10 and 11 are instructions and demo references, not additional situations. The 19 top demo entries include entry 17, which section 11 mentions in the rebooking sequence.

The user brief specifies December 1 to 7. Catalogue section 10 instead says December 21 to 27. The user brief takes precedence.

The requested sandbox actors are from lib/fixture.ts and lib/services/demo.ts. Most catalogue sites, staff and job histories are from lib/fixture-dune-harbour.ts. Those records are not silently assumed to exist in the sandbox. Kevin is client office staff, not a facility manager. Pranav is the closest facility manager. Building manager duties use Pranav with a note. Unknown senders have no signed in equivalent and use Nabil only as an office review proxy.

Entries 2, 3 and 77 use 120 AED from the Dune Harbour sample washing machine tap repair. This is only an input amount for testing. Entry 11 retains [number] and needs_data because neither seed has invoice identifiers. A work order number must not stand in for one.

English is filled. Gulf Arabic, Malayalam and Filipino remain null with status to translate. Agent and Groundwork must stay unchanged during translation.

Entries 53, 71, 74 and 80 describe automatic events. Entry 73 needs two speakers. Entries 68 and 69 need real audio, entry 76 needs a photo, entry 66 needs an Early language setup, and entries 51 and 70 need unknown sender intake. The runner reports these as requiring setup instead of pretending that a signed in text prompt measures them. Entry 75 retains the text transcript but does not measure speech recognition. Entries 1 and 28 contain alternate speaker variants that need additional runs later.

The later runner captures one initial Agent turn and never approves a card automatically. Its result requires human review against expected changes, confirmations and edge cases. It records API card payloads, not a browser rendering assertion. Workspace snapshots cover visible records, messages, approvals and logs; inaccessible or unavailable reads make change detection incomplete. A reply alone is never treated as proof that a mutation occurred.

The default cap is zero. DRY_RUN=1 reads only local fixtures and writes a local plan. A later live run requires a positive MAX_CALLS value and CASE_IDS to select prepared cases. LANGUAGE defaults to en. REPORT_PATH selects the JSON report path. Each actual assistant request consumes one call before it is sent, including errors. No retries or parallel cases are used. The app can make multiple provider calls inside one assistant request, so the cap limits runner requests rather than internal model calls.

A later operator must prepare matching records in the fixed sandbox before selecting cases. The runner reports results by catalogue section with snapshots and pending cards for review. It does not reset the shared sandbox or resolve confirmations.
