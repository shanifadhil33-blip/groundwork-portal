import { register } from 'tsx/esm/api';
import { writeFileSync } from 'node:fs';
register();
const { coverage, coverageMarkdown, dictionaries, englishSources, writeDictionaryUpdates, localeCodes } = await import('./i18n-coverage-core.ts');
if (process.argv.includes('--mark-pending')) {
  const words = dictionaries(), sources = englishSources(words);
  for (const code of localeCodes) writeDictionaryUpdates(code, Object.fromEntries([...sources.keys()].filter(key => !Object.hasOwn(words[code], key)).map(key => [key, null])));
}
if (process.argv.includes('--update-source')) writeFileSync(new URL('./i18n/english.json', import.meta.url), JSON.stringify([...englishSources().keys()], null, 2) + '\n');
const rows = coverage();
if (process.argv.includes('--write')) writeFileSync(new URL('../docs/LANG01-coverage.md', import.meta.url), coverageMarkdown(rows));
if (process.argv.includes('--json')) {
  const words = dictionaries();
  console.log(JSON.stringify(rows.map(row => ({ ...row, issues: row.issues.map(item => ({ ...item, value: words[row.code][item.source] })) })), null, 2));
} else {
  for (const row of rows) console.log(`${row.code}: ${row.total - row.issues.length}/${row.total} usable, ${row.issues.length} gaps`);
}
// Pending is acknowledged, but never success for the stricter completion audit.
if (process.argv.includes('--check') && rows.some(row => row.issues.some(item => ['missing', 'invalid'].includes(item.issue)))) process.exitCode = 1;
if (process.argv.includes('--complete') && rows.some(row => row.issues.length)) process.exitCode = 1;
