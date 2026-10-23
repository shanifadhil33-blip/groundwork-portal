import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { LANGUAGES } from '../lib/languages';
import { isEnglish, rightScript, validTranslation, protectedTokens, translationPieces } from '../lib/i18n';
import { interfaceTranslation, UI_TRANSLATION_TEMPLATES } from '../lib/ui-translation-templates';
import { DEMO_ROUND_TWO_TEMPLATES } from '../lib/demo-round-two-copy';

// Offline only. English is the exact dictionary key, rather than a locale file.
export const root = path.resolve(import.meta.dirname, '..');
export const readJson = (file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
export const localeCodes = LANGUAGES.filter(l => !isEnglish(l.code)).map(l => l.code);
export const dictionaries = () => Object.fromEntries(localeCodes.map(code => [code, readJson(`public/i18n/${code}.json`)])) as Record<string, Record<string, unknown>>;
export function writeDictionaryUpdates(code: string, updates: Record<string, unknown>) {
  const file = path.join(root, 'public/i18n', `${code}.json`);
  let text = readFileSync(file, 'utf8');
  const current = JSON.parse(text), additions: string[] = [];
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [key, value] of Object.entries(updates)) {
    if (Object.hasOwn(current, key)) {
      const pattern = new RegExp(`${escape(JSON.stringify(key))}\\s*:\\s*${escape(JSON.stringify(current[key]))}`);
      if (!pattern.test(text)) throw new Error(`Cannot locate saved key: ${code}: ${key}`);
      text = text.replace(pattern, () => `${JSON.stringify(key)}:${JSON.stringify(value)}`);
    } else additions.push(`${JSON.stringify(key)}:${JSON.stringify(value)}`);
  }
  if (additions.length) text = text.slice(0, text.lastIndexOf('}')).trimEnd() + ',\n' + additions.join(',\n') + '\n}\n';
  writeFileSync(file, text);
}
const { parse } = createRequire(import.meta.url)('next/dist/compiled/babel/parser');
const templateMarkers = Object.fromEntries(UI_TRANSLATION_TEMPLATES.map((key, index) => [key, `template:${index}`]));
export function canonicalSource(source: string): string {
  const template = interfaceTranslation(source, templateMarkers);
  return template?.startsWith('template:') ? UI_TRANSLATION_TEMPLATES[Number(template.slice(9))]
    : DEMO_ROUND_TWO_TEMPLATES[source]?.key ?? source;
}
const scripts: Record<string, RegExp> = {
  'ar-AE': /\p{Script=Arabic}/u, ur: /\p{Script=Arabic}/u, ps: /\p{Script=Arabic}/u,
  'fa-AF': /\p{Script=Arabic}/u, 'fa-IR': /\p{Script=Arabic}/u,
  hi: /\p{Script=Devanagari}/u, ne: /\p{Script=Devanagari}/u, bn: /\p{Script=Bengali}/u,
  ml: /\p{Script=Malayalam}/u, ta: /\p{Script=Tamil}/u, am: /\p{Script=Ethiopic}/u,
  ti: /\p{Script=Ethiopic}/u, 'zh-CN': /\p{Script=Han}/u,
};

export function translationIssue(source: string, value: unknown, code: string): string | undefined {
  if (value === undefined) return 'missing';
  // null explicitly records a gap; it is ignored by readTranslationCache at runtime.
  if (value === null) return 'pending';
  if (!validTranslation(source, value, code)) return 'invalid';
  const words = (text: string) => protectedTokens(text).reduce((rest, token) => rest.replace(token, ''), text);
  const sourceWords = words(source), translatedWords = words(value);
  if (!rightScript(translatedWords, code)) return 'wrong script';
  const expected = scripts[code] ?? /\p{Script=Latin}/u;
  // Placeholder-only templates contain Latin placeholder names but no language text.
  if (/\p{L}/u.test(sourceWords) && !expected.test(translatedWords)) {
    // Chinese expresses this relation with punctuation rather than a word for "on".
    if (!(code === 'zh-CN' && source === '{name}: {status} on {job}.' && !/\p{L}/u.test(translatedWords))) return 'wrong script';
  }
  if (!scripts[code] && /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(translatedWords)) return 'wrong script';
  if (sourceWords.toLowerCase() === translatedWords.toLowerCase() && /\p{L}/u.test(sourceWords)) return 'English unchanged';
}

