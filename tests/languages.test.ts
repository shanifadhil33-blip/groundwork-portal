import { expect, it } from 'vitest';
import { DEFAULT_LANGUAGE, LANGUAGES, isRtl, searchLanguages } from '../lib/languages';
it('has the full language list, English by default, right to left for Arabic, Urdu, Farsi, Dari and Pashto only', () => {
  expect(DEFAULT_LANGUAGE.startsWith('en')).toBe(true);
  for (const n of ['Nepali', 'Bangla (Bengali)', 'Pashto', 'Dari', 'Farsi (Persian)', 'Hindi', 'Urdu', 'Chinese (Simplified)', 'Arabic', 'Malayalam', 'Swahili (Kenya)']) expect(LANGUAGES.some(l => l.name === n)).toBe(true);
  expect(LANGUAGES.filter(l => l.rtl).map(l => l.name).sort()).toEqual(['Arabic', 'Dari', 'Farsi (Persian)', 'Pashto', 'Urdu']);
  expect(isRtl(null)).toBe(false);
  expect(searchLanguages('nep')[0].code).toBe('ne');
  expect(searchLanguages('বাংলা')[0].name).toBe('Bangla (Bengali)');
  expect(new Set(LANGUAGES.map(l => l.code)).size).toBe(LANGUAGES.length);
});
it('starts with English and is long enough to get the search box', () => { expect(LANGUAGES.length).toBeGreaterThan(15); expect(LANGUAGES.map(l=>l.code)).toEqual(expect.arrayContaining(['ne','bn','ps','fa-AF','fa-IR','hi','ur','zh-CN','ar-AE'])); });
