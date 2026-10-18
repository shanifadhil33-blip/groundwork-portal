import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { providers, route, interleave, withFallback, resetCooldowns } from '../lib/ai';
// AI12 (Oct 18): spread the free allowances, use the no key providers, and skip a model that used up its day.
const env = { GEMINI_API_KEY: 'g', OPENROUTER_API_KEY: 'o', CLOUDFLARE_AI_TOKEN: 'c', CLOUDFLARE_ACCOUNT_ID: 'a', AI_KEYLESS: '1', AI_SPREAD: '1' };
const groups = (l: { name: string }[]) => [...new Set(l.map(p => p.name.split('/')[0]))];
beforeEach(() => resetCooldowns());
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('adds Kilo and OVH with no key only when AI_KEYLESS is on, and sends no auth header', () => {
  expect(groups(providers({ ...env, AI_KEYLESS: '' }))).not.toContain('kilo');
  const l = providers(env);
  expect(groups(l)).toEqual(['gemini', 'openrouter', 'cloudflare', 'kilo', 'ovh']);
  expect(l.filter(p => /^(kilo|ovh)\//.test(p.name)).every(p => !('Authorization' in p.headers))).toBe(true);
});
it('translations never use OpenRouter or the strong Gemini models and try Gemini lite last', () => {
  const r = route('bulk', providers(env), 0, env);
  expect(r.some(p => p.name.startsWith('openrouter/'))).toBe(false);
  expect(r.filter(p => p.name.startsWith('gemini/')).every(p => p.model.includes('lite'))).toBe(true);
  expect(groups(r).at(-1)).toBe('gemini');
});
it('the Agent rotates its first provider on each call', () => {
  const firsts = [0, 1, 2, 3, 4].map(t => interleave(route('assistant', providers(env), t, env))[0].name.split('/')[0]);
  expect(new Set(firsts).size).toBe(5);
});
it('a model that used up its day is skipped in the retry sweep too', async () => {
  vi.stubEnv('GEMINI_API_KEY', 'g'); vi.stubEnv('AI_GEMINI_MODELS', 'gemini-3.8-flash'); vi.stubEnv('OPENROUTER_API_KEY', ''); vi.stubEnv('SAMBANOVA_API_KEY', ''); vi.stubEnv('CLOUDFLARE_AI_TOKEN', ''); vi.stubEnv('AI_KEYLESS', ''); vi.stubEnv('AI_SPREAD', '');
  const fetch = vi.fn().mockResolvedValue(new Response('Rate limit exceeded: free-models-per-day', { status: 429 }));
  vi.stubGlobal('fetch', fetch);
  expect(await withFallback('assistant', () => ({}), () => 'x')).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
