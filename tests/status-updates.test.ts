import { describe, expect, it } from 'vitest';
import { statusLine } from '../lib/status-updates';
describe('CMP05 status updates in the requester language', () => {
  it('uses the requester language', () => { const m = statusLine('ar', 'in_progress', 12, 'AC leak'); expect(m.lang).toBe('ar'); expect(m.body).toContain('WO 12 AC leak'); });
  it('falls back to English', () => { expect(statusLine('xx', 'done', 3, 'Door').body).toBe('Your job is done. Please rate it. WO 3 Door'); expect(statusLine(null, 'scheduled', 1, 'A').lang).toBe('en'); });
  it('handles region codes', () => { expect(statusLine('hi-IN', 'scheduled', 1, 'A').lang).toBe('hi'); });
  it('has no dashes in English copy', () => { for (const s of ['scheduled', 'in_progress', 'done'] as const) expect(statusLine('en', s, 1, 'A').body).not.toMatch(/[-–—]/); });
});
