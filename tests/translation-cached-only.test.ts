import { describe, expect, it, vi } from 'vitest';
const ai = vi.fn(async () => null);
vi.mock('../lib/ai', () => ({ withFallback: (...a: unknown[]) => ai(...(a as [])), stripThinking: (s: string) => s, aiCallsToday: async () => 0 }));
vi.mock('../lib/db', () => ({ withUser: async (_u: string, f: any) => f({ query: async () => ({ rows: [{ source: 'Save', translated: 'حفظ' }] }) }), withSystem: async () => {} }));
import { translateUi } from '../lib/services/translations';
describe('saved words come back at once', () => {
  it('cached_only never calls AI and says how many are missing', async () => {
    const r = await translateUi('u', { lang: 'ar-AE', strings: ['Save', 'Brand new words'], cached_only: true });
    expect(r.translations).toEqual({ Save: 'حفظ' }); expect((r as { missing?: number }).missing).toBe(1); expect(ai).not.toHaveBeenCalled();
  });
});
