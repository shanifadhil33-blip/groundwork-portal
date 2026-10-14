import { afterEach, expect, it, vi } from 'vitest';
import { missingQuestion } from '../lib/voice-report';
afterEach(() => vi.restoreAllMocks());
it('TECH08 asks how it ended when he did not say, in his language', () => {
  expect(missingQuestion('ar', { problem: 'تسريب', outcome: null })).toMatch(/هل/);
  expect(missingQuestion('en', { problem: 'Leak', outcome: 'fixed' })).toBeNull();
  expect(missingQuestion('en', { problem: '', outcome: 'fixed' })).toBe('What was the problem?');
  expect(missingQuestion('xx', { problem: '', outcome: null })).toMatch(/fixed/);
});
it('TECH08 refuses an outcome he never said', async () => {
  vi.doMock('../lib/ai', () => ({ textOf: (_p: unknown, d: string) => d, withFallback: async (_l: string, _b: unknown, parse: (p: unknown, d: unknown) => unknown) => parse({}, JSON.stringify({ problem: 'water on floor', work: 'cleaned drain pipe', outcome: 'fixed', problem_en: 'water on floor', work_en: 'cleaned drain pipe' })) }));
  vi.resetModules(); const { fillFromWords } = await import('../lib/voice-report');
  const r = await fillFromWords('water on floor, I cleaned the drain pipe', 'en', 'AC leak');
  expect(r?.outcome).toBeNull(); expect(r?.question).toMatch(/fixed/);
  const r2 = await fillFromWords('water on floor, cleaned drain pipe, now it is fixed', 'en', 'AC leak');
  expect(r2?.outcome).toBe('fixed'); expect(r2?.question).toBeNull();
});
