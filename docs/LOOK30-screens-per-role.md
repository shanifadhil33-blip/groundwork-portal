# LOOK30 Screens per role and the one main action on each

Written Oct 18 2026 from the live menu (components/app/shell.tsx) and a walk of every screen at 390 for every demo person (e2e/crawl-routes.mjs, e2e/walk-flows.mjs). Every screen also has the Agent button at the top, and the phone shows at most four tabs plus More.

## Owner (Imran in the demo)

| Screen | Main action |
|---|---|
| Company overview (big companies) | Add money in or out |
| Home (dashboard) | New job |
| All the admin screens below | Same as admin |

## Admin and supervisor (Imran, Sam)

| Screen | Main action |
|---|---|
| Home | New job |
| Jobs | Open a job (filters and search above the list) |
| Job | Edit job; status picker under it |
| Schedule | Pick a day, open a visit |
| New requests | Approve or reject an imported row |
| Suggested | Approve (also Edit then approve, Decline) |
| Team | Open a person (admin also adds people and sets roles) |
| Clients | Add a client (admin) |
| Documents | Add a document |
| Add from Excel | Choose a file |
| Parts | Order a part (demo) |
| Messages | Choose a person |
| Settings | Save |
| Memory | Edit or delete what the Agent knows |

A supervisor who also does jobs gets My day and My jobs too.

## Office staff (Nabil)

The same screens as the supervisor, with these differences: Suggested and time off show the decision as "a supervisor decides"; Team is view only; no money, roles or company settings. Main action on Home: New job, booked to the Best match person.

## Technician (Ravi)

| Screen | Main action |
|---|---|
| Today | Open the next job; Suggest a job and Request time off below |
| My jobs | Open a job |
| Job | Start, then Job report |
| Suggest a job | Send to supervisor |
| Settings | Save (language, name, voice) |
| Memory | Edit or delete what the Agent knows |

## Facility manager (Pranav)

| Screen | Main action |
|---|---|
| Home | New request |
| Requests | New request |
| Request | Approve or decline a price; confirm the visit; rate when done |
| Settings | Save |

## Client staff and household (Kevin, Faisal, Omar)

| Screen | Main action |
|---|---|
| Home | New request |
| Requests | New request |
| Request | Send a message; answer the visit check |
| Settings | Save |

Prices and visit times are for the facility manager; a household handles its own.

## Checked Oct 18

* 22 pages for 8 people at 390: no crash pages, no page errors, no sideways scroll.
* Opening another role's home now goes to the person's own home (it used to show an error page).
