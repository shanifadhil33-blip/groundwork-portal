// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { demoLanguage } from '../lib/ui/demo-language';
import { LANG_HINT_KEY } from '../lib/head-scripts';

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
it('uses the saved viewer language before the browser language', () => {
  localStorage.setItem(LANG_HINT_KEY, 'ar-AE');
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-GB']);
  expect(demoLanguage()).toBe('ar-AE');
});
it('matches supported browser languages and falls back to English', () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['xx', 'ar-SA']);
  expect(demoLanguage()).toBe('ar-AE');
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-GB']);
  expect(demoLanguage()).toBe('en-GB');
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['xx']);
  expect(demoLanguage()).toBe('en-IN');
});
it('keeps the current app language on switching, including a return to English', () => {
  localStorage.setItem(LANG_HINT_KEY, 'ar-AE');
  expect(demoLanguage('en')).toBe('en-IN');
  expect(demoLanguage('ne')).toBe('ne');
  expect(demoLanguage('ar-AE')).toBe('ar-AE');
});
it('ignores invalid hints and works when storage is unavailable', () => {
  localStorage.setItem(LANG_HINT_KEY, 'invalid');
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ar-AE']);
  expect(demoLanguage()).toBe('ar-AE');
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
  expect(demoLanguage()).toBe('ar-AE');
});
