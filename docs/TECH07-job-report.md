# TECH07 Structured job report

Written Oct 18 2026 from the live code (lib/services/job-report.ts, live since JOB12). Same report from the Job report button and from the Agent (save_job_report).

## Fields

| Field | What | Rule |
|---|---|---|
| problem | What was wrong, in the technician's own words | Up to 2000 characters. Can be empty. |
| work | What he did | Up to 2000 characters. Can be empty. |
| outcome | Fixed, Temporary fix, Needs a part, Can't be fixed | Defaults to Fixed. |
| problem_en, work_en | English copy when he wrote in another language | Saved next to his words, never instead of them. |
| language | The language he wrote in | For showing the original. |
| updated_at | The job's last change time he saw | Required. A changed job is refused with "This job changed. Open it and review your report before sending again." |

Nothing else is required: an empty report still closes the job as Fixed, so a tired technician is never blocked.

## Where the job goes next

| Outcome | Job status after | Notes |
|---|---|---|
| Fixed | Done | Steps through Scheduled and In progress if he skipped them, so the timeline stays complete. |
| Temporary fix | Done | The client sees Temporary fix on the report. |
| Needs a part | Waiting on parts | The supervisor sees it in Needs action. |
| Can't be fixed | Stays as it is | The supervisor decides the next step. |

## Who may send it

* The assigned technician, on his own job only ("This job is not yours." otherwise).
* A supervisor or admin, on any job.
* Clients never write a report. A closed job (Done or Cancelled) can not be reported again.

## What the client sees

The problem, the work and the outcome, in the technician's words, on the request. Internal notes never show.

## What the technician gets back

His record for the month (jobs done this month and in total) on Today, compared only to his own past.

## The no invention rule

The Agent fills the report only from the technician's own words. It never adds a fault, part, amount or payment.

## Checked by

* Gate tests on the report schema, the status paths and the refusals.
* e2e/walk-flows.mjs on Oct 18: Ravi starts the job, saves the report, the job is Done, and the facility manager sees Done and the report words.
