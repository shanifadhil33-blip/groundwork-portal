import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { LANGUAGES } from '../lib/languages';
import { isEnglish, readTranslationCache, replaceTranslation } from '../lib/i18n';
import { relativeLabel } from '../lib/ui/helpers';

it.each(LANGUAGES.filter(l=>!isEnglish(l.code)))('$code uses static count and accessibility templates without storing personal data as keys',({code})=>{
 const words=readTranslationCache(readFileSync(`public/i18n/${code}.json`,'utf8'),code);
 for(const source of ['68 jobs','3 clients','278 entries','1 request to check','Notifications, 20 unread','Expires in 7 days','2 of 12 visits used','Practice data. It resets every 6 hours.']) {
  const translated=replaceTranslation(source,words);
  expect(translated,`${code}: ${source}`).not.toBe(source);
  for(const number of source.match(/\d+/g)??[])expect(translated).toContain(number);
 }
 const translated=replaceTranslation('Real name: Ravi',words);
 expect(translated).not.toBe('Real name: Ravi');expect(translated).toContain('Ravi');
 expect(words['Real name: Ravi']).toBeUndefined();
 expect(replaceTranslation('I typed my own description.',words)).toBe('I typed my own description.');
});
it('relative time uses Arabic and falls back to a localized calendar when Intl lacks a locale',()=>{
 const now=Date.parse('2026-10-23T10:00:00Z');
 expect(relativeLabel('2026-10-23T09:58:00Z',now,'ar-AE')).toMatch(/\p{Script=Arabic}/u);
 expect(relativeLabel('2026-10-23T09:58:00Z',now,'tw')).not.toMatch(/ago|minute|October/);
});
