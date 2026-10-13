import { describe, expect, it } from 'vitest';
import { plainAssistantReply } from '../lib/ui/assistant-replies';
describe('assistant replies have no dashes', () => {
  it('turns spaced dashes into commas', () => {
    const out = plainAssistantReply('WO 31: Adjust cooling – urgent — AC - unassigned');
    expect(out).not.toMatch(/[\u2013\u2014]| - /);
    expect(out).toContain('Adjust cooling, urgent, AC, unassigned');
  });
  it('keeps markdown list bullets', () => {
    expect(plainAssistantReply('- one\n- two')).toMatch(/one/);
  });
});
import { withCurrency } from '../lib/ui/assistant-replies';
describe('job numbers and money', () => {
  it('writes WO 1 not WO-1', () => {
    expect(plainAssistantReply('See WO-1 and WO‑31.')).toBe('See WO 1 and WO 31.');
  });
  it('adds currency to bare amounts only', () => {
    expect(withCurrency('A pending quote of 850.00 for this.')).toBe('A pending quote of AED 850.00 for this.');
    expect(withCurrency('Cost AED 1,200.50 and 300.00 AED, on 2026.10.13')).toBe('Cost AED 1,200.50 and 300.00 AED, on 2026.10.13');
  });
});
describe('dashes with odd spaces', () => {
  it('handles non breaking spaces and number ranges', () => {
    const out = plainAssistantReply('Northgate has the most\u00a0— 4 of them, week 13\u202f–\u202f19 Oct');
    expect(out).not.toMatch(/[\u2013\u2014]/);
  });
});
