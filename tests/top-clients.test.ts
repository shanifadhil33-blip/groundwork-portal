import { describe, expect, it } from 'vitest';
import { topClientsQuestion } from '../lib/agent/data-answers';
// Oct 21 2026: "Which of our clients had the most jobs this month" used to go to the AI, take 40 s and fall back.
describe('top clients quick answer', () => {
  it('matches the slow question and short forms', () => {
    for (const q of ['Which of our clients had the most jobs this month, and why might that be?', 'Which clients had the most jobs this month?', 'top clients this month', 'Which client has the most jobs']) expect(topClientsQuestion(q), q).toBe(true);
  });
  it('leaves other questions to the Agent', () => {
    for (const q of ['Which clients are in Marina?', 'Create a job for the client with the most jobs', 'how many jobs has Ravi completed']) expect(topClientsQuestion(q), q).toBe(false);
  });
});
