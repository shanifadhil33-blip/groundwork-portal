import { expect, it } from 'vitest';
import { parseTranslations, validTranslation, readTranslationCache } from '../lib/i18n';
it('accepts a hyphen inside a word where the spelling needs it', () => {
  expect(validTranslation('Save', 'I-save', 'fil')).toBe(true);
  expect(validTranslation('In Progress', 'Na-aga n’ihu', 'ig')).toBe(true);
  expect(parseTranslations(JSON.stringify({ Save: 'I-save' }), ['Save'], 'fil')).toEqual({ Save: 'I-save' });
  expect(readTranslationCache(JSON.stringify({ Save: 'I-save' }), 'fil')).toEqual({ Save: 'I-save' });
});
it('still refuses dashes between words, and word hyphens in other languages', () => {
  expect(validTranslation('Save now', 'I-save — ngayon', 'fil')).toBe(false);
  expect(validTranslation('Save now', 'I-save - ngayon', 'fil')).toBe(false);
  expect(validTranslation('Save', 'حفظ-الآن', 'ar-AE')).toBe(false);
  expect(validTranslation('Save', 'I-save')).toBe(false);
});
it('reads a code written with a non breaking hyphen as the same code', () => {
  const src = 'Imran created supplier update COBALT-DEMO-2 · Ordered';
  const out = parseTranslations(JSON.stringify({ [src]: 'इमरान ने आपूर्तिकर्ता अपडेट COBALT\u2011DEMO\u20112 बनाया · ऑर्डर किया गया' }), [src], 'hi');
  expect(out?.[src]).toContain('COBALT-DEMO-2');
});
