import { describe, expect, it, vi } from 'vitest';
vi.mock('../lib/agent/tools', () => ({ callTool: vi.fn() }));
vi.mock('../lib/agent/localized-data-answers', () => ({ localizedDataAnswer: vi.fn(async () => undefined) }));
vi.mock('../lib/services/settings', () => ({ getPreferences: vi.fn(async () => ({ language: 'en-IN' })) }));
vi.mock('../lib/services/agent-words', () => ({ listWords: vi.fn(async () => []), resolveWords: (q: string) => q }));
vi.mock('../lib/services/shared', () => ({ inWorkspace: vi.fn(async () => 'Asia/Dubai') }));
vi.mock('../lib/services/work-orders', () => ({ listWorkOrders: vi.fn() }));
import { callTool } from '../lib/agent/tools';
import { dataAnswer } from '../lib/agent/data-answers';

const c = { user: 'u', ws: 'w', scope: 'read', kind: 'assistant' } as any;
const result = (r: unknown) => ({ isError: false, structuredContent: { result: r } }) as any;

describe('fallback replies use the workspace time zone, not the server clock', () => {
  it('a job near midnight Dubai shows the Dubai day and time', async () => {
    // 20:30 UTC on 18 Oct is 00:30 on 19 Oct in Dubai.
    vi.mocked(callTool).mockResolvedValue(result({ order_number: 31, title: 'Fix lights', status: 'scheduled', scheduled_for: '2026-10-18T20:30:00Z', due_on: '2026-10-19' }));
    const text = await dataAnswer(c, 'WO 31');
    expect(text).toContain('Visit: Mon 19 Oct, 00:30');
    expect(text).toContain('Due: Oct 19, 2026');
  });
  it('late jobs list shows Dubai visit times', async () => {
    vi.mocked(callTool).mockResolvedValue(result({ total: 1, data: [{ order_number: 31, title: 'Fix lights', status: 'scheduled', scheduled_for: '2026-10-18T05:00:00Z' }] }));
    expect(await dataAnswer(c, 'which jobs are overdue')).toContain('Sun 18 Oct, 09:00');
  });
});
