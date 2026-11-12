import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { assistant } from '../lib/services/assistant';
import { assistantTurn } from '../lib/ai';
import { createWorkOrder } from '../lib/services/work-orders';
import { changeList, declineDecision, listDecisions, REFUSAL_REASON } from '../lib/services/agent-log';
import { matchesFilter, outcomeNote, valueLabel, fieldLabel } from '../lib/ui/decision-log';
vi.mock('../lib/ai', async original => ({ ...await original<typeof import('../lib/ai')>(), assistantTurn: vi.fn() }));

const ws = ids.ridgeline, made: string[] = [];
async function job(extra: Record<string, unknown> = {}) {
  const s = await withSystem(async db => (await db.query('SELECT id, client_id FROM sites WHERE workspace_id=$1 AND client_id=$2 ORDER BY name LIMIT 1', [ws, ids.harbor])).rows[0]);
  const o = await createWorkOrder(ids.imran, ws, { title: 'Decision log test job', client_id: s.client_id, site_id: s.id, ...extra }) as any;
  made.push(o.id); return o;
}
const ask = (user: string, content: string) => assistant(user, ws, { messages: [{ role: 'user', content }] }) as Promise<any>;
afterEach(async () => {
  await withSystem(async db => {
    await db.query("DELETE FROM assistant_actions WHERE workspace_id=$1 AND (summary ILIKE '%Decision log test job%' OR tool IN ('set_priority','set_job_payment') AND created_at > now()-interval '10 minutes')", [ws]);
    for (const id of made.splice(0)) { for (const t of ['work_order_events', 'comments', 'notifications']) await db.query(`DELETE FROM ${t} WHERE ${t === 'notifications' ? 'entity_id' : 'work_order_id'}=$1`, [id]).catch(() => undefined); await db.query('DELETE FROM work_orders WHERE id=$1', [id]); }
  }, ids.imran);
});
afterAll(async () => { await closePools(); });

describe('AGENT05 decision log', () => {
  it('a confirmed change keeps before and after, and the log shows what moved', async () => {
    const o = await job();
    vi.mocked(assistantTurn).mockResolvedValue({ calls: [{ name: 'set_priority', args: { id: o.id, priority: 'urgent', updated_at: new Date(o.updated_at).toISOString() }, id: 'c1' }] } as any);
    const card = await ask(ids.imran, 'Make the decision log test job urgent');
    expect(card.pending_action?.id).toBeTruthy();
    const done: any = await assistant(ids.imran, ws, { messages: [], confirm_action_id: card.pending_action.id });
    expect(done.reply).toMatch(/^Done/);
    const row = (await listDecisions(ids.imran, ws)).find((d: any) => d.id === card.pending_action.id) as any;
    expect(row).toMatchObject({ outcome: 'done', can_undo: true });
    expect(row.changes).toEqual([{ field: 'priority', from: o.priority, to: 'urgent' }]);
    expect(row.at).toBeTruthy();
    expect(row).not.toHaveProperty('before');
  });
  it('Change on a card is saved as said no, and that card can not be confirmed after', async () => {
    const o = await job();
    vi.mocked(assistantTurn).mockResolvedValue({ calls: [{ name: 'set_priority', args: { id: o.id, priority: 'high', updated_at: new Date(o.updated_at).toISOString() }, id: 'c2' }] } as any);
    const card = await ask(ids.sam, 'Make it high');
    const id = card.pending_action.id;
    await expect(declineDecision(ids.ravi, ws, id)).rejects.toMatchObject({ status: 404 });
    expect(await declineDecision(ids.sam, ws, id)).toEqual({ declined: true });
    expect(await declineDecision(ids.sam, ws, id)).toEqual({ declined: true });
    const row = (await listDecisions(ids.sam, ws)).find((d: any) => d.id === id) as any;
    expect(row).toMatchObject({ outcome: 'declined', can_undo: false, changes: [] });
    expect(row.reason).toMatch(/said no/);
    await expect(assistant(ids.sam, ws, { messages: [], confirm_action_id: id })).rejects.toMatchObject({ status: 409 });
    const still = await withSystem(async db => (await db.query('SELECT priority FROM work_orders WHERE id=$1', [o.id])).rows[0].priority, ids.imran);
    expect(still).toBe(o.priority);
  });
  it('a confirmed card can not be declined', async () => {
    const o = await job();
    vi.mocked(assistantTurn).mockResolvedValue({ calls: [{ name: 'set_priority', args: { id: o.id, priority: 'low', updated_at: new Date(o.updated_at).toISOString() }, id: 'c3' }] } as any);
    const card = await ask(ids.imran, 'Make it low');
    await assistant(ids.imran, ws, { messages: [], confirm_action_id: card.pending_action.id });
    await expect(declineDecision(ids.imran, ws, card.pending_action.id)).rejects.toMatchObject({ status: 409 });
  });
  it('a change the role may not make is refused before any card and saved once with the reason', async () => {
    const o = await job({ assignee_id: ids.ravi });
    vi.mocked(assistantTurn).mockResolvedValue({ calls: [{ name: 'set_priority', args: { id: o.id, priority: 'urgent', updated_at: new Date(o.updated_at).toISOString() }, id: 'c4' }] } as any);
    const r = await ask(ids.ravi, 'Make the decision log test job urgent');
    expect(r.pending_action).toBeUndefined();
    const rows = (await listDecisions(ids.ravi, ws)).filter((d: any) => d.outcome === 'refused' && d.tool === 'set_priority');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: REFUSAL_REASON.technician, can_undo: false });
    expect(rows[0].why).toMatch(/You said/);
    expect(await listDecisions(ids.imran, ws)).not.toContainEqual(expect.objectContaining({ id: rows[0].id }));
  });
  it('a supervisor asking for an admin only change gets the admin reason', async () => {
    const o = await job();
    vi.mocked(assistantTurn).mockResolvedValue({ calls: [{ name: 'set_job_payment', args: { id: o.id, payment_status: 'paid' }, id: 'c5' }] } as any);
    await ask(ids.sam, 'Mark it paid');
    const row = (await listDecisions(ids.sam, ws)).find((d: any) => d.outcome === 'refused' && d.tool === 'set_job_payment') as any;
    expect(row?.reason).toBe(REFUSAL_REASON.admin);
  });
  it('limit is kept between 1 and 100', async () => {
    expect((await listDecisions(ids.imran, ws, 1)).length).toBeLessThanOrEqual(1);
    expect((await listDecisions(ids.imran, ws, 5000)).length).toBeLessThanOrEqual(100);
  });
});

