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
