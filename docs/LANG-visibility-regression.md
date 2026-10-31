# Translation visibility regression

Cause: `Translated` inferred pending state from unchanged text, even after the dictionary was loaded. Missing entries, identity translations, order numbers such as `WO 39`, and initials therefore became hidden ellipses. Their `data-no-translate` marker excluded them from the runtime translator, leaving no resolution path. Hindi also had null entries for Work and My home. Failed dictionary requests left the provider pending indefinitely.

Fix: only a dictionary that is still loading marks copy pending. A settled dictionary renders its translation or the original source, including options and attributes. Failed requests settle with an empty dictionary. Hindi now ships काम and मेरा घर. Dictionary translations still render in server HTML and hydrate unchanged. Existing loading counts and language changes without navigation remain covered.

Files: `components/app/app-words.tsx`, `public/i18n/hi.json`, `tests/server-language-first-load.test.tsx`, and regenerated `docs/LANG01-coverage.md`.

Validation: TypeScript and production build pass. Focused tests: 43 passed. Default suite: 4672 passed across 251 files. Localization suite: 576 passed across 24 files. Six added regression cases cover missing entries, pending null entries, codes, initials, identity translations, options, attributes, successful and failed dictionary requests, and Hindi mode labels on the first paint.

The default suite used its default configuration and existing local test schema. Its setup was temporarily changed to omit schema recreation and migration calls, then restored byte for byte. No migrations ran. Validation used RUN_ASSISTANT_QA=0, empty provider credentials, and a preload that blocks external fetches.

Browser verification is blocked: `next start -p 3100` failed with EADDRINUSE. An existing listener is outside the shell process namespace and cannot be stopped from this sandbox. The user has been asked to free port 3100. The stuck probe and Hindi and Arabic timelines have no valid result against this build yet. The initial probe attempt against the occupied port was cancelled and is not validation evidence. No replacement server has been started successfully.

Logs: `/tmp/lang-focused.log`, `/tmp/lang-full.log`, `/tmp/lang-i18n.log`, `/tmp/lang-tsc.log`, `/tmp/lang-build.log`, and `/tmp/lang-server.log`.
