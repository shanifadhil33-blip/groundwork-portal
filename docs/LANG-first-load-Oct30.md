# Language first load fixes

Work is on `lang-load-fix`, based on `55740585`. No push, database migration or live assistant QA was run. Node was v22.23.3. Assistant and translation API calls in browser checks were mocked. Test fetch calls were blocked unless a test supplied its own mock.

## Causes and changes

Baseline references below refer to `55740585`.

`app/layout.tsx:25` always sent English HTML. `app/(app)/layout.tsx:11` then inserted a separate body language script. `components/app/translator.tsx:28` started from English without preferences, and line 172 fetched the dictionary after mounting. `components/app/greeting.tsx:24` also fell back to English while notification words were unavailable.

The root now resolves the validated `gw-lang` cookie and signed in preference, reads the static dictionary on the server and supplies plain serializable words to React. A stored preference overrides a cookie from another account. The root renders the language and direction, and the existing server language provider supplies dates. English skips the dictionary read. The shell, greeting, owner dashboard and day plan render translated React text during SSR and hydrate the same markup. Unavailable words stay hidden. The DOM Translator uses the supplied dictionary and scans later mutations before paint.

Preferences GET and PATCH, onboarding saves, demo entry and switching, the initial head script and language choices persist the cookie with path `/`, SameSite Lax and a one year lifetime. Sign out clears it. English choices write the selected English locale.

`components/app/owner-today.tsx:25` used three zero defaults before responses arrived. These are now busy placeholders. Today jobs shows an empty state only after a successful loaded response. The dashboard also distinguishes an unknown today count from a loaded zero.

`components/app/translator.tsx:127` delayed scans by 120 ms. `components/app/day-plan-card.tsx:45` rendered English independently of dictionary readiness. All direct owner and day plan strings, plus generated planning reason fragments, now have non null static translations in all 21 files. Missing words remain hidden during language changes. The coverage report was regenerated.

## Navigation investigation

Navigation APIs and component keys were searched before editing. There was no explicit language reload, redirect, router refresh or language keyed remount in the repository. The competing body setup was removed and translated React nodes are excluded from DOM mutation. The precise mechanism behind the original live second document navigation remains unproven.

A browser check against a local production build at 390 pixels with demo Imran and saved Hindi observed one dashboard document navigation, Hindi words in the response HTML, the real jobs count of 3, no sampled English greeting or card words, and no hydration errors. Choosing Urdu in Settings also kept one document navigation and applied RTL. Arabic, Urdu and English dashboard responses had the correct language and direction. Assistant and translation endpoints were mocked throughout.

## Files

Changed the root and app layouts; language cookie, head and server helpers; the new app words provider; Translator, shell, greeting, dashboard, owner overview, owner attention, owner today, day plan and price cards; preferences, onboarding, demo and sign out routes; all 21 dictionaries; the coverage report; and four test files. The existing date formatter is unchanged and receives the request language through its existing provider.

Existing test changes are deliberate: `server-language.test.tsx` no longer expects a timer to reveal untranslated content, and expects the selected English locale to be preserved. `qa-speed.test.tsx` now seeds `today_jobs: 0` explicitly because an omitted count means loading.

## Verification

`npx tsc --noEmit` and `npx next build` passed. Build traces include all 21 dictionaries.

The requested language files, coverage and copy checks, both new regression files, existing server language checks and the updated speed fixture passed: 147 tests in 7 files. The dedicated i18n configuration passed: 570 tests in 24 files.

Full suite execution used the existing `.oct29-vitest.config.mjs` override to skip the default destructive schema rebuild and migration setup, while retaining fixture seeding and blocking real fetch calls. `RUN_ASSISTANT_QA=0` stayed set. The last full run covered 251 files and 4666 tests: 4643 passed, 2 failed and 21 skipped because of a fixture timeout. Both affected files, `role-refusals` and `household`, passed together on rerun: 39 tests. The household assertion failure followed its timed out prior test. An earlier full run had timeouts in `demo-members`, `lessons` and `agent-unanswered`; all passed in the focused rerun. No unrelated timeout settings were changed. The full suite did not finish entirely green in one invocation.

Native speaker review and the original live reload mechanism remain unverified. Production deployment was not performed.

## Commit status

The sandbox marks `/workspace/portal/.git` read only. Both `git add` and `git commit` failed because Git could not create `.git/index.lock`. No commit was created and nothing was pushed. Changes remain in the workspace. The two preexisting untracked `.oct29` helper files were left unchanged.
