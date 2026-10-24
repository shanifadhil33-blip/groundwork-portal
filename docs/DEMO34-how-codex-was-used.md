# DEMO34: How Codex was used

**DRAFT pending owner review by Adhil.** This note uses the repository history, the docs folder and local test results. Adhil should check it before it becomes a public account of the work.

## Planning and small requests

[The plan](PLAN.md) records Adhil's approval of a maintenance company portal with client requests, spreadsheet import and approval, and a way to find and repair missed supplier updates. [The Codex brief](BRIEF.md) turns that plan into instructions for a bounded piece of work. It starts with the server and database, leaves screen work for later, requires tests and asks for a clear commit after each batch.

The history shows work broken into milestones, screen batches and later named features. [The checklist note](JOB24-checklists.md) and [the price change note](JOB25-quotes.md) describe separate work on saved records, screens, the in app Agent and review fixes. This supports an account of handing Codex small requests within a larger human plan. The repository does not contain a complete prompt transcript, so it cannot establish the exact wording, length or total number of prompts.

## What people decided

Adhil approved the product and set its boundaries. The plan records his instruction to finish and check the server work before starting the screens. He chose the database and sign in approach, asked for a serious neutral look, changed the fictional Larkspur name to remove medical hints and dropped the clinic demo and a separate memory agent from that plan.

The plan calls Groundwork a working name and leaves the final name and scenario as questions for Adhil. It does not prove that Codex chose the final product name. [The demo coverage note](DEMO10-coverage.md) records a fixed male cast and explicit limits on what sample history and documents were added. The recorded names and scope constrained the work.

Some commit messages explicitly credit Codex and record review by Abu. That records human review for those changes. The repository does not measure how much of the whole project either person wrote.

## Review and tests

The brief requires a typecheck and the full test suite before finishing each batch, plus a record of what changed, how it was checked and what remained open. The checklist and price change notes record full suite runs, review fixes and a handoff to a reviewer. This is evidence of the required process and recorded examples; it is not proof that every historical chunk followed it without exception.

Recorded results show how the suite grew. The checklist note reports 3717 passing and 4 failing tests out of 3721. The price change note reports 3791 passing and 4 failing out of 3795. The demo coverage note reports 4495 passing and 4 failing out of 4499 across 245 files. Each note identifies the remaining failures as existing database access rule checks in `tests/demo-proof.test.ts` and `tests/technician-ratings.test.ts`. These are recorded results from those documents, not fresh runs of old versions.

The intended account for Adhil to confirm is that each chunk received the full suite locally and a live check after each push. [The permission note](ROLE20-permissions.md) records live walks through roles and screens, and [the judge script](DEMO16-judge-test-script.md) gives checks a reviewer can repeat. The checklist and price change notes explicitly leave live checks to the reviewer. The repository does not prove that a live check followed every push. Adhil should confirm that frequency before the draft states it as a completed practice.

For this documentation change, the local typecheck passed. The full local suite ran 4499 tests across 245 files: 4495 passed and 4 failed. The failures were in the same files named above, so the full suite did not pass. Live checks are left to the reviewer. This run does not push or deploy.

## Full git history and main

Before this draft, at commit `8264289e`, the checked out history contained 510 commits, dated 9 October 2026 through 24 October 2026. The saved copy of `origin/main` contained the same 510 commits, with 0 commits unique to either it or the checked out history. Git reports that this is a complete history download, so the earlier commits remain available to read.

This supports saying that the full available git history is kept on main, using the saved copy of `origin/main` as the evidence. The local branch named `main` is older: it contains 58 commits and ends on 11 October 2026. The checked out branch is `tech-ops`. These observations use locally saved history only; they do not check the current server state or prove that history has never been rewritten.

The counts above describe the history before this documentation commit. This draft is added as a separate local commit for the reviewer to push.

## Examples from the history

These are selected commit messages, grouped by the work they describe. They show steps in the work. They do not count prompts or establish authorship. The original wording is kept in the quotations.

Planning: `da6e4ad9`, “Docs: plan and backend brief”.

Server and saved records: `f03417ee`, “Milestone 3: spreadsheet import, validation, approval queue, AI drafts”; `a0408834`, “Milestone 5: audit log API, notifications management, settings and preferences”.

Screens: `c5370a72`, “Frontend batch 2: dashboard, work orders list/detail/forms, comments, timeline, clients and team”; `b878d5b4`, “Frontend batch 4: spreadsheet import, mapping, validation preview, approval queue, AI drafts UI”.

In app Agent: `7f48da9d`, “Add confirmed agent checklist ticks and material records”; `bcc053a2`, “feat(learn16): manage company lessons and refresh Agent memory”.

Languages: `8f996630`, “feat(demo): translate exact Dune Harbour fixture copy in Arabic”; `5666d10e`, “Record clean LANG12 round two local sweep”.

Demo: `cd08a7d0`, “feat(demo): seed six months of Dune Harbour service history”; `1222baf2`, “feat(demo): seed Dune SAMPLE documents and past Agent decisions”.

Privacy: `f8312498`, “feat(privacy): enforce retention cleanup and document data lifecycle”; `4b40d7a9`, “fix(privacy): render notice in saved Arabic language”.

Review handoffs: `c8a359fc`, “Record JOB24 local verification and reviewer release handoff”; `9d2600ee`, “docs: record JOB25 local verification and reviewer handoff”.

## Commands used for the evidence

These commands were run from the repository folder. Numbers in commit messages and file names are copied identifiers, not new measurements. Command text and file names retain their original spelling.

History and example messages:

```sh
git rev-parse HEAD
git rev-list --count HEAD
git log --reverse --format=%ad --date=short HEAD | sed -n '1p;$p'
git rev-parse --is-shallow-repository
git rev-list --count origin/main
git rev-list --count origin/main..HEAD
git rev-list --count HEAD..origin/main
git rev-list --count main
git log -1 --format=%ad --date=short main
git branch --show-current
git show -s --format='%h %s' da6e4ad9 f03417ee a0408834 c5370a72 b878d5b4 7f48da9d bcc053a2 8f996630 5666d10e cd08a7d0 1222baf2 f8312498 4b40d7a9 9d2600ee c8a359fc
git log --format='%h %s' --grep='Codex, reviewed by Abu' -n 1
```

Written plans, recorded results and reviewer instructions:

```sh
cat docs/BRIEF.md
cat docs/PLAN.md
cat docs/DEMO10-coverage.md
cat docs/ROLE20-permissions.md
cat docs/DEMO16-judge-test-script.md
sed -n '25,31p' docs/JOB24-checklists.md
sed -n '27,31p' docs/JOB25-quotes.md
sed -n '40,48p' docs/DEMO10-coverage.md
```

Local checks for this draft:

```sh
npm run typecheck
npm test
```
