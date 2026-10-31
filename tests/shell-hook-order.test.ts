import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// A hook after an early return crashes the page (React error 310) when the shell first shows the skeleton,
// for example when a client opens /dashboard or staff open /home.
describe('app shell hook order', () => {
  it('calls no hooks after the first early return', () => {
    const src = readFileSync('components/app/shell.tsx', 'utf8');
    const start = src.indexOf('export function AppShell') >= 0 ? src.indexOf('export function AppShell') : 0;
    const body = src.slice(start);
    const firstReturn = body.search(/\n  if \([^\n]*\) return /);
    expect(firstReturn).toBeGreaterThan(0);
    const end = body.indexOf('\n  return <Translated>', firstReturn);
    const between = body.slice(firstReturn, end);
    expect(between.match(/\buse[A-Z][A-Za-z]*\(/g) ?? []).toEqual([]);
  });
});
