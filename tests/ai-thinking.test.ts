import { describe, it, expect } from 'vitest';
import { stripThinking } from '../lib/ai-text';
describe('model notes never reach the user', () => {
  it('removes think blocks and leading notes', () => {
    expect(stripThinking('<think>plan the reply</think>Two jobs are late.')).toBe('Two jobs are late.');
    expect(stripThinking('notes about rules</think>\nTwo jobs are late.')).toBe('Two jobs are late.');
    expect(stripThinking('Two jobs are late.')).toBe('Two jobs are late.');
  });
});
