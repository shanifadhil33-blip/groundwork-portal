import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAME_JOIN } from '../lib/ui/name-joins';
import { LANGUAGES } from '../lib/languages';
import { isEnglish, languageFileUrl, mergeLanguageFile, rightScript, translationSource, validTranslation } from '../lib/i18n';
import { KEEP_AS_IS } from '../lib/services/translations';

// LANG01: interface text lives in one language file per language.
const dir = path.join(__dirname, '..', 'public', 'i18n');
const others = LANGUAGES.filter(l => !isEnglish(l.code));
const read = (code: string) => JSON.parse(fs.readFileSync(path.join(dir, `${code}.json`), 'utf8')) as Record<string, unknown>;

describe('language files', () => {
  it('there is one file for every language except English, and no other files', () => {
    expect(fs.readdirSync(dir).sort()).toEqual(others.map(l => `${l.code}.json`).sort());
  });
  it.each(others.map(l => [l.code]))('%s: every word is interface text with a valid translation', code => {
    const file = read(code);
    const entries = Object.entries(file);
    expect(entries.filter(([, value]) => value !== null).length).toBeGreaterThan(500);
    for (const [source, translated] of entries) {
      expect(translationSource(source), source).toBe(source);
      // LANG01: null explicitly records an untranslated source; never a usable word.
      if (translated === null) continue;
      expect(validTranslation(source, translated, code), `${code}: ${source}`).toBe(true);
      // A punctuation-only template can be identical in locales that use the Latin comma.
      if (source !== NAME_JOIN) expect(translated, `${code}: ${source} is still English`).not.toBe(source);
      // No demo names, places, amounts or codes: those are data, not interface text.
      // Interface limits/expiry wording can contain numbers, which validTranslation preserves.
      expect(source).not.toMatch(/Imran|Ravi|Pranav|Harbor|Northgate|COBALT|AED|Dubai|Sharjah/);
    }
    for (const word of KEEP_AS_IS) expect(Object.hasOwn(file, word)).toBe(false);
  });
  it('right to left languages are written in their own script', () => {
    for (const l of others.filter(x => x.rtl)) expect(read(l.code)['Save']).toMatch(/[\u0600-\u06FF]/);
  });
  it('the file path is the language code', () => {
    expect(languageFileUrl('ar-AE')).toBe('/i18n/ar-AE.json');
    expect(languageFileUrl('fa-AF')).toBe('/i18n/fa-AF.json');
  });
});

describe('mergeLanguageFile', () => {
  it('adds the file words and the file wins over a saved machine word', () => {
    const cache: Record<string, string> = { Save: 'old', Cancel: 'إلغاء' };
    const changed = mergeLanguageFile(cache, JSON.stringify({ Save: 'حفظ', Cancel: 'إلغاء', 'Sign out': 'تسجيل الخروج' }), 'ar-AE');
    expect(changed).toBe(2);
    expect(cache).toEqual({ Save: 'حفظ', Cancel: 'إلغاء', 'Sign out': 'تسجيل الخروج' });
  });
  it('drops words that fail the translation checks', () => {
    const cache: Record<string, string> = {};
    // A lost number, a dash in prose and an empty value are refused; the good one stays.
    mergeLanguageFile(cache, JSON.stringify({ 'Job 12 is late': 'الوظيفة متأخرة', 'Save': 'حفظ — الآن', 'Open': '', 'Done': 'تم' }), 'ar-AE');
    expect(cache).toEqual({ Done: 'تم' });
  });
  it('a broken or missing file changes nothing', () => {
    const cache: Record<string, string> = { Save: 'حفظ' };
    expect(mergeLanguageFile(cache, '{not json', 'ar-AE')).toBe(0);
    expect(mergeLanguageFile(cache, null, 'ar-AE')).toBe(0);
    expect(mergeLanguageFile(cache, '[1,2]', 'ar-AE')).toBe(0);
    expect(cache).toEqual({ Save: 'حفظ' });
  });
  it('English never loads a file', () => {
    const cache: Record<string, string> = {};
    expect(mergeLanguageFile(cache, JSON.stringify({ Save: 'Keep' }), 'en-GB')).toBe(0);
    expect(cache).toEqual({});
  });
});

describe('translator order', () => {
  it('the language file is read before any saved word or AI request', () => {
    const src = fs.readFileSync('components/app/translator.tsx', 'utf8');
    expect(src).toContain('fetch(languageFileUrl(language)');
    const flush = src.slice(src.indexOf('async function flush()'), src.indexOf('async function flushAi()'));
    expect(flush.indexOf('await fileReady')).toBeGreaterThan(-1);
    expect(flush.indexOf('await fileReady')).toBeLessThan(flush.indexOf('ask(strings, true)'));
  });
});

// These card labels must be available offline without an AI translation request.
it.each(others.map(l=>[l.code]))('%s translates every assistant confirmation card label',code=>{
 const file=read(code);
 for(const key of ['Confirm this change','New request','Not given','Your home','Where','Since','Photos','Visit charge','(Sample price)','The office will confirm the price.','Why:','Yes','Change','Applying your confirmed change…']){
  expect(file[key],`${code}: ${key}`).toBeTruthy();expect(file[key]).not.toBe(key);expect(file[key]).not.toMatch(/\p{Pd}/u);
 }
});

// Recovery messages must work offline when the assistant or voice request times out.
it.each(others.map(l=>[l.code]))('%s translates assistant recovery messages offline',code=>{
 const file=read(code);
 for(const key of [
  'The assistant is taking too long right now. Please try again in a minute.',
  'We could not hear your message in time. Please try again or type it.',
  'You have sent a lot of requests. Please wait a minute and try again.',
 ]){
  expect(typeof file[key]).toBe('string');
  expect(validTranslation(key,file[key],code),`${code}: ${key}`).toBe(true);
  expect(file[key]).not.toBe(key);expect(file[key]).not.toMatch(/\p{Pd}/u);
 }
});
it.each(others.map(l=>[l.code]))('%s translates Work, My home and Dashboard offline', code=>{
 const file=read(code);
 for(const key of ['Work','My home','Dashboard']){
  const value=file[key];
  expect(typeof value, `${code}: ${key}`).toBe('string');
  if(typeof value!=='string') continue;
  expect(validTranslation(key, value, code), `${code}: ${key}`).toBe(true);
  expect(value).not.toBe(key);
  expect(value).not.toMatch(/\p{Pd}/u);
  expect(rightScript(value, code), `${code}: ${key}`).toBe(true);
 }
});
