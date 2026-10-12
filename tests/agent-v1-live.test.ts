import './fixtures';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { setAuthResolverForTests } from '../lib/auth';
import { ids } from '../scripts/seed';
import { setJobPayment } from '../lib/services/payments';
import { resetCooldowns } from '../lib/ai';
import * as assistantRoute from '../app/api/workspaces/[ws]/assistant/route';
let user: string = ids.imran;
beforeEach(() => { user = ids.imran; setAuthResolverForTests(async () => user); vi.stubEnv('GEMINI_API_KEY', 'fictional-key'); vi.stubEnv('AI_GEMINI_MODELS', 'gemini-3.5-flash-lite'); resetCooldowns(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); setAuthResolverForTests(); });
afterAll(closePools);
const done = () => withSystem(async db => (await db.query("SELECT id,payment_status FROM work_orders WHERE workspace_id=$1 AND status='done' ORDER BY order_number LIMIT 1", [ids.ridgeline])).rows[0]);
async function post(body: unknown) { const r = await assistantRoute.POST(new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ ws: ids.ridgeline }) } as any); return { status: r.status, body: await r.json() }; }
it('an admin can mark a finished job as covered by the contract', async () => {
  const o = await done();
  const saved = await setJobPayment(ids.imran, ids.ridgeline, o.id, { payment_status: 'contract' });
  expect(saved.payment_status).toBe('contract');
  await setJobPayment(ids.imran, ids.ridgeline, o.id, { payment_status: o.payment_status ?? 'to_bill' });
});
it('the agent marks a finished job as contract after the card, replies by name, and Undo puts it back', async () => {
  const o = await done();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json({ candidates: [{ content: { parts: [{ functionCall: { name: 'set_job_payment', args: { id: o.id, payment_status: 'contract' } } }] } }] })));
  const p = await post({ messages: [{ role: 'user', content: "today's job was under contract, not paid" }] });
  expect(p.status).toBe(200); expect(p.body.pending_action.summary).toContain('no invoice');
  const c = await post({ messages: [], confirm_action_id: p.body.pending_action.id });
  expect(c.status).toBe(200); expect(c.body.reply).toMatch(/^Done, Imran\./);
  expect((await done()).payment_status).toBe('contract');
  const { undoDecision } = await import('../lib/services/agent-log');
  await undoDecision(ids.imran, ids.ridgeline, p.body.pending_action.id);
  expect((await done()).payment_status ?? 'to_bill').toBe(o.payment_status ?? 'to_bill');
  await withSystem(db => db.query('DELETE FROM assistant_actions WHERE id=$1', [p.body.pending_action.id]));
});
it('a job id the model made up goes back to the model, never a not found page', async () => {
  const bad = '00000000-0000-4000-8000-0000000000ff';
  vi.stubGlobal('fetch', vi.fn()
    .mockImplementationOnce(async () => Response.json({ candidates: [{ content: { parts: [{ functionCall: { name: 'set_priority', args: { id: bad, priority: 'high', updated_at: '2026-10-11T00:00:00Z' } } }] } }] }))
    .mockImplementationOnce(async () => Response.json({ candidates: [{ content: { parts: [{ functionCall: { name: 'ask_choice', args: { question: 'Which job do you mean?', options: ['WO-25', 'Change'] } } }] } }] })));
  const r = await post({ messages: [{ role: 'user', content: 'save this' }] });
  expect(r.status).toBe(200); expect(r.body.choices).toEqual(['WO-25', 'Change']); expect(r.body.pending_action).toBeUndefined();
});
