# LANG12 local sweep

The later [LANG01 offline source inventory](LANG01-coverage.md) records dictionary gaps beyond these swept screens, including explicit pending translations in every language file. Its source-wide counts and script findings should be reviewed alongside this historical browser result.

**Round 2: clean local sweep.** Every remaining visible line from the round 1 report has been addressed in all app languages. The final browser sweep reports zero untranslated text fragments, accessibility attributes, RTL failures, overflow failures, and navigation errors for all nine personas.

Browser scope: fresh mobile contexts at 360×844 in Gulf Arabic (`ar-AE`), followed by concurrent Arabic and English sessions viewing the same job. Static dictionary and rendered-screen regressions cover all 24 app locale choices, including the 21 non-English language files. Browser translation API responses were stubbed to an empty dictionary, so missing shipped words could not be rescued by runtime translation.

Verification used only `http://127.0.0.1:3000` and local Postgres. No push, deployment, live verification, or new migration.

## Before and after

Round 1 counts are from `9597ccf8`. Counts include repeated visible fragments across screens. Attributes include placeholders, aria labels, titles and alt text.

| Persona | Round 1 Latin | Round 1 attributes | Round 2 screens | Round 2 Latin | Round 2 attributes | RTL failures | Overflow failures | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| imran | 57 | 30 | 39 | 0 | 0 | 0 | 0 | 0 |
| hassan | 76 | 32 | 39 | 0 | 0 | 0 | 0 | 0 |
| sam | 118 | 34 | 37 | 0 | 0 | 0 | 0 | 0 |
| ravi | 10 | 2 | 25 | 0 | 0 | 0 | 0 | 0 |
| pranav | 45 | 2 | 23 | 0 | 0 | 0 | 0 | 0 |
| faisal | 14 | 2 | 23 | 0 | 0 | 0 | 0 | 0 |
| omar | 28 | 2 | 23 | 0 | 0 | 0 | 0 | 0 |
| nabil | 49 | 28 | 36 | 0 | 0 | 0 | 0 | 0 |
| kevin | 26 | 2 | 23 | 0 | 0 | 0 | 0 | 0 |

Total: 268 captured screens. Role-denied routes are recorded separately from navigation errors.

The scanner now applies complete filename, timezone and email exemptions before shorter name tokens can consume part of them. It also exempts exact sample addresses and editable textarea values, as allowed by the task. Editable controls still have their accessibility attributes checked. Regression tests verify that English interface words surrounding names or identifiers remain findings.

## Changes completed

- Extended the exact demo allowlist to seeded suggestions, preferred visit windows, messages, document titles, site and contract notes, equipment names and locations, work reports, and Agent vocabulary. Numbered or named instances expand from data-free templates through the existing demo translation mechanism. Real authored records and editable values stay protected.
- Added structured audit templates for jobs, assignments, schedules, due dates, roles, clients/sites/workspaces, comments, supplier orders/delivery events, and imports. Legacy Agent priority summaries use templates with separate job identifiers and priority values. System actors and item labels now translate as interface text.
- Completed import/help, navigation, client/team/leave and diagnostic copy in every language file. Accessibility templates cover team counts, request counts, row selection, moving jobs, calls, leave removal and undo attribution. Arabic uses Gulf wording and الوكيل for Agent.
- Schedule clocks, day labels and scheduling hints follow the viewer's locale through Intl, including the three English locales. The lazy date picker also uses the viewer's language. Audit due dates remain calendar dates without an invented clock time. The unassigned job-card label translates while assignee names remain data.
- Replaced real sleeps in screen tests with deterministic advancement of the Translator timers, retaining the static-only and authored-text assertions. The two-fixture demo isolation test retains all cross-visitor, real-account and cross-workspace RLS assertions with a 30-second allowance.
- Made local HTTP sandbox cookies follow the URL scheme, so repeated sweeps reuse the same fixture. Route capture waits for network idle before the translation debounce window. Development-only overlays are hidden during the local scan.

## Local validation

- `npm run typecheck`: passed.
- Focused localization, dictionary, scanner, rendered-screen and audit checks: 275 passed.
- `npm test`: 4367 passed, 4 failed out of 4371 tests. Only the four known D1 failures remain: two in `tests/demo-proof.test.ts` and two in `tests/technician-ratings.test.ts`. No demo isolation or Hindi screen timeout recurred.
- `node e2e/lang12-sweep.mjs --out=/tmp/lang12-round2-final.json`: passed for all nine personas, including same-job language isolation.
- Local HTTP sandbox reuse: passed.

## Same-job language isolation

```json
{
  "sameJob": true,
  "differentUsers": true,
  "arabic": {
    "lang": "ar-AE",
    "dir": "rtl",
    "heading": "اضبط تبريد غرفة الاجتماعات"
  },
  "english": {
    "lang": "en-IN",
    "dir": "ltr",
    "heading": "Adjust meeting room cooling"
  },
  "preferences": [
    "ar-AE",
    "en-IN"
  ]
}
```

## Final output: remaining visible lines

None in the swept screens, for every persona in the table. No accessibility attributes remain untranslated in those captures.

Names, addresses, emails, filenames such as `sample.csv`, time zone IDs, identifiers and the Groundwork brand remain data exemptions. Editable values remain as entered. Expected role-denied routes remain restricted. The four known D1 test failures are recorded above.

## Reproduce locally

Start the app with `npm run dev -- --hostname 127.0.0.1`, then run:

```sh
node e2e/lang12-sweep.mjs --out=/tmp/lang12-round2-final.json
npm run typecheck
npm test
```

The sweep rejects non-local hosts and exits nonzero for remaining Latin interface text, accessibility leaks, RTL/overflow failures, or navigation errors. Its sandbox token stays in a mode-0600 temporary file and is never printed or committed. The full test command exits nonzero for the four known D1 failures.
