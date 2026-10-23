import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ turn: vi.fn(), fallback: vi.fn(), language: 'hi' }));
vi.mock('../lib/trade-words.json', async original => {
  const actual = await original<{ default: Record<string, Record<string, string>> }>();
  // Synthetic translations exercise the cap even while real coverage is sparse.
  return { default: { ...actual.default, ...Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`part${i}`, { hi: `शब्द${i}` }])) } };
});
vi.mock('../lib/ai', () => ({ assistantTurn: state.turn, withFallback: state.fallback, aiCallsToday: async () => 0, stripThinking: (text: string) => text }));
vi.mock('../lib/db', () => ({ withUser: async (_user: string, callback: (db: unknown) => unknown) => callback({ query: async () => ({ rows: [] }) }), withSystem: async () => {}, asAgent: (_actor: unknown, callback: () => unknown) => callback() }));
vi.mock('../lib/services/settings', () => ({ getPreferences: async () => ({ language: state.language }) }));
vi.mock('../lib/services/agent\u002dlearning', () => ({ listAgentLearning: async () => ({ data: [] }) }));
vi.mock('../lib/services/emergencies', () => ({ reportEmergency: async () => null }));
vi.mock('../lib/agent/tools', () => ({ tools: {}, callTool: vi.fn() }));
vi.mock('../lib/services/shared', async original => ({ ...await original<object>(), inWorkspace: async (_user: string, _ws: string, callback: (context: unknown) => unknown) => callback({ role: 'admin', db: { query: async () => ({ rows: [] }) } }) }));

import { translateUi } from '../lib/services/translations';
import { assistant } from '../lib/services/assistant';
import { TRADE_WORDS } from '../lib/trade-words';

beforeEach(() => {
  vi.clearAllMocks();
  state.language = 'hi';
  state.turn.mockResolvedValue({ calls: [], text: 'Ready.' });
  state.fallback.mockResolvedValue(null);
});

it('adds the selected trade words to the real UI translation request with mocked AI', async () => {
  await translateUi('user', { lang: state.language, strings: ['Check Plumbing', 'Agent', 'Groundwork'] });
  expect(state.fallback).toHaveBeenCalledTimes(1);
  const build = state.fallback.mock.calls[0][1];
  for (const provider of [{ kind: 'gemini' }, { kind: 'other', model: 'mock' }]) {
    const request = build(provider);
    const prompt = provider.kind === 'gemini' ? request.contents[0].parts[0].text : request.messages[0].content;
    expect(prompt).toContain(`Use these trade words exactly: Plumbing = ${TRADE_WORDS.Plumbing.hi}`);
    expect(prompt).not.toContain('AC = ');
    expect(prompt).not.toContain('Agent = ');
    expect(prompt).not.toContain('Groundwork = ');
    expect(prompt).toContain('Keep the product name Groundwork exactly as written in English.');
    expect(prompt).toContain('Translate Agent using the local word for an assistant.');
  }
});

it('passes at most twenty conversation words into the Agent system context', async () => {
  const words = Array.from({ length: 25 }, (_, i) => `part${i}`);
  await assistant('user', 'workspace', { messages: [{ role: 'assistant', content: words.slice(0, 10).join(' ') }, { role: 'user', content: words.slice(10).join(' ') }] });
  expect(state.turn).toHaveBeenCalledTimes(1);
  const prompt = state.turn.mock.calls[0][2] as string;
  expect(prompt).toContain('Reply in Hindi.');
  expect(prompt).toContain('Keep the product words Agent and Groundwork exactly as written in English.');
  const list = prompt.split('Use these trade words exactly: ')[1];
  expect(list.split('; ')).toHaveLength(20);
  expect(list).toContain('part19 = शब्द19');
  expect(list).not.toContain('part20 = ');
  expect(list).not.toContain('AC = ');
});

it('does not add trade words to the Agent system context for English replies', async () => {
  state.language = ['en', 'IN'].join(String.fromCharCode(45));
  await assistant('user', 'workspace', { messages: [{ role: 'user', content: 'Check AC Plumbing Light part0' }] });
  expect(state.turn).toHaveBeenCalledTimes(1);
  expect(state.turn.mock.calls[0][2]).not.toContain('Use these trade words exactly:');
});
