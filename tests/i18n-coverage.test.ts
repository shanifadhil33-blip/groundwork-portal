import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { coverage, coverageMarkdown, dictionaries, englishSources, localeCodes, scanSource, translationIssue } from '../scripts/i18n-coverage-core';
import { readTranslationCache } from '../lib/i18n';
import { choiceWords } from '../lib/agent/choices';
import { notificationWords } from '../lib/notification-words';

it('every English interface key has a string entry or an explicit null pending marker in every language file', () => {
  const words = dictionaries();
  const sources = englishSources(words);
  const failures: string[] = [];
  for (const code of localeCodes) for (const source of sources.keys()) {
    if (!Object.hasOwn(words[code], source)) failures.push(`${code}: missing ${JSON.stringify(source)}`);
    else if (words[code][source] !== null && (typeof words[code][source] !== 'string' || !(words[code][source] as string).trim())) {
      failures.push(`${code}: invalid entry ${JSON.stringify(source)}`);
    }
  }
  expect(failures, 'Add saved translations or an explicit null pending marker, then regenerate docs/LANG01-coverage.md.').toEqual([]);
});

it('detects a new key even if it is added to only one language file', () => {
  const words = dictionaries();
  words['ar-AE']['A new interface key for coverage'] = 'نص';
  const sources = englishSources(words);
  const rows = coverage(words, sources);
  expect(rows.find(row => row.code === 'hi')?.issues).toContainEqual(expect.objectContaining({ source: 'A new interface key for coverage', issue: 'missing' }));
});

it('discovers new screen copy, attributes, branches, options, and interpolation without a dictionary entry', () => {
  const keys = scanSource(`
    import { Thing } from './thing';
    const options = [{label: 'new choice'}];
    const hidden = 'Hidden error message';
    export function Example() { return <>
      <h1>New screen heading</h1><input placeholder="new hint" aria-label="new accessible name" />
      {failed ? 'New error' : 'New success'}{'lowercase text'}
      <button title={\`New action for \${name}\`}>New action</button>
      <p data-no-translate>Private customer words</p><code>Technical code</code>
      <div className={\`some class \${value}\`} />
    </>; }
  `);
  for (const key of ['new choice', 'Hidden error message', 'New screen heading', 'new hint', 'new accessible name', 'New error', 'New success', 'lowercase text', 'New action for {name}', 'New action']) expect(keys.has(key), key).toBe(true);
  for (const key of ['./thing', 'Private customer words', 'Technical code', 'some class {value}']) expect(keys.has(key), key).toBe(false);
});

it('skips font fallback configuration while still discovering displayed font names', () => {
  expect(scanSource(readFileSync('app/page.tsx', 'utf8')).has('Times New Roman')).toBe(false);
  expect(scanSource(`const font = localFont({ adjustFontFallback: 'Times New Roman' });`).size).toBe(0);
  expect(scanSource(`const font = localFont({ 'adjustFontFallback': 'Times New Roman' });`).size).toBe(0);
  expect(scanSource(`const label = <span>Times New Roman</span>;`).has('Times New Roman')).toBe(true);
});

it('checks scripts beyond the permissive runtime Latin allowance, while preserving template placeholders', () => {
  expect(translationIssue('Save', 'Save', 'hi')).toBe('wrong script');
  expect(translationIssue('Save', 'सहेजें', 'ml')).toBe('wrong script');
  expect(translationIssue('Privacy', '隐私', 'fil')).toBe('wrong script');
  expect(translationIssue('Save', 'Save', 'fil')).toBe('English unchanged');
  expect(translationIssue('Save {name}', 'حفظ {name}', 'ar-AE')).toBeUndefined();
  expect(translationIssue('{first}, {second}', '{first}, {second}', 'hi')).toBeUndefined();
  expect(translationIssue('Save {name}', 'حفظ', 'ar-AE')).toBe('invalid');
});

it('keeps pending markers visible as gaps and out of the runtime translation cache', () => {
  expect(translationIssue('Save', null, 'hi')).toBe('pending');
  expect(translationIssue('Save', undefined, 'hi')).toBe('missing');
  expect(readTranslationCache(JSON.stringify({ Save: null, Cancel: 'रद्द करें' }), 'hi')).toEqual({ Cancel: 'रद्द करें' });
});

it('keeps pending entries out of server choice and notification lookups', () => {
  const words = dictionaries();
  for (const code of localeCodes) {
    const pending = Object.keys(words[code]).find(key => words[code][key] === null);
    if (!pending) continue;
    expect(choiceWords(code)(pending)).toBe(pending);
    expect(Object.hasOwn(notificationWords(code), pending)).toBe(false);
  }
});

it('keeps the committed per-language coverage report reproducible and current', () => {
  expect(readFileSync('docs/LANG01-coverage.md', 'utf8')).toBe(coverageMarkdown());
});

it('keeps recovered translations consistent with their recorded saved values', () => {
  const words = dictionaries();
  const records = JSON.parse(readFileSync('docs/LANG01-recovered.json', 'utf8')) as { code: string; source: string; value: string; origin: string }[];
  for (const record of records) {
    expect(record.origin, `${record.code}: ${record.source}`).toBeTruthy();
    expect(words[record.code][record.source]).toBe(record.value);
    expect(translationIssue(record.source, record.value, record.code)).toBeUndefined();
  }
});
