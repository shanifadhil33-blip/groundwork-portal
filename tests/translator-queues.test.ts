import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
// A slow AI call must never hold back saved words that appear later on the screen (Tamil first load, Oct 18).
it('saved word lookups do not wait for the AI queue', () => {
  const src = readFileSync('components/app/translator.tsx', 'utf8');
  const flush = src.slice(src.indexOf('async function flush()'), src.indexOf('async function flushAi()'));
  expect(flush).toContain('ask(strings, true)');
  expect(flush).not.toContain('ask(strings, false)');
  expect(flush).toContain('void flushAi()');
  expect(flush).not.toContain('await flushAi');
  expect(src.slice(src.indexOf('async function flushAi()'))).toContain('ask(strings, false)');
});
