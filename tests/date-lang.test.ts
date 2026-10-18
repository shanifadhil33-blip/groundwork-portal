import { afterEach, describe, expect, it, vi } from 'vitest';
import { DATE_WORDS, formatInLang, hasNativeDates, resetDateSupport, weekLetters } from '../lib/date-lang';
import { formatDate } from '../lib/dates';
import { LANGUAGES } from '../lib/languages';

// Sunday 18 October 2026, 16:04 in Dubai.
const at = new Date(Date.UTC(2026, 9, 18, 12, 4));
const today = { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Dubai' } as const;

describe('LANG01 slice 2: dates in the person language', () => {
  afterEach(() => vi.restoreAllMocks());
  it('keeps English exactly as before', () => {
    expect(formatInLang(at, today, 'en-IN')).toBe('Sunday, October 18');
    expect(formatDate('2026-10-18', 'Asia/Dubai')).toBe('Oct 18, 2026');
    expect(weekLetters('en-GB')).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
  });
  it('writes every listed language with no English words, digits 0 to 9 and the Gregorian day', () => {
    for (const { code } of LANGUAGES.filter(l => !l.code.startsWith('en'))) {
      const text = formatInLang(at, today, code);
      expect(text, code).not.toMatch(/Sunday|October|Sun|Oct/);
      expect(text, code).toContain('18');
      expect(text, code).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F\u09E6-\u09EF]/);
    }
    expect(formatInLang(at, today, 'ar-AE')).toContain('أكتوبر');
    expect(formatInLang(at, today, 'fa-IR')).toContain('18');
  });
  it('uses a 24 hour clock outside English, so no AM or PM word from another language slips in', () => {
    const time = { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dubai' } as const;
    expect(formatInLang(at, time, 'en-IN')).toMatch(/4:04\s?PM/i);
    for (const code of ['ta', 'hi', 'ar-AE', 'ne', 'yo']) expect(formatInLang(at, time, code), code).toMatch(/^16:04$/);
  });
  it('falls back to the saved CLDR words when the browser lacks the language, never a mix', () => {
    resetDateSupport();
    vi.spyOn(Intl.DateTimeFormat, 'supportedLocalesOf').mockReturnValue([]);
    expect(hasNativeDates('ne')).toBe(false);
    expect(formatInLang(at, today, 'ne')).toBe('आइतबार 18 अक्टोबर');
    expect(formatInLang(at, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dubai' }, 'ne')).toBe('16:04');
    expect(formatInLang(at, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dubai' }, 'ps')).toBe('18 اکتوبر 2026, 16:04');
    for (const code of Object.keys(DATE_WORDS)) {
      const text = formatInLang(at, today, code);
      expect(text, code).not.toMatch(/Sunday|October|Sun|Oct/);
      expect(text, code).toContain(DATE_WORDS[code].dl[0]);
    }
    expect(weekLetters('ne')).toHaveLength(7);
    resetDateSupport();
  });
  it('has 7 weekdays and 12 months for every saved language', () => {
    for (const [code, w] of Object.entries(DATE_WORDS)) {
      expect(w.dl.length + w.ds.length, code).toBe(14);
      expect(w.ml.length + w.ms.length, code).toBe(24);
    }
    expect(DATE_WORDS.ne.dl[0]).toBe('आइतबार');
    expect(DATE_WORDS.ne.ml[9]).toBe('अक्टोबर');
  });
  it('an unknown language stays fully English', () => {
    expect(formatInLang(at, today, 'xx')).toBe('Sunday, October 18');
  });
});

import { parseTranslations, rightScript } from '../lib/i18n';
describe('translations in the wrong script are refused', () => {
  it('refuses Malayalam written in Devanagari, keeps right script and Latin names', () => {
    expect(rightScript('सुप्रभातम्', 'ml')).toBe(false);
    expect(rightScript('സുപ്രഭാതം', 'ml')).toBe(true);
    expect(rightScript('Groundwork ജോലികൾ', 'ml')).toBe(true);
    expect(rightScript('صبح بخیر', 'ur')).toBe(true);
    expect(rightScript('Habari', 'sw-KE')).toBe(true);
    expect(parseTranslations('{"Good morning":"सुप्रभातम्"}', ['Good morning'], 'ml')).toBeNull();
    expect(parseTranslations('{"Good morning":"காலை வணக்கம்"}', ['Good morning'], 'ta')).toEqual({ 'Good morning': 'காலை வணக்கம்' });
  });
});
