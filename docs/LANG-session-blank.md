# Session / dashboard blank

## Cause

The blank frame is `PageSkeleton` (`components/ui/states.tsx`), which had no visible text and no `<main>`, only aria-hidden skeleton bars. It appears in two places:

1. **Root Suspense fallback** (`app/loading.tsx` re-exports `PageSkeleton`). The live evidence (`/workspace/qa/blank-live.txt`) has `data-session=out`, no `<main>`, 10 body children and empty `innerText`. Text was shown first and then emptied. On main, `AppShell` writes `data-session=in` in a mount effect, so `out` during the blank means the shell was not mounted at that moment. The page was in the root fallback before or while hydrating. Slow live server/DB timing explains why it happens about 1 in 7 runs live and 0 times locally.
2. **AppShell identity reload.** `load()` (exposed as `reload` from `useApp()`, called from settings, notifications, onboarding, payments and visits) set `loading=true`. The shell then replaced the *whole* screen, including any open sheet, dialog or toast host, with the brand bar plus the textless skeleton, even though a valid identity was already on screen. A failed refresh also replaced it with the full-page error. This matches "sometimes while a popup/dialog or status toast is open".

`data-session=out` is a **symptom, not a cause.** The attribute only selects which public-header links show (`app/globals.css:502-503`). A fresh browser profile whose demo was started through HTTP has no `gw-session` localStorage hint, so the head script defaults to `out` until the shell mounts.

## Fix (kept)

- `components/ui/states.tsx`: `PageSkeleton` now renders a visible `<p>Loading page</p>` through `Translated`. It is server-rendered in the saved language from the request dictionary (all 21 dictionaries have the key, e.g. hi `लोड हो रहा है…`, ar-AE `قاعدين نحمّل…`). The root fallback and every other skeleton therefore always have readable text.
- `components/app/shell.tsx`: the skeleton/error replace the screen only when there is no identity yet (`!me`). Reloads that are pending or fail keep the mounted screen, with open popups and toasts left in place. `rememberSession('in')` runs only once an identity exists. Sign out, 401 recovery (`lib/ui/api.ts` → sign-in), no-access, role redirects and demo-ended are unchanged.
- Tests: new `tests/session-blank.test.tsx` (added to `vitest.i18n.config.ts`). `tests/shell-hook-order.test.ts` and `tests/feedback-inbox.test.ts` now locate the first early return by pattern because its text changed.

## Partial edits reverted (unneeded or risky)

- `app/layout.tsx` called `getAppPageData()` in the **root** layout to stamp `data-session=in`. That runs `requireUser` plus the me/workspace/preferences/unread/dashboard DB reads on every request, public pages included, and blocks the root HTML flush on them. It is cosmetic for this bug.
- `lib/head-scripts.ts` turned a missing hint into "unknown". With no hint, `globals.css:503` hides the public Sign in / Try the demo buttons for first-time visitors until the session fetch finishes. That is a landing-page regression.
- `app/api/session/route.ts` changed to 401 for anonymous visits, which adds a console error on every anonymous public page. `components/public/static-session-header.tsx` was reworked to depend on that. Neither is related to the blank.
- The matching edits in `tests/qa-audience-session.test.tsx` and `tests/qa-history-ui.test.tsx` were reverted with them.

## Tests

- Regression check against main 886331f5's `shell.tsx` and `states.tsx` (fixed files swapped back in temporarily): `tests/session-blank.test.tsx` **3 failed / 1 passed**. Both "visible saved-language text in the root loading fallback" cases (hi, ar-AE) and "keeps the same screen mounted while identity reload is pending or fails" fail (`<main>` removed). With the fix: **4/4 pass**. The fourth case checks that the first-load error still shows.
- `pnpm tsc --noEmit`: passed.
- Full vitest: `pnpm vitest run --config .oct29-vitest.config.mjs -t '^(?!.*(?:migration rolls back|migration rollback|rollback and reapply|rollback drops the table)).*$'`. This config drops the global schema-reset/migration setup and blocks real fetch. The filter excludes the 4 tests that run migration/rollback SQL. Result: **253 files passed; 4684 tests passed, 4 skipped** (the excluded ones). Log: `/tmp/sb-full-vitest.log`.
- `pnpm vitest run --config vitest.i18n.config.ts`: **27 files, 606 tests passed**.
- `pnpm next build`: passed (`/tmp/sb-build.log`).

## Production probes (local, `BASE=http://localhost:3100`)

Server: `AUTH_TRUST_HOST=true NODE_OPTIONS="--require /tmp/gw-no-providers.cjs" pnpm next start -p 3100` (external fetches blocked, no AI provider calls). The local demo rate counter (`demo_creation_attempts`, last hour) was backed up to `/tmp/sb-rate-backup-*.json` and reset between batches with `/tmp/sb-rate-reset.mjs`. The script refuses non-local DBs. Every demo start returned 201 and every preference save 200.

| Probe | Blank runs |
| --- | --- |
| `blank-probe GL=hi N=10` | **0/10** |
| `blank-probe GL=ar-AE N=10` | **0/10** |
| `blank-probe GL=hi TH=1 CPU=4 N=4` | **0/4** |

Logs: `/tmp/sb-probe-{hi,ar,th}.log`.

`timeline-only.mjs` (with `/tmp/gw-timeline-audit.mjs` for blank frames and document requests), 5× `LANG=hi` and 5× `LANG=ar-AE`, output in `/tmp/sb-timeline-{hi,ar-AE}-{1..5}`:

- every run had 1 document request, 0 blank frames, 0 zero-jobs labels and 0 English UI words. The only Latin tokens were data: Imran, Ravi, Sam, Bilal and the site names Annex, East, Exchange, Harbor, Marina, Northgate, Pine, Terrace, West, plus WO and AED.
- hi Agent mic bar shows `सुन रहा है`, never `Listening`. Arabic shows e.g. `اليوم 3 شغل`. The raw `[0٠]\s` flag in the original script fires on Arabic dates (`10 أكتوبر`), not on job counts.
- The second `framenavigated` per run is a same-document event. There was only one document request.

Popup during load (`/tmp/sb-popup-probe.mjs`; it clicks right after the first non-empty paint, about 0.6 to 0.8 s): 5 hi + 5 ar-AE, cycling the notifications sheet, the demo switch person sheet and the Agent panel. Output in `/tmp/sb-popup-{hi,ar-AE}-{1..5}`, plus hi reruns `r1`, `r6`. Every run had 0 blanks, 1 document, the popup open at the end, 0 zero-jobs labels, and only data Latin tokens (plus Faisal in notifications). Two hi notifications runs report `clicked:false`, which is a probe artifact: the first click opened the sheet (see `/tmp/sb-popup-hi-r1/end.png`) and the retry loop then timed out on the covered bell.

Flows (`/tmp/sb-flows.mjs`, `/tmp/sb-flows.log`): anonymous `/dashboard` → `/sign-in?callbackUrl=%2Fdashboard`; session ended while open → sign-in; reload after sign-out → sign-in; expired demo → `/demo-ended`.

**Limit:** the 1-in-7 live timing was never reproduced locally (0 blanks before and after). The fix guarantees that both fallbacks that produced the observed frame now carry translated text, and that shell refreshes no longer unmount the screen. Confirm on the live site after deploy with `blank-probe.mjs`.