function files(dir: string): string[] {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const file = `${dir}/${entry.name}`;
    return entry.isDirectory() ? files(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
}

// Include hidden branches, error copy, option labels and accessibility attributes.
// This is conservative static discovery, not an assertion that arbitrary computed
// strings or authored records can be enumerated by parsing source code.
export function scanSource(text: string, file = 'fixture.tsx'): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const ast = parse(text, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const attributes = new Set(['label', 'placeholder', 'aria-label', 'title', 'alt', 'data-label', 'message', 'hint', 'description', 'confirmLabel', 'inputLabel', 'emptyText', 'loadingText']);
  function add(value: string, node: any) {
    for (const piece of translationPieces(value)) {
      const key = canonicalSource(piece.trim());
      if (/\p{L}/u.test(key)) found.set(key, [...(found.get(key) ?? []), `${file}:${node.loc.start.line}`]);
    }
  }
  function walk(node: any, parent?: any) {
    if (!node || typeof node !== 'object') return;
    if (['ImportDeclaration', 'ExportAllDeclaration', 'TSLiteralType', 'TSTypeAliasDeclaration', 'TSInterfaceDeclaration'].includes(node.type)) return;
    if (node.type === 'JSXAttribute' && ['className', 'href', 'src', 'style', 'key', 'id', 'type', 'name', 'value', 'role', 'download', 'data-testid'].includes(node.name.name)) return;
    if (node.type === 'JSXElement') {
      const tag = node.openingElement.name.name;
      if (['script', 'style', 'code', 'pre'].includes(tag)) return;
      if (node.openingElement.attributes.some((attr: any) => attr.name?.name === 'data-no-translate')) return;
    }
    if (node.type === 'JSXText') add(node.value.replace(/\s+/g, ' '), node);
    if (node.type === 'StringLiteral') {
      const attribute = parent?.type === 'JSXAttribute' && attributes.has(parent.name.name);
      const copy = /^[A-Z][a-z]+(?:$|[ .?!…:,’'(){}·][\s\S]*)/.test(node.value);
      // Avoid treating URLs, class names, event names and imports as copy.
      const technicalAttribute = parent?.type === 'JSXAttribute' && !attribute;
      const displayedExpression = parent?.type === 'JSXExpressionContainer';
      const copyProperty = parent?.type === 'ObjectProperty' && node === parent.value && attributes.has(parent.key.name ?? parent.key.value);
      if (attribute || displayedExpression || copyProperty || (!technicalAttribute && copy)) add(node.value, node);
    }
    if (node.type === 'TemplateLiteral') {
      const prose = node.quasis.map((part: any) => part.value.cooked ?? '').join(' ');
      const technicalAttribute = parent?.type === 'JSXAttribute' && !attributes.has(parent.name.name);
      if (!technicalAttribute && /[A-Za-z]{2,}\s|\s[A-Za-z]{2,}/.test(prose) && !/[\n`/=]|^\d|px\b|LINKPLACEHOLDER/.test(prose)) {
        let value = '';
        node.quasis.forEach((part: any, index: number) => {
          value += part.value.cooked ?? '';
          const expression = node.expressions[index];
          if (!expression) return;
          const name = expression.type === 'Identifier' ? expression.name : expression.type === 'MemberExpression' ? expression.property.name : undefined;
          value += `{${name === 'length' ? 'count' : name ?? `value${index + 1}`}}`;
        });
        add(value, node);
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'extra', 'comments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(child => walk(child, node));
      else if (value && typeof value === 'object') walk(value, node);
    }
  }
  walk(ast);
  return found;
}

export function englishSources(words = dictionaries()) {
  const exclusions = readJson('scripts/i18n/exclusions.json') as Record<string, string>;
  const sources = new Map<string, string[]>((readJson('scripts/i18n/english.json') as string[]).map(key => [key, ['English catalog']]));
  for (const [code, dictionary] of Object.entries(words)) for (const key of Object.keys(dictionary)) {
    sources.set(key, [...(sources.get(key) ?? []), `public/i18n/${code}.json`]);
  }
  for (const file of [...files('app'), ...files('components'), ...files('lib/ui')]) {
    for (const [key, locations] of scanSource(readFileSync(path.join(root, file), 'utf8'), file)) {
      sources.set(key, [...(sources.get(key) ?? []), ...locations]);
    }
  }
  for (const key of Object.keys(exclusions)) sources.delete(key);
  return new Map([...sources].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

export function coverage(words = dictionaries(), sources = englishSources(words)) {
  return localeCodes.map(code => ({ code, total: sources.size, issues: [...sources].flatMap(([source, locations]) => {
    const issue = translationIssue(source, words[code]?.[source], code);
    return issue ? [{ source, issue, locations }] : [];
  }) }));
}

export function coverageMarkdown(rows = coverage()): string {
  let recovered: { code: string; source: string }[] = [];
  try { recovered = readJson('docs/LANG01-recovered.json'); } catch { /* Audit before the first recovery. */ }
  const lines = ['# LANG01 offline interface coverage', '',
    'Generated by `node scripts/i18n-coverage.mjs --write`. No browser, AI, translation API, or database is used by the audit.', '',
    'English sources are exact keys in `scripts/i18n/english.json`, the union of shipped dictionary keys, and static copy discovered in `app`, `components`, and `lib/ui`. Explicit data/code exclusions with reasons are in `scripts/i18n/exclusions.json`. The English locale choices use source text directly.', '',
    '`null` is an explicit pending translation in a language file. It records a gap, never a usable translation: the runtime ignores it. Pending entries still appear below. A passing regression test means every discovered key is translated or acknowledged, not that every language is complete.', '',
    'The script checks placeholders and runtime validity, rejects foreign scripts and Latin-only prose for languages with another script, and flags unchanged English. Placeholder-only templates are exempt from requiring native letters. Latin-script loanwords may be flagged for review; script detection cannot establish translation accuracy.', '',
    'Static discovery includes JSX text, copy attributes/properties, readable string literals and interpolated prose (recorded as placeholder patterns). It does not execute components, enumerate arbitrary runtime values, prove dynamic templates are registered, or inspect authored job/message data. These counts are a conservative source inventory, not a replacement for the reviewer’s browser sweep.', '',
    `Recovered ${recovered.length} translations from static repository tables, local Git history, and existing labels with a colon appended; exact values and provenance are in \`docs/LANG01-recovered.json\`. Local development and test \`ui_translations\` tables were read only and empty. No translation service was called. Suspect existing values remain visible as findings below rather than being replaced with invented words.`, '',
    '| Language | Sources | Saved refills | Usable | Missing | Pending | Wrong script | Unchanged English | Invalid |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|'];
  for (const row of rows) {
    const count = (issue: string) => row.issues.filter(item => item.issue === issue).length;
    lines.push(`| ${row.code} | ${row.total} | ${recovered.filter(item => item.code === row.code).length} | ${row.total - row.issues.length} | ${count('missing')} | ${count('pending')} | ${count('wrong script')} | ${count('English unchanged')} | ${count('invalid')} |`);
  }
  lines.push('', '## Existing values needing review', '', 'These values are retained for review and are not counted as usable.', '');
  for (const row of rows) {
    for (const item of row.issues.filter(item => !['missing', 'pending'].includes(item.issue))) {
      lines.push(`- ${row.code}: ${JSON.stringify(item.source)} (${item.issue})`);
    }
  }
  lines.push('', '## Remaining source gaps', '',
    'Each key below is missing or explicitly pending in the listed language files. “All” means all 21 non-English language files. `node scripts/i18n-coverage.mjs --json` lists every finding per language, with its saved value and source locations. `--check` fails for absent or invalid entries; `--complete` also fails for pending, wrong-script, and unchanged-English values.', '');
  const grouped = new Map<string, string[]>();
  for (const row of rows) for (const { source, issue } of row.issues) if (['missing', 'pending'].includes(issue)) {
    grouped.set(source, [...(grouped.get(source) ?? []), row.code]);
  }
  for (const [source, codes] of [...grouped].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    lines.push(`- ${JSON.stringify(source)} — ${codes.length === localeCodes.length ? 'All' : codes.join(', ')}`);
  }
  return lines.join('\n') + '\n';
}
