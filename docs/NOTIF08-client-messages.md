# NOTIF08 client messages

Audit before changes, 23 October 2026.

Read NOTIF08, HOME06 and CMP05 in the master ledger, plus the HOME07 visit rules. The ledger records translated requester pushes and leaves app notice sentences to page translation. Native review and real phone delivery remain separate ledger work.

Checked notification templates, status notices in the work order service, push text, demo notifications and the existing live script. The live script checks Arabic badge text but only checks that the Arabic bell opens. It is not run for this task.

Confirmed gaps:

1. Client status notices use general status changes without visit time or photo counts. The timeline still relies on page translation.
2. Rescheduled visits and price approval notices lack translated pushes. Cancellation pushes are missing. Client cancellation wording still addresses a technician.
3. Saved visit times and photo details need structured rendering in the viewer language and company timezone across the bell and timeline.
4. Recipient creation mostly follows job visibility, but reading old bell notices needs an explicit visible job and internal note guard.
5. Pranav already has booked, travel and done demo rows. They need the same client templates, photo count and photo link as real rows.
6. Existing language coverage tests need the new sentences, Arabic rendering and service visibility cases.

No database migration is needed. Local tests and typecheck are required. Live verification, pushing and deployment are left to the reviewer.

Implemented:

1. The seven client updates share fixed templates across the bell, job history and requester push. All 21 language files contain the sentences. English variants use the English templates. Arabic uses Gulf wording.
2. Visit values stay as timestamps until rendering. Dates use the viewer language and company timezone, with saved calendar words for languages the browser may lack. Bell history reads the saved schedule events so later bookings do not rewrite earlier dates.
3. Completed messages count only after photos and link to the job photo section. Grouped bell notices can be expanded to read earlier booked and travel updates.
4. Bell rows and unread counts exclude foreign jobs and internal comments for clients. Household reads also require that the person requested the job. Internal comments are filtered from job details as well.
5. New travel updates persist in job history. Existing travel timestamps still render for older jobs. Prices awaiting approval appear in history even without an earlier JOB25 report. Repeated price submissions do not send another push.
6. Return bookings use the same push path. Push recipients follow the existing ledger rule: the requester who can see the job. Client pushes retain translated text when the push limit is reached.
7. Pranav's existing three demo rows use the real client templates, photo counts and photo link. No duplicate demo rows were added.
8. If a language file cannot load, the bell uses a complete saved translation file or waits for translations. It does not substitute English sentences.

The live script now checks the Arabic bell sentence as well as the badge. It was edited but not run. No migration, push or deployment was performed. Native review remains the separate LANG10 ledger task.

Local validation:

1. `npm run typecheck` passed.
2. The final `npm test` run covered 3902 tests: 3893 passed, the four known D1 permission failures occurred in `demo-proof.test.ts` and `technician-ratings.test.ts`, and five history tests were skipped when the shared fixture setup exceeded its ten second limit. All five history tests passed on a separate rerun.
3. An earlier full run also hit a request error test timeout. All four tests in that file passed on a separate rerun. No unrelated timeout settings or test code were changed.
4. Tests cover all seven client pushes in every selectable app language, including the push limit; every notification template and placeholder in every language file; Arabic rendering and unavailable language files; client and household visibility; private notes; price submission replay; and Pranav's demo messages with photos.
5. `node --check e2e/_notif08-live.mjs` and Git whitespace checks passed. The live script itself was not run.
