import './fixtures';
import { afterAll, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { sendQuote, decideQuote, confirmVisit } from '../lib/services/quotes';
import { getWorkOrder, patchWorkOrder } from '../lib/services/work-orders';
import { callTool } from '../lib/agent/tools';
const ws = ids.ridgeline;
afterAll(closePools);
// Audit A1 (Oct 18): a home has no facility manager, so the household answers prices and visit times on his own requests.
it('a household is told about a price on his own request, answers it and confirms the visit', async () => {
  const id = await withSystem(async db => (await db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND client_id=$2 AND status IN ('open','scheduled') ORDER BY order_number DESC LIMIT 1", [ws, ids.northgate])).rows[0]?.id as string);
  expect(id).toBeTruthy();
  await withSystem(db => db.query('UPDATE work_orders SET created_by=$3 WHERE workspace_id=$1 AND id=$2', [ws, id, ids.faisal]));
  const o: any = await getWorkOrder(ids.imran, ws, id);
  await patchWorkOrder(ids.imran, ws, id, { scheduled_for: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10), updated_at: new Date(o.updated_at).toISOString() });
  await sendQuote(ids.imran, ws, id, { amount: 150 });
  const told = await withSystem(db => db.query("SELECT 1 FROM notifications WHERE user_id=$1 AND entity_id=$2 AND kind='quote_sent'", [ids.faisal, id]));
  expect(told.rowCount).toBe(1);
  const r: any = await callTool({ user: ids.faisal, ws, scope: 'write', kind: 'assistant' }, 'answer_quote', { id, decision: 'approved' });
  expect(r.isError).toBeUndefined();
  expect(((await getWorkOrder(ids.faisal, ws, id)) as any).quote_status).toBe('approved');
  const v: any = await confirmVisit(ids.faisal, ws, id);
  expect(v.visit_confirmed_for).toBeTruthy();
});
it('a household still can not answer for a job he did not ask for', async () => {
  const id = await withSystem(async db => (await db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND client_id=$2 AND status IN ('open','scheduled') AND created_by IS DISTINCT FROM $3 ORDER BY order_number LIMIT 1", [ws, ids.northgate, ids.faisal])).rows[0]?.id as string | undefined);
  if (!id) return;
  await withSystem(db => db.query("UPDATE work_orders SET quote_amount=90, quote_status='pending' WHERE workspace_id=$1 AND id=$2", [ws, id]));
  await expect(decideQuote(ids.faisal, ws, id, { decision: 'approved' })).rejects.toMatchObject({ status: expect.any(Number) });
});
