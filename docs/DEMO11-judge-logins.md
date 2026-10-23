# DEMO11 Judge logins

## Audit before changes

Checked the public demo page, `components/public/demo-picker.tsx`, `tests/demo-controls.test.ts`, `lib/services/demo.ts`, `lib/fixture.ts`, `lib/fixture-dune-harbour.ts` and the role home routes.

| User type | Existing public one click login | Finding |
| --- | --- | --- |
| Owner | Imran, but labelled Admin | The fixture gives Imran `is_owner=true`. The Owner label is missing. |
| Admin | Imran, labelled Admin | No separate admin without ownership. |
| Supervisor | Sam | Present. |
| Technician | Ravi | Present. Initially opens `/dashboard`, then the shell sends him to `/today`. |
| Office staff | Nabil | Present. |
| Facility manager | Pranav and Omar | Present. |
| Facility staff | Kevin | Present. |
| Household | Faisal | Present. |

The existing coverage test expects only seven labels and does not test each login session or its home. `DUNE_PERSONAS` contains all 13 people in the Dune Harbour fixture, including Owner Imran. Dune Harbour has no separate Admin and is hidden behind `DEMO_DUNE_HARBOUR`; it is not a public judge login list. Its flag and cast stay as they are.

## Changes

Imran is labelled Owner. Hassan is a separate Admin, created only inside the visitor's Ridgeline demo sandbox. Both use the existing password free demo session flow. No real account, invitation, sign in code or external account is created. There is no database migration.

| User type | Button name | Home |
| --- | --- | --- |
| Owner | Imran | `/dashboard` |
| Admin | Hassan | `/dashboard` |
| Supervisor | Sam | `/dashboard` |
| Technician | Ravi | `/today` |
| Office staff | Nabil | `/dashboard` |
| Facility manager | Pranav or Omar | `/home` |
| Facility staff | Kevin | `/home` |
| Household | Faisal | `/home` |

The existing Ridgeline workspace uses the standard dashboard. The optional Company overview remains subject to the existing company size and dashboard settings.

The public login uses the viewer's saved language, or a supported browser language on a first visit, with English as the fallback. The language is validated on the server and saved to the selected sandbox person before the home loads. Switching person carries the current language; resetting keeps it. The existing app translator supplies the home in that language, including Gulf Arabic and its right to left layout.

Each visitor keeps a private sandbox that expires after six hours. Existing session rotation, reuse, cleanup and separation from real accounts remain in force.

## Local checks

Coverage exercises all nine public buttons representing eight user types, their actual session identities and membership roles, their home targets, English and Gulf Arabic preferences, switching, reset and sandbox separation. Typecheck and the full test suite are run locally. Live checks, pushing and deployment belong to the reviewer.
