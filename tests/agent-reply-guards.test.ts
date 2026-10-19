import { expect, it } from 'vitest';
import { brokenReply, quickLookup } from '../lib/agent/data-answers';
it('a tool call written as text counts as a broken reply, a normal sentence does not', () => {
  expect(brokenReply('{\n  "workspace action": "Needs attention",\n  "Tool input": {}\n}')).toBe(true);
  expect(brokenReply('Here you go: "Tool input": {}')).toBe(true);
  expect(brokenReply('[1, 2]')).toBe(true);
  expect(brokenReply('You have 2 suggested jobs. {Lobby} is first.')).toBe(false);
});
it('what needs my attention is answered from app data without AI', () => {
  for (const q of ['What needs my attention?', 'what needs attention', 'Anything that needs my attention?']) expect(quickLookup(q)).toBe('attention');
  expect(quickLookup('What needs my attention at the tower and tell Sam')).toBeNull();
});
