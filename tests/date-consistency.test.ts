import { describe, expect, it } from 'vitest';
import { formatDate } from '../lib/dates';
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
