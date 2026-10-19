import { expect, it } from 'vitest';
import { arabicJobs, countLine, countLocalized, COUNT_LANGS } from '../lib/count-lines';
import { LANGUAGES } from '../lib/languages';
import { clientCountQuestion } from '../lib/agent/data-answers';

it('Arabic counted noun follows the number rules', () => {
  expect([1, 2, 3, 10, 11, 99, 100, 101, 102, 103, 111].map(arabicJobs)).toEqual(['عملًا واحدًا', 'عملين', '3 أعمال', '10 أعمال', '11 عملًا', '99 عملًا', '100 عمل', '101 عمل', '102 عمل', '103 أعمال', '111 عملًا']);
  expect(countLine('ar-AE', 'other', { name: 'Ravi', month: 0, total: 4 })).toBe('لم ينجز Ravi أي عمل هذا الشهر، ومجموع أعماله 4.');
  expect(countLine('ar-AE', 'self', { month: 2, total: 9 })).toBe('أنجزت عملين هذا الشهر، ومجموع أعمالك 9.');
});
it('English keeps job and jobs', () => {
  expect(countLine('en-IN', 'other', { name: 'Ravi', month: 1, total: 5 })).toBe('Ravi finished 1 job this month and 5 in total.');
  expect(countLine('en-GB', 'self', { month: 3, total: 5 })).toBe('You finished 3 jobs this month and 5 in total.');
  expect(countLocalized('en-US')).toBe(false);
});
it.each(LANGUAGES.map(l => l.code))('%s has every count line, numbers kept, no dash, no placeholder left', code => {
  for (const kind of ['other', 'self', 'client', 'own_only', 'not_found', 'ambiguous'] as const) {
    const line = countLine(code, kind, { name: 'Ravi', month: 7, total: 23, names: 'Ravi Kumar, Ravi Menon' });
    expect(line).not.toMatch(/[{}]|\p{Pd}/u);
    if (kind === 'other') expect(line).toMatch(/Ravi/);
    if (kind === 'other' || kind === 'self') expect(line).toMatch(/7[\s\S]*23/);
    if (kind === 'ambiguous') expect(line).toContain('Ravi Kumar, Ravi Menon');
  }
  if (!code.startsWith('en')) { expect(countLocalized(code)).toBe(true); expect(COUNT_LANGS.length).toBeGreaterThan(20); }
});
it('client count wording is caught', () => {
  for (const q of ['How many jobs has Ravi done?', 'how many jobs did your technicians finish this month', 'Show me Ravi job count']) expect(clientCountQuestion(q)).toBe(true);
  for (const q of ['How many open requests do I have?', 'When is my visit?']) expect(clientCountQuestion(q)).toBe(false);
});
