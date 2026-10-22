# JOB24 Checklists and materials

Core loop: visit and report. Technicians record steps and parts, and supervisors, owners and clients review them at sign off. Materials and unfinished steps never block the existing close flow.

## Gate, October 22 2026

Read project start gate, known issues, universal roles, edge cases and connection map, phone and desktop notes, the existing competitor study in shared championship, and local Next route guidance. Existing app controls and visual patterns apply to this addition. No new site or design system.

Backend proof: lib/services/job-checklists.ts and tests/job-checklists.test.ts. Current membership and assignment are checked on every write. Reads retain job RLS, including client and household scope. No user impersonation. Office staff cannot configure or edit these records.

Storage: templates under workspaces.working_hours.checklists, keyed by trade. Preserve existing hours and other keys, including during onboarding. Job snapshots in work_order_events.details with kind job_checklist. The first edit copies current template text. Later template changes do not change a saved job snapshot. Lock the job while changing steps or materials so concurrent edits and report closure serialize. No migration. Snapshot data has only steps, material names, quantities and optional notes, with no prices.

Screens: Settings Checklists for owner, admin and supervisor. Job card on detail and report dialog, including read only client view. Short step fields, move buttons, existing dropdown and stacked form controls. Logical CSS and wrapping support RTL and narrow phones.

Agent: read checklist tool plus separate tick and material writes, using existing Yes and Change confirmation. Both role tool lists and server service checks apply.

Edges: up to twelve unique steps of eighty characters; thirty materials; positive quantity up to one hundred thousand; optional note up to two hundred characters. Unknown steps rejected. Completed and cancelled jobs cannot be edited. Idempotency keys prevent retries adding duplicate materials. Failed saves preserve typed inputs and show retryable errors.

Live role walkthrough, phone sweep and deployment are deferred to the reviewer by explicit run instruction. Local typecheck and full tests are the verification gate for this run.
