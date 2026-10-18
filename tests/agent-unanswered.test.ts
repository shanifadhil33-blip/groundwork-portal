import { expect, it } from 'vitest';
import { unansweredAsk, UNANSWERED } from '../lib/services/assistant';
// Audit A10: if the AI is out, a request to act is told nothing changed; greetings and summaries are not.
it('flags action requests and leaves greetings alone', () => {
  expect(unansweredAsk('I fixed the fan myself. Please withdraw that request.')).toBe(true);
  expect(unansweredAsk('Cancel the job Replace lobby light fixture')).toBe(true);
  expect(unansweredAsk('Hi')).toBe(false);
  expect(unansweredAsk('what is waiting')).toBe(false);
  expect(unansweredAsk('Show my jobs for today')).toBe(false);
  expect(unansweredAsk('Approve any leave request that is waiting.')).toBe(true);
  expect(UNANSWERED).not.toMatch(/[-–—]/);
});
