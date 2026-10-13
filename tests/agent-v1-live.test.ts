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
  expect(r.status).toBe(200); expect(r.body.choices).toEqual(['WO 25', 'Change']); expect(r.body.pending_action).toBeUndefined();
});
it('a note reply always uses the name from the server, and Undo removes the note', async () => {
  user = ids.sam;
  const job = await withSystem(async db => (await db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND status IN ('open','scheduled') ORDER BY order_number LIMIT 1", [ids.ridgeline])).rows[0]);
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json({ candidates: [{ content: { parts: [{ functionCall: { name: 'add_comment', args: { work_order_id: job.id, body: 'Call before coming', visibility: 'internal' } } }] } }] })));
  const r = await post({ messages: [{ role: 'user', content: 'log this: call before coming' }] });
  expect(r.body.reply).toMatch(/^Done, Sam\. Added an internal note/); expect(r.body.logged).toBe(true);
  const a = await withSystem(async db => (await db.query("SELECT * FROM assistant_actions WHERE tool='add_comment' AND args->>'work_order_id'=$1 ORDER BY created_at DESC LIMIT 1", [job.id])).rows[0]);
  expect(a.why).toContain('You said "log this: call before coming"');
  const { undoDecision } = await import('../lib/services/agent-log');
  await undoDecision(ids.sam, ids.ridgeline, a.id);
  expect(await withSystem(async db => (await db.query('SELECT count(*)::int n FROM comments WHERE id=$1', [a.before.comment_id])).rows[0].n)).toBe(0);
  await withSystem(db => db.query('DELETE FROM assistant_actions WHERE id=$1', [a.id]));
});
it('a client edit by the agent has a why built from the request and effects, and Undo puts the client back', async () => {
  const before = await withSystem(async db => (await db.query('SELECT contact_name FROM clients WHERE id=$1', [ids.harbor])).rows[0]);
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json({ candidates: [{ content: { parts: [{ functionCall: { name: 'update_client', args: { id: ids.harbor, contact_name: 'Faisal Rahman' } } }] } }] })));
  const p = await post({ messages: [{ role: 'user', content: 'The Harbor contact is now Faisal Rahman' }] });
  expect(p.body.reply).toBeUndefined(); expect(p.body.pending_action.why).toMatch(/^You said "The Harbor contact is now Faisal Rahman"\. .+/);
  const c = await post({ messages: [], confirm_action_id: p.body.pending_action.id }); expect(c.body.reply).toMatch(/^Done, Imran\./); expect(c.body.logged).toBe(true);
  const { undoDecision, listDecisions } = await import('../lib/services/agent-log');
  expect((await listDecisions(ids.imran, ids.ridgeline)).find((d: any) => d.id === p.body.pending_action.id)?.can_undo).toBe(true);
  expect((await listDecisions(ids.sam, ids.ridgeline)).find((d: any) => d.id === p.body.pending_action.id)?.can_undo).toBeUndefined();
  await undoDecision(ids.imran, ids.ridgeline, p.body.pending_action.id);
  expect((await withSystem(async db => (await db.query('SELECT contact_name FROM clients WHERE id=$1', [ids.harbor])).rows[0])).contact_name ?? '').toBe(before.contact_name ?? '');
  await withSystem(db => db.query('DELETE FROM assistant_actions WHERE id=$1', [p.body.pending_action.id]));
});
