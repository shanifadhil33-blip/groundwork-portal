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