describe('decision log words', () => {
  it('changeList returns only the fields that moved', () => {
    expect(changeList({ id: 'j', status: 'open', priority: 'normal', assignee_id: null }, { id: 'j', status: 'scheduled', priority: 'normal', assignee_id: null })).toEqual([{ field: 'status', from: 'open', to: 'scheduled' }]);
    expect(changeList({ id: 'c', record: 'client', fields: { phone: '' } }, { id: 'c', record: 'client', fields: { phone: '+971 4 000 0000' } })).toEqual([{ field: 'phone', from: null, to: '+971 4 000 0000' }]);
    expect(changeList(null, { id: 'x' })).toEqual([]);
  });
  it('filters, outcome notes and values read in plain words', () => {
    expect(matchesFilter({ outcome: 'done', undone_at: null }, 'done')).toBe(true);
    expect(matchesFilter({ outcome: 'done', undone_at: '2026-10-18' }, 'done')).toBe(false);
    expect(matchesFilter({ outcome: 'done', undone_at: '2026-10-18' }, 'undone')).toBe(true);
    expect(matchesFilter({ outcome: 'refused', undone_at: null }, 'declined')).toBe(false);
    expect(outcomeNote({ outcome: 'declined' })).toBe('You said no. Nothing was changed.');
    expect(outcomeNote({ outcome: 'refused', reason: 'Only an admin can make this change.' })).toBe('Not allowed. Only an admin can make this change.');
    expect(outcomeNote({ outcome: 'done' })).toBe('');
    expect(valueLabel('status', 'waiting_on_parts')).toBe('Waiting for parts');
    expect(valueLabel('payment_status', 'contract')).toBe('Covered by contract');
    expect(valueLabel('priority', null)).toBe('Not set');
    expect(fieldLabel('assignee')).toBe('Assigned to');
    for (const s of [outcomeNote({ outcome: 'declined' }), outcomeNote({ outcome: 'failed' }), ...Object.values(REFUSAL_REASON)]) expect(s).not.toMatch(/[-–—]/);
  });
});
