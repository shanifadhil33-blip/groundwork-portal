# SEC07 data protection part 2

Implemented without a migration. This is an account control and transparency feature supporting requests under the UAE Personal Data Protection Law, Federal Decree Law 45 of 2021. It is not a certification of compliance or a substitute for a company's legal retention decisions. No external provider or live environment was contacted to implement or verify it.

## Notice and access

The public `/privacy` notice ships authored English and Gulf Arabic, including an explicit Arabic language button and right to left reading direction. It describes purposes, role visibility, free AI services and possible processing outside the UAE, retention, export, deletion and a contact for correction, restriction, consent withdrawal or concerns. The existing landing and public footer links and Google sign in notice remain. Code sign in also links directly. Settings has a **Your data** tab with the notice and account controls.

SEC06 seals phone numbers, text and voice payloads in the channel tables with AES 256 GCM using the server secret. It does not seal the entire database. Profile phone numbers, names, jobs, photo bytes and browser voice transcripts may be ordinary database fields. Sign in codes are hashed. The notice makes this distinction explicit. The authored English and Arabic notice never needs an AI request. Other interface languages use the existing translation path and explicit pending catalog entries.

The currently supported optional free provider chain is Google Gemini, OpenRouter, Cloudflare, Kilo, OVHcloud, Z.AI, NVIDIA, Requesty, Groq, Cerebras and Mistral. Providers run only when configured; keyless services also require the existing opt in. Translation excludes OpenRouter and Requesty. The notice lists supported providers, not a claim that each is enabled or has identical retention terms. Recheck this list when `lib/ai.ts` changes.

## Exports and permissions

* `GET /api/me/data` downloads the authenticated person's JSON across their current companies, or profile and preferences if they have no company.
* `GET /api/workspaces/:ws/data` restricts the same personal export to one company. Another company's identifier returns 404.
* `GET /api/workspaces/:ws/data?scope=company` requires an active admin or owner membership in that company. Supervisors, office staff, technicians, facility managers, client staff and households receive 403.
* All downloads use a private, no store response and an attachment filename. The browser sends the existing account identity header to reject a download if the signed in person changes.

Personal exports use explicit field projections and predicates for the authenticated subject: profile, preferences, jobs created by or assigned to them, comments authored by them, reports signed by them, their leave, their personal learning and their own channel messages. Authored comments and reports remain exportable after reassignment; that is why these narrow ownership queries use an attributed owner transaction rather than losing the subject's own content behind current job visibility. Ratings additionally go through current job visibility and the existing `getRating` service: private low ratings do not become visible to technicians or office staff. Channel values are opened only where `user_id` equals the subject, with an active membership check. Sign in code messages are omitted. No other person's profile, credentials, private learning or sealed payload enters a personal export.

Company exports contain company work records, team space messages, company vocabulary and lessons, join and invite records and company membership identities, not people's global profiles, personal preferences, private conversations, personal Agent learning, channel payloads or authentication capabilities. Every operational query has the requested `workspace_id` predicate and a fixed table list. Company documents and job linked photos include base64 file contents. Private conversation photos and personal drafts are excluded. Company audit exports contain action metadata rather than arbitrary snapshots that might contain private values. Large exports are currently assembled in memory; a streamed archive would be a future scalability improvement.

## Account deletion

The Settings confirmation uses **Yes** and **Change**. The server accepts only `{ "confirm": true }`; a caller cannot supply a different subject for their own request. Requests are durable receipts in the existing `idempotency_keys` table, with scope `sec07:delete:<workspace UUID>`, key `request`, and a fixed fingerprint. These are not expiring login capabilities and retention cleanup must never delete them as ordinary replay caches.

Request creation adds one receipt for every active membership. A company admin or owner sees only their company's receipts in Settings and can confirm approval. Other roles see only their own request. Each company approves its part; the last approval completes account deletion in one transaction. No company can delete a person's account independently of their other companies. Until the last approval the account remains active. Adding another company requires its approval too. Advisory locks serialize requests and approvals for the same subject, and row locks protect identity and current memberships during completion. A person who owns a company must transfer ownership and give up their owner role, or close that company first. A signed in person with no active company can confirm immediate deletion without an approver.

Completion clears name to **Deleted person**, email, photo and phone, removes Google account links, sessions, sign in links and verification records, channel payloads, private conversations, personal Agent learning, preferences, personal nicknames and personal vocabulary. It removes the person's team messages and private message translations. API keys are removed. Memberships are archived and cannot be restored after deletion. Session resolution also rejects a completed real deletion receipt, even if a stale session is reinserted.

Company jobs, assignment references, comments and reports keep their foreign keys and history. Copied comment and suggestion author names and notification actor names become **Deleted person**. Structured subject contact fields and leave notes are cleared. Authored browser voice transcripts on comments and suggestions are removed. Audit action metadata remains, but snapshots referencing the subject or their known identity values are cleared inside companies the subject belonged to; this also removes snapshots made by the anonymisation itself. Other companies' audit records are not altered.

This is pseudonymisation of retained company work records, not a promise that all free text or photographs are anonymous. A person may have typed a phone number into a report, and others may mention them in photos or text. The notice asks the company to review that content. The company must decide whether a record is necessary for a documented legal obligation or dispute, explain any refusal to the requester and contact the maintainer for exceptional review. No automatic NLP, AI redaction, legal hold or guessed text deletion is used.

