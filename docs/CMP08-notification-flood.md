# CMP08 notification flood check

## Existing behavior inspected before changes

The app already groups notifications and tests that behavior. Per the requested stop condition, this change documents the implementation and adds regression tests only. It does not change app code, database schemas, or migrations.

`lib/services/notifications.ts` lists individual notifications newest first by `created_at` and `id`, with 25 items per page by default. Counts refer to individual notifications. Client visibility is checked before listing. The individual read endpoint updates one notification; the read all endpoint updates unread notifications in the workspace under the existing user database context.

`lib/ui/notifications.ts` provides `groupNotifications`. It groups work order links by job, including the `work_order` alias. It preserves the incoming order, so the service's newest item leads the group. Demo notices, emergency alerts, and emergency review alerts stay separate. Grouping is within the loaded page, combines different kinds and read states, and does not group other subjects. It does not independently sort input or check an explicit urgent priority.

Before this follow up, `components/app/notifications.tsx` showed the lead message and an expandable count of additional updates. Opening a group lead marks that notification read and starts individual read requests for its remaining members. Those additional requests are not awaited and errors are ignored. The row's Mark as read button and selection action mark only the lead item. This was the reliable group read gap addressed below.

`lib/services/push.ts` uses existing `push_subscriptions.burst_start` and `burst_count` columns. Per device, it allows six pushes in ten minutes, then one summary, then suppresses further ordinary pushes until the window resets. Status pushes retain their localized message for the summary. Explicitly urgent pushes bypass suppression. `lib/services/emergencies.ts` sends emergency and emergency review pushes with `urgent: true`. There is no per person, per job, per kind push window and no notification quiet mode in these paths. Browser tags identify job updates, but are not a server delivery limit.

Notification insert sites were located with `rg 'INSERT INTO notifications'` and inspected in `lib/services/job-next-step.ts`, `client-visits.ts`, `push.ts`, `job-close.ts`, `ratings.ts`, `work-orders.ts`, `emergencies.ts`, `price-changes.ts`, `quotes.ts`, `time-off.ts`, and `day-plan.ts`, plus fixture helpers. Ordinary notifications are stored individually rather than merged on insert. Some producers avoid replay through domain state or idempotency, such as emergency request keys, rating conflicts, and demo push checks by person, job, and tag. These are not a general notification dedupe rule.

The search also found `INSERT INTO public.notifications` in existing database triggers. The status, comment, assignment, report, role, leave decision, suggestion, direct message, team message, and accepted join request paths insert individual event rows. State change checks and distinct recipients avoid some duplicate production, but there is no general repeated alert window in these trigger paths. These existing migrations were read only.

`lib/notification-words.ts` loads the same saved language files used by the browser. Notification descriptors and the existing count sentences live in `lib/ui/notifications.ts`; `NotificationMessage` and `useNotificationLanguage` render them through the language files with protected names and job titles. No new user facing copy is needed for this documentation and test change.

## Existing evidence and added coverage

* `tests/push-burst.test.ts` covers job grouping, work order aliases, demo separation, the device burst summary, window reset, and urgent push bypass.
* `tests/emergency-ui.test.tsx` checks that emergency and review alerts remain separate beside ordinary job updates.
* `tests/notif08.test.ts` exercises notification production and grouping alongside localized push and bell messages.
* `tests/notification-templates.test.tsx` covers the rendered expandable count in multiple languages. Additional regression coverage verifies opening the lead marks every loaded group member read, leaves another job unread, and keeps repeated emergency alerts individually visible.

## Group read gap follow up

The reliable group read gap is now closed. `POST /api/workspaces/[ws]/notifications/read` accepts one to 100 notification ids. The service uses one UPDATE statement within `inWorkspace` and its existing `withUser` context, with explicit workspace and caller filters and RLS respected. Other users' ids, other workspace ids, and missing ids are ignored. Validation rejects oversized or invalid batches before writing. No schema or migration changes are needed.

The row Mark as read button, selection action, and opening a group now await this endpoint for every loaded member of the affected groups. Opening also handles a read lead with unread older members. Rows, unread counts, and the bell badge change only after success. Failed requests keep unread state and display the existing error copy. Opening waits for success before navigating. Selection sends all selected groups in one batch.

Endpoint coverage checks ownership, workspace isolation, unknown and duplicate ids, repeat requests, validation, and authentication. UI coverage checks row, selection, opening, a read lead with unread members, pending requests, failures, retries, and badge deltas. Existing grouping rules, push limits, and user facing copy remain unchanged. The narrower same kind and unread grouping and per job push window described in Step 2 remain gaps for a separately authorized implementation.

## Local validation

`npx tsc --noEmit` passed. All 238 tests across 11 suites passed: notification templates, audit and notification settings, NOTIF08, push burst, push delivery, demo push, demo push UI, emergency service, emergency UI, i18n coverage, and copy dashes. The suites ran with `--hookTimeout 30000` for database fixture setup. No coverage report regeneration was needed because no app copy or translation keys changed. Live verification, deployment, and pushing are left to the reviewer as requested.
