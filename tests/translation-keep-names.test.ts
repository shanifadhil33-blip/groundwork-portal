import { describe, expect, it, vi } from 'vitest';
vi.mock('../lib/db', () => ({ withUser: async (_u: string, f: any) => f({ query: async () => ({ rows: [{ source: 'Groundwork', translated: 'اسم آخر' }, { source: 'Agent', translated: 'الوكيل' }] }) }), withSystem: async () => {} }));
import { translateUi, KEEP_AS_IS } from '../lib/services/translations';
describe('product names and assistant labels', () => {
  it('keeps Groundwork even when a bad cached translation exists', async () => {
    expect(KEEP_AS_IS.has('Groundwork')).toBe(true);
    const r = await translateUi('u', { lang: 'ar-AE', strings: ['Groundwork'] });
    expect(r.translations.Groundwork).toBe('Groundwork');
  });
  it('uses the localized assistant label instead of forcing English Agent', async () => {
    expect(KEEP_AS_IS.has('Agent')).toBe(false);
    const r = await translateUi('u', { lang: 'ar-AE', strings: ['Agent'], cached_only: true });
    expect(r.translations.Agent).toBe('الوكيل');
  });
});
