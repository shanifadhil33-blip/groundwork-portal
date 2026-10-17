import { expect, it } from 'vitest';
import { TAB_WORDS, tabWord, tabKey } from '../lib/tab-words';
import { LANGUAGES } from '../lib/languages';
const KEYS = Object.keys(TAB_WORDS.en);
it('every listed language has a chosen short word for every phone tab', () => {
  for (const l of LANGUAGES) { if (l.code.startsWith('en')) continue; const t = TAB_WORDS[l.code]; expect(t, l.code).toBeTruthy(); for (const k of KEYS) { expect(t[k], `${l.code} ${k}`).toBeTruthy(); expect([...t[k]].length, `${l.code} ${k}`).toBeLessThanOrEqual(14); } }
});
it('English tab words are short, never cut', () => { for (const k of KEYS) expect(TAB_WORDS.en[k].length).toBeLessThanOrEqual(8); });
it('no stray symbols or dashes in tab words', () => { for (const t of Object.values(TAB_WORDS)) for (const w of Object.values(t)) expect(w).not.toMatch(/[\u0370-\u03ff\-–—…]/); });
it('maps each role to its own words', () => {
  expect(tabWord('ta', tabKey('/work-orders', 'technician'), false)).toBe(TAB_WORDS.ta.myjobs);
  expect(tabWord('en-US', tabKey('/work-orders', 'client'), false)).toBe('Requests');
  expect(tabWord('en-IN', tabKey('/suggestions/new', 'technician'), false)).toBe('Suggest');
});
