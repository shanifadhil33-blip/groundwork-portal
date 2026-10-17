import { expect, it } from 'vitest';
import { asciiDigits, parseTranslations } from '../lib/i18n';
it('native digits become 0 to 9 so translations with numbers are kept', () => {
  expect(asciiDigits('६ घण्टा')).toBe('6 घण्टा'); expect(asciiDigits('৬')).toBe('6'); expect(asciiDigits('۲۰')).toBe('20'); expect(asciiDigits('٣')).toBe('3'); expect(asciiDigits('௭')).toBe('7');
  const r = parseTranslations(JSON.stringify({ 'Practice data. It resets every 6 hours.': 'अभ्यास डेटा। यो हरेक ६ घण्टामा रिसेट हुन्छ।' }), ['Practice data. It resets every 6 hours.']);
  expect(r?.['Practice data. It resets every 6 hours.']).toContain('6 घण्टामा');
});
it('order codes with several parts stay as data', () => {
  const src = 'Imran updated supplier order COBALT-DEMO-4 for Inspect emergency lighting · Ordered';
  const r = parseTranslations(JSON.stringify({ [src]: 'قام Imran بتحديث طلب المورد COBALT-DEMO-4 لفحص إضاءة الطوارئ · تم الطلب' }), [src]);
  expect(r?.[src]).toContain('COBALT-DEMO-4');
});
