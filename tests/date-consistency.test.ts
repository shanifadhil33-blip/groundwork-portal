import { describe, expect, it } from 'vitest';
import { formatDate, localDate } from '../lib/dates';
import { fixtureDates } from '../lib/fixture';
import { formatInLang } from '../lib/date-lang';

// 2026-10-18 20:30 UTC is 00:30 on 19 Oct in Dubai (UTC+4); 19:30 UTC is 23:30 on 18 Oct.
const afterMidnight = '2026-10-18T20:30:00Z';
const beforeMidnight = '2026-10-18T19:30:00Z';
const langs = ['en-IN', 'ar-AE', 'fil', 'hi'];
const day = (text: string) => text.replace(/[^\p{N}]/gu, ' ').trim().split(/\s+/).find(p => p.length <= 2);

describe('one calendar date in every language, in the workspace time zone', () => {
  it.each(langs)('%s shows the Dubai day for instants near midnight', lang => {
    expect(day(formatDate(beforeMidnight, 'Asia/Dubai', false, lang))).toBe('18');
    expect(day(formatDate(afterMidnight, 'Asia/Dubai', false, lang))).toBe('19');
  });
  it.each(langs)('%s keeps a plain due date on the same day', lang => {
    expect(day(formatDate('2026-10-18', 'Asia/Dubai', false, lang))).toBe('18');
    expect(day(formatInLang(new Date('2026-10-18T12:00:00Z'), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }, lang, lang))).toBe('18');
  });
  it('every language agrees on the day number', () => {
    const days = langs.map(l => day(formatDate(afterMidnight, 'Asia/Dubai', false, l)));
    expect(new Set(days).size).toBe(1);
  });
  it('a time zone is applied the same way in every language', () => {
    for (const lang of langs) expect(day(formatInLang(afterMidnight, { day: 'numeric', month: 'short', timeZone: 'UTC' }, lang, lang))).toBe('18');
  });
});

// Root cause of WO 31 showing 18 Oct then 19 Oct (QA, Nov 2): every demo sandbox is built fresh, with due dates counted
// from the Dubai day it was built. WO 31 is due 15 days before that day, so a sandbox built after midnight Dubai
// (20:00 UTC) moves it one day later. The formatting itself agrees in every language.
describe('demo due dates follow the Dubai day the sandbox was built', () => {
  it('WO 31 is due 15 days before the build day', () => {
    expect(fixtureDates(31, localDate('2026-11-02T19:59:00Z', 'Asia/Dubai'), 'Asia/Dubai').due).toBe('2026-10-18');
    expect(fixtureDates(31, localDate('2026-11-02T20:01:00Z', 'Asia/Dubai'), 'Asia/Dubai').due).toBe('2026-10-19');
  });
});
