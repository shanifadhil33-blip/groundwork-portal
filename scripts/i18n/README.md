# Offline language coverage

English text is the dictionary key. `english.json` retains the source inventory,
including keys that could otherwise disappear from every locale. The audit also
discovers new keys in any language file and static copy/patterns in app source.
`exclusions.json` contains exact data/code exemptions with reasons.

```sh
node scripts/i18n-coverage.mjs --write    # refresh docs/LANG01-coverage.md
node scripts/i18n-coverage.mjs --json     # every gap/value/location per language
node scripts/i18n-coverage.mjs --check    # fail on absent or invalid entries
node scripts/i18n-coverage.mjs --complete # fail on any unresolved finding
npm run test:i18n                       # unit/render tests; no DB setup/migrations
npm run typecheck
```

A new key must have a nonempty translation or explicit `null` pending marker in
every non-English language file. Null is ignored by the runtime, remains a gap in
the report, and cannot override saved words in the exporter. It does not prevent
runtime fallback/AI for that unresolved text. Passing tests acknowledge the gaps;
they do not certify complete translation coverage.

When intentionally accepting gaps, run
`node scripts/i18n-coverage.mjs --mark-pending --update-source --write` and review
the source inventory, exclusions and every new marker. The default audit and tests
never add markers automatically. Source scanning is conservative: arbitrary runtime
values still need browser review, and newly discovered interpolation patterns may
also need registration in the runtime template code.

`node scripts/i18n-recover.mjs --history` previews exact saved translations from
static repository tables and local Git history. Add `--apply` to write them and
record provenance in `docs/LANG01-recovered.json`. It can also reuse an existing
label verbatim with a colon; it never composes new words, contacts a translation
service, queries a database, or changes an already valid translation. The existing
browser exporter is separate and must only be run when a local browser check is
authorized.

For this pass, the local development and test translation tables were empty.
Unrecoverable and suspect words remain listed in the coverage report. No live
verification, push, deployment, or migration was performed.
