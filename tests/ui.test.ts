import { describe, expect, it } from 'vitest';
import { safeRedirect, homeForPersona, relativeLabel, shouldDismissSheet } from '../lib/ui/helpers';
describe('frontend navigation and time helpers', () => {
  it('allows local callback paths and rejects external and malformed redirects', () => {
    expect(safeRedirect('/invites/accept?token=example')).toBe('/invites/accept?token=example');
    for (const path of ['//example.com', 'https://example.com', '/\\example.com', '/\nexample.com', undefined]) expect(safeRedirect(path)).toBe('/dashboard');
  });
  it('lands demo personas on the correct role home', () => { for (const key of ['dana', 'sam']) expect(homeForPersona(key)).toBe('/dashboard'); for (const key of ['priya', 'omar']) expect(homeForPersona(key)).toBe('/home'); });
  it('requires enough downward travel or a deliberate fast swipe', () => { expect(shouldDismissSheet(10, 2)).toBe(false); expect(shouldDismissSheet(80, .2)).toBe(false); expect(shouldDismissSheet(101, .1)).toBe(true); expect(shouldDismissSheet(30, .7)).toBe(true); expect(shouldDismissSheet(-100, -2)).toBe(false); });
  it('formats recent and future timestamps without seconds', () => { const now = Date.parse('2026-10-10T12:00:00Z'); expect(relativeLabel('2026-10-10T11:55:00Z', now)).toBe('5 minutes ago'); expect(relativeLabel('2026-10-10T14:00:00Z', now)).toBe('in 2 hours'); expect(relativeLabel('bad', now)).toBe('Unknown time'); });
});
