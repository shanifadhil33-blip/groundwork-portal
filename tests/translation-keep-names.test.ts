import { describe, expect, it, vi } from 'vitest';
vi.mock('../lib/db', () => ({ withUser: async (_u: string, f: any) => f({ query: async () => ({ rows: [{ source: 'Agent', translated: 'موظف' }] }) }), withSystem: async () => {} }));
import { translateUi, KEEP_AS_IS } from '../lib/services/translations';
describe('product names are never translated', () => {
  it('keeps Agent even when a bad cached translation exists', async () => {
    expect(KEEP_AS_IS.has('Agent')).toBe(true);
    const r = await translateUi('u', { lang: 'ar-AE', strings: ['Agent'] });
    expect(r.translations.Agent).toBe('Agent');
  });
});
