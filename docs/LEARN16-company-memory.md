# LEARN16 Company Memory

Company Memory is at `/settings/company-memory`, linked from Settings and from the existing personal Memory page's Company rules section. Owners/admins can correct or delete; supervisors can read. Office staff, technicians and clients cannot access this page's API. No switches were added.

## Audit before implementation

- `0039_personal_agents.sql`: `company_rules` stores shared instructions with body, creator and creation time. Its existing RLS permits admin insert/update/delete. Owners use the admin role. `personal_agent_learning` remains private to its author. These are the stores already shown by the existing learning UI, `PersonalAgentLog` at `/settings/agent/log`.
- LEARN01–05: preferred name, warm replies, reply length, usual start/areas are personal preferences (`0048_preferred_name.sql`, `0055_reply_length.sql`, `0065_channel_memory.sql`, greeting/settings/usual-context services). They do not belong in company memory.
- LEARN08/09: the Agent's conversations, corrections and habits use `lib/services/assistant.ts`, `lib/services/habits.ts` and `lib/learn-habits.ts`. Standing company corrections already enter `company_rules`; one-time changes do not become rules. No separate learning table was found for these ledger entries. The repository has no explicit LEARN03/06/07 markers or separate stores; related reply and conversation behavior was inspected in the same Agent code.
- LEARN10/14: `lib/services/company-history.ts` computes patterns from finished work orders with real visit/report evidence. Those are job-specific calculations, not persisted company lessons. They retain their existing job-page presentation and authorization.
- LEARN11: `0060_agent_words.sql`, `lib/services/agent-words.ts` and the existing Words section store company and personal vocabulary separately. The existing word editor retains management of these aliases.
- Day-planning services and `0067_day_plan.sql` were also inspected. The deterministic morning planner uses jobs, trades, areas and availability; it does not interpret prose lessons. The conversational Agent already supplies company rules to the model when helping plan work.
- LEARN12/13: `0068_lesson_approvals.sql`, `lesson_proposals`, `decide_lesson`, `lessons.ts` and `LessonsWaiting` provide approval and company separation. Only approved proposals enter the active stores; an admin's direct instruction follows the existing LEARN12 behavior.
- LEARN15: `agent-learning.ts`, personal Memory UI and Agent tools manage each person's own memory. Company Memory does not expose personal notes, questions or action histories.
- Existing `audit_log` has workspace, actor, entity, entity id, action and timestamp fields, plus the workspace/entity-id index from `0012_speed_indexes.sql`. It can hold context-use events without a schema change.

## Behavior and evidence

Each active company rule appears as a lesson, including an instruction that records a company pattern. Its evidence is labeled **Recorded instruction**, with the real recorder's name and stored date. These are human instructions, not claimed causal findings from jobs. Existing rows have no durable proposal-to-rule foreign key, so the page does not infer approval provenance by matching text, invent supporting jobs or display a confidence score.

**Included in Agent context** counts `audit_log` entries with `entity='company_rules'`, the rule id and `action='memory_used'`. Each model invocation reads the current newest five rules, preserving the previous Agent limit and 200-character prompt limit, and records their inclusion. Calls handled without a model do not increment the count. This measures supplied context, not proof that the model followed a lesson or changed a decision. Earlier uses are not backfilled and the page says so. The log contains rule ids, not chat text or private memories.

A correction is limited to the existing proposal store's 300 characters. Saving atomically deletes the incorrect active rule and inserts a replacement into `lesson_proposals`. All company corrections are high impact and wait for an owner/admin's explicit “Yes, use it” in the existing queue. A failed proposal rolls the deletion back. No-op corrections preserve the original. Declining leaves the incorrect rule retired. Approved corrections become a new active rule and start a new count.

Delete removes the rule from the same store used by the Agent. Every subsequent model invocation reloads that store, and the prompt says that prior chat may contain deleted instructions. In-flight work and already-saved plans are not retroactively rewritten. The deterministic morning planner remains based on operational data; deleting a lesson affects the conversational Agent's next plan, not actual job facts.

The existing tool infrastructure now exposes `company_memory`, `correct_company_memory` and `delete_company_memory`. The two writes require admin permission and a confirmation card; the card identifies the current instruction. Confirming a correction only queues it for lesson approval. Services and database RLS check writes again. Reads/usage counts use an attributed owner transaction only after checking active workspace membership and role, and return a fixed projection of company data.

## Schema decision

No new tables, columns, constraints or applied migrations. No pending migration is needed for this implementation. Existing audit events provide context-use history; existing rule creator/date provide the available evidence. Richer causal job evidence or proof of model decision attribution is not available in these records and is not fabricated.

## Languages and narrow screens

All new page phrases ship in every non-English app dictionary, including Gulf Arabic. English variants use the original copy. The established Translator sets RTL for Arabic, Urdu, Pashto, Dari and Farsi. User-authored instructions and names remain in their original language with automatic text direction. Layout uses logical properties, wrapping action rows and evidence fields, flexible widths and long-word wrapping for 360px screens. There are no fixed-width tables or switches.

## Sandbox follow-up

New and reset Ridgeline sandboxes include three fictional recorded instructions in
`company_rules`: Ravi's filter-size lesson, Sam's site-access instruction and Imran's
stock-check instruction. The records are dated 12, 9 and 6 days before creation;
their sample `memory_used` audit events provide counts of 8, 5 and 3. These are
seeded demonstration history, not observations of real Agent calls or job outcomes.
Ordinary context inclusion increments the same counts after setup. Real companies
and existing sandboxes are not backfilled; reset the demo to load the new samples.

Only the exact seeded lesson bodies and quote-request title/problem enter the
existing demo translation allowlist. Every app language has static translations;
authored edits, names and real company instructions retain their original wording.
Company Memory's new sentences use each language's existing Settings label for the
Agent, including الوكيل in Gulf Arabic. The ledger backup's LEARN16 entry names
Joseph's lesson without specifying its wording; this fixture uses the existing
technician Ravi and a concrete filter-size instruction.

Regression coverage includes sandbox creation/reset/switching and isolation,
recorder/date/audit evidence, owner/admin writes and supervisor read access, and
the actual Company Memory and dashboard suggestion components in every supported
language. The UI tests use a 360px viewport with jsdom; visual browser checks remain
with the reviewer.

Follow-up validation: `npm run typecheck` and `git diff --check` passed. Full
`npm test`: 4,299 passed, with exactly the four known D1/RLS failures in
`tests/demo-proof.test.ts` and `tests/technician-ratings.test.ts` (234 passing
files, two failing files). No follow-up regression tests failed. No live checks,
push, deployment or schema changes were performed.

## Initial LEARN16 validation

- `npm run typecheck`: passed.
- Full `npm test`: 4,224 passed, four expected failures across 235 files (233 passing files). The failures are the two D1 cases in `tests/demo-proof.test.ts` and the real/demo cases in `tests/technician-ratings.test.ts`; no Company Memory tests failed.
- New integration tests cover HTTP role access, owner and plain admin access, supervisor read-only access, private-memory exclusion, approval-gated corrections, unchanged/invalid edits, real company isolation, archived membership, deletion from the actual next Agent prompt and confirmed Agent correction cards.
- New UI tests cover evidence/count presentation, editing, reviewable delete confirmation, failure handling, role visibility, every supported dictionary and Gulf Arabic RTL. The RTL test sets a 360px viewport; jsdom does not measure layout overflow, so browser visual verification remains with the reviewer.
- `git diff --check`: passed.

No live verification, push or deployment was performed. All database-backed tests used the configured isolated local test database; no new migration was applied.
