import { describe, expect, it } from 'vitest';
import { themeScript } from '../lib/head-scripts';
import { readFileSync } from 'node:fs';
// Runs the real pre paint script, so the first paint already has the right theme (no flash).
const run = (stored: string | null, phoneDark: boolean, storageWorks = true) => {
  const doc = { documentElement: { dataset: {} as Record<string, string> } };
  const storage = { getItem: () => { if (!storageWorks) throw new Error('blocked'); return stored; } };
  new Function('document', 'localStorage', 'matchMedia', themeScript)(doc, storage, () => ({ matches: phoneDark }));
  return doc.documentElement.dataset.theme;
};
describe('theme', () => {
  it('is light by default, even on a phone set to dark', () => { expect(run(null, true)).toBe('light'); expect(run(null, false)).toBe('light'); });
  it('keeps the choice made on this device', () => { expect(run('dark', false)).toBe('dark'); expect(run('light', true)).toBe('light'); });
  it('Match my phone follows the phone', () => { expect(run('system', true)).toBe('dark'); expect(run('system', false)).toBe('light'); });
  it('falls back to light when storage is blocked', () => { expect(run(null, true, false)).toBe('light'); });
  it('Settings offers Light, Dark and Match my phone, remembered per device, never on the account', () => {
    const s = readFileSync('components/app/settings.tsx', 'utf8'), t = readFileSync('components/ui/theme.tsx', 'utf8');
    expect(s).toContain("system:'Match my phone'"); expect(s).toContain('Each device remembers its own choice');
    expect(t).not.toMatch(/preferences/);
  });
});
