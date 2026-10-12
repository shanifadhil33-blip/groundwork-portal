import { z } from 'zod';
import { ApiError } from '../http';
import { withSystem } from '../db';
import { allow, inWorkspace, row, uuid, type Context } from './shared';

export const PAYMENT_LABELS: Record<string, string> = { to_bill: 'To bill', contract: 'Covered by contract', paid: 'Paid' };
const schema = z.object({ payment_status: z.enum(['to_bill', 'contract', 'paid']) }).strict();

/** Contract visits used and allowed for a client, and whether the contract has ended. */
export async function contractUse(c: Context, clientId: string) {
  const r = (await c.db.query(
    `SELECT cl.contract_visits AS allowed, cl.contract_ends_on::text AS ends_on,
      (cl.contract_ends_on IS NOT NULL AND cl.contract_ends_on < (now() AT TIME ZONE w.timezone)::date) AS ended,
      (SELECT count(*)::int FROM work_orders o WHERE o.workspace_id=cl.workspace_id AND o.client_id=cl.id AND o.payment_status='contract' AND o.status<>'cancelled') AS used
     FROM clients cl JOIN workspaces w ON w.id=cl.workspace_id WHERE cl.workspace_id=$1 AND cl.id=$2`, [c.ws, clientId])).rows[0];
  return r ? { allowed: r.allowed as number | null, used: r.used as number, ends_on: r.ends_on as string | null, ended: !!r.ended } : null;
}

/** One plain sentence about the contract for the confirmation card, so the admin decides with the facts. */
export function contractNote(use: Awaited<ReturnType<typeof contractUse>>, adding = true) {
  if (!use) return '';
  const next = use.used + (adding ? 1 : 0);
  if (use.ended) return `The contract ended on ${use.ends_on}. Check before you confirm.`;
  if (use.allowed === null) return `This will be contract visit ${next}.`;
  if (next > use.allowed) return `The contract allows ${use.allowed} visits and this would be visit ${next}. Check before you confirm.`;
  return `This will be contract visit ${next} of ${use.allowed}.`;
}

/**
 * Payment for a job, set by an admin (it changes billing). Works on finished jobs too, because payment is often settled
 * after the work. A job covered by the contract leaves the to bill list, counts as a contract visit and shows
 * "Covered by contract" in the client's history.
 */
export async function setJobPayment(user: string, ws: string, id: string, body: unknown) {
  return inWorkspace(user, ws, async c => {
    uuid.parse(id);
    const seen = await row(c, 'work_orders', id);
    if (c.role !== 'admin') throw new ApiError(403, 'forbidden', 'Only an admin can change how a job is paid. Ask your admin.');
    const { payment_status } = schema.parse(body);
    // No row lock for a finished job: the owner connection below must be able to write it.
    const order = seen.status === 'done' ? seen : await row(c, 'work_orders', id, true);
    if (order.status === 'cancelled') throw new ApiError(422, 'invalid', 'This job was cancelled, so there is nothing to pay.');
    // Finished jobs are locked for everyone, but payment is settled after the work. The admin check above is the gate;
    // the owner connection changes only this one column, with the admin recorded as the actor.
    const saved = order.status === 'done'
      ? await withSystem(async db => (await db.query('UPDATE work_orders SET payment_status=$3 WHERE workspace_id=$1 AND id=$2 RETURNING id, order_number, title, client_id, status, payment_status', [ws, id, payment_status])).rows[0], user)
      : (await c.db.query('UPDATE work_orders SET payment_status=$3 WHERE workspace_id=$1 AND id=$2 RETURNING id, order_number, title, client_id, status, payment_status', [ws, id, payment_status])).rows[0];
    return { ...saved, payment_label: PAYMENT_LABELS[payment_status], contract: await contractUse(c, saved.client_id) };
  });
}
export async function getContractUse(user: string, ws: string, clientId: string) {
  return inWorkspace(user, ws, async c => { allow(c, ['admin', 'staff']); await row(c, 'clients', clientId); return contractUse(c, clientId); });
}
