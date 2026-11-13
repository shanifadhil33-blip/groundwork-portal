import { describe, expect, it } from 'vitest';
import { LANGUAGES, languageOptions, languageQuality, languageVoice } from '../lib/languages';
describe('LANG02 language dropdown options', () => {
  const opts = languageOptions();
  it('covers every language, grouped by region, with no quality tags in the picker (cut list section 10)', () => {
    expect(opts).toHaveLength(LANGUAGES.length);
    for (const o of opts) { expect(o.group).toBeTruthy(); expect('hint' in o).toBe(false); }
  });
  it('groups stay together so each heading shows once', () => {
    const seen: string[] = []; for (const o of opts) if (seen.at(-1) !== o.group) { expect(seen).not.toContain(o.group); seen.push(o.group!); }
  });
  it('searches by English name and own script', () => {
    const find = (q: string) => opts.filter(o => o.label.toLowerCase().includes(q) || o.keywords.some(k => k.toLowerCase().startsWith(q)));
    expect(find('tamil').map(o => o.value)).toEqual(['ta']); expect(find('தமிழ்').map(o => o.value)).toEqual(['ta']); expect(find('kenya').map(o => o.value)).toContain('sw-KE');
  });
  it('only English is Ready until native review; low resource voices are early', () => {
    expect(languageQuality('en-IN')).toBe('Ready'); expect(languageQuality('ml')).toBe('Early'); expect(languageVoice('tw')).toBe('Voice early'); expect(languageVoice('ta')).toBe('Voice');
  });
  it('no dashes in the shown text', () => { for (const o of opts) expect(o.label).not.toMatch(/[–—]/); });
});
