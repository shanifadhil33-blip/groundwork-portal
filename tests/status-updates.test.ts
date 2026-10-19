import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { statusLine, STATUS_LANGS, type Step } from '../lib/status-updates';
describe('CMP05 status updates in the requester language', () => {
  it('uses the requester language', () => { const m = statusLine('ar', 'in_progress', 12, 'AC leak'); expect(m.lang).toBe('ar'); expect(m.body).toContain('WO 12 AC leak'); });
  it('falls back to English', () => { expect(statusLine('xx', 'done', 3, 'Door').body).toBe('Your job is done. Please rate it. WO 3 Door'); expect(statusLine(null, 'scheduled', 1, 'A').lang).toBe('en'); });
  it('handles region codes', () => { expect(statusLine('hi-IN', 'scheduled', 1, 'A').lang).toBe('hi'); });
  it('has no dashes in English copy', () => { for (const s of ['scheduled', 'in_progress', 'done'] as const) expect(statusLine('en', s, 1, 'A').body).not.toMatch(/[-–—]/); });
});


const steps: Step[] = ['scheduled', 'in_progress', 'done'];
const appLanguages = readdirSync(new URL('../public/i18n/', import.meta.url))
  .filter(file => file.endsWith('.json')).map(file => file.slice(0, -5));

describe('HOME06 status updates for every app language', () => {
  it.each(appLanguages)('%s has a translated title and all three steps', code => {
    for (const step of steps) {
      const message = statusLine(code, step, 12, 'Leak');
      expect(message.lang).not.toBe('en');
      expect(STATUS_LANGS).toContain(message.lang);
      expect(message.title).not.toBe('Job update');
      expect(message.title.trim()).not.toBe('');
      expect(message.body).not.toBe(statusLine('en', step, 12, 'Leak').body);
      expect(message.body.endsWith(' WO 12 Leak')).toBe(true);
      expect(message.body.split(' WO')[0].trim()).not.toBe('');
    }
  });

  it('keeps Filipino and the legacy Tagalog code equivalent', () => {
    for (const step of steps) {
      const fil = statusLine('fil', step, 12, 'Leak');
      const tl = statusLine('tl', step, 12, 'Leak');
      expect(fil).toEqual({ ...tl, lang: 'fil' });
      expect(tl.lang).toBe('tl');
    }
    expect(statusLine('FIL-PH', 'scheduled', 12, 'Leak').lang).toBe('fil');
  });

  it.each(['fa-AF', 'fa-IR'])('%s uses its full lowercased key', code => {
    for (const step of steps) {
      expect(statusLine(code, step, 12, 'Leak').lang).toBe(code.toLowerCase());
      expect(statusLine(code.toUpperCase(), step, 12, 'Leak').lang).toBe(code.toLowerCase());
    }
  });

  it.each(['xx', null, undefined, 'constructor', '__proto__'])('falls back to English for %s', code => {
    for (const step of steps) {
      expect(statusLine(code, step, 12, 'Leak')).toEqual(statusLine('en', step, 12, 'Leak'));
    }
  });

  it.each(['am', 'ar', 'bn', 'fa-AF', 'fa-IR', 'hi', 'ml', 'ne', 'ps', 'ta', 'ti', 'ur', 'zh'])
  ('%s uses its own script without Latin letters', code => {
    for (const step of steps) {
      const message = statusLine(code, step, 12, 'Leak');
      expect(message.title).not.toMatch(/\p{Script=Latin}/u);
      expect(message.body.split(' WO')[0]).not.toMatch(/\p{Script=Latin}/u);
    }
  });

  it.each(STATUS_LANGS)('%s has no dashes in any phrase', code => {
    expect(statusLine(code, 'scheduled', 12, 'Leak').lang).toBe(code);
    for (const step of steps) {
      const message = statusLine(code, step, 12, 'Leak');
      expect(message.title).not.toMatch(/[-\u2013\u2014]/);
      expect(message.body).not.toMatch(/[-\u2013\u2014]/);
      expect(message.body.endsWith(' WO 12 Leak')).toBe(true);
    }
  });
});