Only the owner can confirm company closure. Real closure reuses the existing checked database deletion function, removes company audit snapshots and replay receipts containing that company identifier, and leaves personal accounts used elsewhere intact. It does not promise to close those people's independent accounts.

## Demo practice

Requests and approvals use the visitor's isolated sandbox and the same server role checks. Account deletion and company closure are explicitly labelled practice. Approval updates its receipt and returns an illustrative neutral name, disabled sign in and preserved job history; it does not mutate profiles, sessions, memberships or jobs. Closure likewise reports a practice result without removing the sandbox. Persona switching keeps working. Sandbox reset or expiry removes practice receipts with the sandbox users. The shared demo and other visitors are unaffected.

## Retention rules

The rules below state current behaviour, including event based retention where an automatic fixed deadline would destroy company records without authority. The company should review purpose and necessity annually and handle earlier valid deletion requests through the process above. The aim for a human response is 30 days; this is an operating target, not a statement of a statutory deadline for every case.

| Data | Retention and deletion rule | Enforcement |
| --- | --- | --- |
| Profile, preferences, personal Agent learning and private conversations | While the account is active; removed when an approved account deletion completes | Account deletion transaction |
| Account sessions | Until their recorded expiry, sign out or account deletion, whichever happens first | Authentication rejects expired sessions immediately; scheduled cleanup removes expired rows |
| Login links, verification tokens, phone change records | Until their recorded expiry or account deletion | Existing redemption checks refuse expiry immediately; cleanup deletes expired rows |
| Hashed sign in attempts | At most one day plus the interval to the next cleanup | Cleanup by `created_at`; recent attempts remain for rate limiting |
| Read notifications | 90 days from creation plus the interval to the next cleanup | Cleanup deletes only read notifications older than 90 days |
| Unread notifications | Until read and old enough for the rule above, or account/company deletion | Deliberately no automatic loss of unseen work alerts |
| Company jobs, comments, reports, ratings, files, leave dates, work events and company rules | While the workspace remains open for its operational records; personal identity fields are scrubbed on account deletion; removed on workspace closure | Company closure and subject anonymisation, no unsafe bulk age purge |
| Audit action metadata | While the workspace remains open; identity bearing snapshots are cleared on subject deletion; company audit rows are removed on privacy closure | Anonymisation and privacy closure transaction |
| Deletion receipts and anonymised subject UUID | While referenced company history remains; minimal subject UUID, request time and state, no contact details | Needed to prevent restore of a deleted account and prove request handling; company receipts removed on closure |
| Demo data and practice receipts | Sandbox expires six hours after creation; removed by the next scheduled cleanup or sandbox reset | Existing demo cleanup and reset |
| Provider and hosting backups | Provider controlled lifecycle, not instantly erasable by application code | No backup deletion SLA is claimed; restore procedure must replay completed deletion receipts before serving traffic |
| AI provider copies and external exports | Governed by the provider or recipient's retention policy | Application cannot recall files or erase external provider copies |

`cleanupPersonalData()` removes only expired login links, phone changes, verification tokens and sessions, sign in attempts older than one day, and read notifications older than 90 days. It uses existing expiry/time fields and runs behind the existing bearer protected `/api/cron/demo-cleanup` route after sandbox cleanup. No new public cleanup endpoint or cron deployment is required. An absent or invalid cron secret refuses the call. Cleanup returns counts, never row content or secrets. It also clears snapshots of purged notifications, including the copy made by the delete audit trigger, while preserving audit action metadata. Active codes, current sessions, recent attempts, unread notifications, jobs, audit history and deletion receipts are preserved. Running it twice is safe. Scheduling remains the existing hosting configuration and was not live verified in this change.

## Needs migration

No migration is included or required for the implemented controls.

Future improvements that need deliberate schema or lifecycle design rather than unsafe guesses:

* A dedicated deletion request table with per company decisions, actor/time, refusal reasons, cancellation, deadline tracking and a separate immutable account tombstone. Current receipts preserve the minimum state using an existing table; they do not pretend to provide a complete legal case management system.
* A purpose specific company retention deadline and legal hold record, with explicit approval before purging operational job or financial records by age. A universal automatic expiry would be unsafe without these decisions.
* Comprehensive structured personal data provenance and attachment redaction status, so free text, copied names, photo content, AI caches and backups can be reviewed and tracked without deleting legitimate company history by string guesses.

## Local validation

`tests/data-protection.test.ts` covers personal export and company export permissions for every role, cross company denials, attachment/no store response headers, account changes, owner only sealed value opening, authored content scope, rating visibility, strict confirmation, request privacy and replay, admin handling, cross company approval, disabled sign in, irreversibility, preserved job history, sandbox practice/reset, owner only company closure and safe retention boundaries. UI tests cover the confirmation and authored Arabic reading direction without live provider calls. LANG01 coverage acknowledges unfilled other languages using pending markers and ships authored Arabic controls.

Run `npm run typecheck`, the related tests, `node scripts/i18n-coverage.mjs --check`, and `npm test`. The four existing rating RLS failures are recorded separately from SEC07 regressions. No build requiring remote font fetching, external API probe, browser/live walkthrough, push or deployment is part of this local verification.
