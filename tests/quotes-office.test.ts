import './fixtures';
import { afterAll, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { sendQuote, decideQuote, confirmVisit } from '../lib/services/quotes';
import { getWorkOrder, patchWorkOrder, listWorkOrders } from '../lib/services/work-orders';
import { suggestWorkers } from '../lib/services/assign';
import { callTool } from '../lib/agent/tools';
const ws = ids.ridgeline;
afterAll(closePools);
const harborJob = () => withSystem(async db => (await db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND client_id=$2 AND status NOT IN ('done','cancelled') ORDER BY order_number DESC LIMIT 1", [ws, ids.harbor])).rows[0].id as string);
it('the office sends a price; only the client answers it, once', async () => {
  const id = await harborJob();
  await expect(sendQuote(ids.pranav, ws, id, { amount: 100 })).rejects.toMatchObject({ status: 403 });
  await sendQuote(ids.nabil, ws, id, { amount: 450, note: 'Parts and labour' });
  await expect(decideQuote(ids.sam, ws, id, { decision: 'approved' })).rejects.toMatchObject({ status: 403 });
  const r: any = await callTool({ user: ids.kevin, ws, scope: 'write', kind: 'assistant' }, 'answer_quote', { id, decision: 'approved' });
  expect(r.isError).toBeUndefined();
  expect((await getWorkOrder(ids.pranav, ws, id) as any).quote_status).toBe('approved');
  await expect(decideQuote(ids.pranav, ws, id, { decision: 'declined' })).rejects.toMatchObject({ status: 409 });
});
it('a client confirms a booked visit; a household only on his own request', async () => {
  const id = await harborJob();
  const o: any = await getWorkOrder(ids.imran, ws, id);
  await patchWorkOrder(ids.imran, ws, id, { scheduled_for: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), updated_at: new Date(o.updated_at).toISOString() });
  const v: any = await confirmVisit(ids.pranav, ws, id);
  expect(v.visit_confirmed_for).toBeTruthy();
  await expect(confirmVisit(ids.faisal, ws, id)).rejects.toMatchObject({ status: 404 });
  const mine: any = await listWorkOrders(ids.faisal, ws, new URLSearchParams('pageSize=100&active=false'));
  expect(mine.total).toBeGreaterThan(0);
  expect(mine.data.every((x: any) => x.client_id === ids.northgate)).toBe(true);
});
it('office staff book only the Best match person', async () => {
  const id = await withSystem(async db => (await db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND status IN ('open','scheduled') AND trade IS NOT NULL ORDER BY order_number LIMIT 1", [ws])).rows[0]?.id as string | undefined);
  if (!id) return;
  const s: any = await suggestWorkers(ids.nabil, ws, id);
  const best = s.workers.find((w: any) => !w.off && (w.trade_match || w.area_match));
  const other = s.workers.find((w: any) => w.user_id !== best?.user_id);
  let o: any = await getWorkOrder(ids.nabil, ws, id);
  if (other) await expect(patchWorkOrder(ids.nabil, ws, id, { assignee_id: other.user_id, updated_at: new Date(o.updated_at).toISOString() })).rejects.toMatchObject({ status: 403 });
  if (best) { o = await patchWorkOrder(ids.nabil, ws, id, { assignee_id: best.user_id, updated_at: new Date(o.updated_at).toISOString() }); expect(o.assignee_id).toBe(best.user_id); }
});
