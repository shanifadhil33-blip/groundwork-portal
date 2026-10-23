// Restore exact saved translations only; never invokes the app or a translator.
// Default is a dry run. --apply writes files; --history also searches local Git.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { register } from 'tsx/esm/api';
register();
const { dictionaries, englishSources, translationIssue, localeCodes, root, writeDictionaryUpdates } = await import('./i18n-coverage-core.ts');
const { parse } = createRequire(import.meta.url)('next/dist/compiled/babel/parser');
const words = dictionaries(), sources = englishSources(words), recovered = [];
function savedLocale(object, code) {
  if (Object.hasOwn(object, code)) return object[code];
  const base = code.split('-')[0];
  // Only an unambiguous app language: ar → ar-AE, sw → sw-KE, zh → zh-CN.
  // Never reuse generic fa for both Dari and Farsi.
  return localeCodes.filter(locale => locale.split('-')[0] === base).length === 1 ? object[base] : undefined;
}
function offer(code, source, value, origin) {
  if (!localeCodes.includes(code) || !sources.has(source) || !translationIssue(source, words[code][source], code)) return;
  if (translationIssue(source, value, code)) return;
  words[code][source] = value;
  recovered.push({ code, source, value, origin });
}
function table(object, origin) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return;
  for (const [key, value] of Object.entries(object)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Both {English source: {locale: translation}} and {locale: {source: translation}}.
      for (const [nestedKey, translated] of Object.entries(value)) {
        if (typeof translated === 'string') {
          offer(nestedKey, key, translated, origin);
          offer(key, nestedKey, translated, origin);
        }
      }
      table(value, origin);
    }
  }
  // Saved localized tables with their own English source, such as {en: 'Save', hi: '…'}.
  const english = object.en ?? object['en-IN'] ?? object['en-US'] ?? object['en-GB'];
  if (typeof english === 'string') for (const code of localeCodes) offer(code, english, savedLocale(object, code), origin);
  // Tables may use semantic identifiers shared by the English and locale rows.
  if (english && typeof english === 'object' && !Array.isArray(english)) {
    for (const [key, source] of Object.entries(english)) if (typeof source === 'string') {
      for (const code of localeCodes) offer(code, source, savedLocale(object, code)?.[key], origin);
    }
  }
}
function literal(node) {
  if (node?.type === 'StringLiteral') return node.value;
  if (['TSAsExpression', 'TSSatisfiesExpression'].includes(node?.type)) return literal(node.expression);
  if (node?.type !== 'ObjectExpression') return undefined;
  return Object.fromEntries(node.properties.filter(p => p.type === 'ObjectProperty' && !p.computed)
    .map(p => [p.key.name ?? p.key.value, literal(p.value)]));
}
function scan(node, file) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'ObjectExpression') table(literal(node), `${file}:${node.loc.start.line}`);
  for (const [key, child] of Object.entries(node)) {
    if (['loc', 'extra', 'comments'].includes(key)) continue;
    if (Array.isArray(child)) child.forEach(value => scan(value, file));
    else if (child && typeof child === 'object') scan(child, file);
  }
}
function walk(dir) {
  for (const entry of readdirSync(`${root}/${dir}`, { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.json')) table(JSON.parse(readFileSync(`${root}/${file}`, 'utf8')), file);
    else if (/\.tsx?$/.test(file)) scan(parse(readFileSync(`${root}/${file}`, 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] }), file);
  }
}
walk('lib');
// Reuse an already saved label verbatim when only its colon is missing.
// This adds punctuation, never new words or a guessed translation.
for (const code of localeCodes) for (const source of sources.keys()) {
  if (source.endsWith(':')) {
    const label = source.slice(0, -1), saved = words[code][label];
    if (typeof saved === 'string') offer(code, source, saved + (code === 'zh-CN' ? '：' : ':'), `public/i18n/${code}.json:${label} (saved label plus colon)`);
  }
}
if (process.argv.includes('--history')) {
  const commits = execFileSync('git', ['log', '--format=%H', '--', 'public/i18n'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  for (const commit of commits) {
    // Newest valid value wins. Restrict this to files that actually changed.
    const files = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', commit, '--', 'public/i18n'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
    for (const file of files) {
      const code = file.match(/^public\/i18n\/(.+)\.json$/)?.[1];
      if (!localeCodes.includes(code)) continue;
      let saved;
      try { saved = JSON.parse(execFileSync('git', ['show', `${commit}:${file}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch { continue; }
      for (const [source, value] of Object.entries(saved)) offer(code, source, value, `${commit}:${file}`);
    }
  }
}
if (process.argv.includes('--apply')) {
  for (const code of new Set(recovered.map(item => item.code))) {
    writeDictionaryUpdates(code, Object.fromEntries(recovered.filter(item => item.code === code).map(item => [item.source, item.value])));
  }
  let previous = [];
  try { previous = JSON.parse(readFileSync(`${root}/docs/LANG01-recovered.json`, 'utf8')); } catch { /* First recovery. */ }
  const manifest = new Map([...previous, ...recovered].map(item => [`${item.code}:${item.source}`, item]));
  writeFileSync(`${root}/docs/LANG01-recovered.json`, JSON.stringify([...manifest.values()], null, 2) + '\n');
}
console.log(JSON.stringify(recovered, null, 2));
