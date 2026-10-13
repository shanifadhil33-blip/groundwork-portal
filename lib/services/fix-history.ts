import { z } from 'zod';
import { ApiError } from '../http';
import { inWorkspace, uuid } from './shared';

/** ROLE09: the client facility manager's full fix history. Finished jobs for his company only: problem, fix, who, when and the cost paid. */
const schema = z.object({ site_id: uuid.optional(), limit: z.number().int().min(1).max(50).optional() }).strict();
export async function fixHistory(user: string, ws: string, body: unknown = {}) {
  const a = schema.parse(body);
  return inWorkspace(user, ws, async c => {
    if (c.role !== 'client' || (c.client_kind ?? 'manager') !== 'manager') throw new ApiError(403, 'forbidden', 'The fix history is for your facility manager.');
    const currency=(await c.db.query('SELECT currency FROM workspaces WHERE id=$1',[ws])).rows[0].currency;
    const rows = (await c.db.query(`SELECT w.assignee_id,w.order_number, w.title, s.name AS site, coalesce(w.report_problem, w.description) AS problem, w.report_work AS fix, w.report_outcome AS outcome,
      (SELECT a.name FROM visible_assignee(w.workspace_id, w.id) a) AS technician_name, coalesce(w.report_at, w.updated_at) AS finished_at,
      CASE WHEN w.quote_status = 'approved' THEN w.quote_amount END AS price, coalesce(w.payment_status, 'to_bill') AS payment
      FROM work_orders w JOIN sites s ON s.workspace_id = w.workspace_id AND s.id = w.site_id
      WHERE w.workspace_id = $1 AND w.client_id = $2 AND w.status = 'done' AND ($3::uuid IS NULL OR w.site_id = $3)
      ORDER BY coalesce(w.report_at, w.updated_at) DESC LIMIT $4`, [ws, c.client_id, a.site_id ?? null, a.limit ?? 20])).rows;
    return rows.map(r => ({ ...r,technician:r.technician_name,currency, cost: r.payment === 'contract' ? 'Covered by contract' : r.price != null ? `${currency} ${Number(r.price).toFixed(2)}${r.payment === 'paid' ? ', paid' : ', not paid yet'}` : r.payment === 'paid' ? 'Paid' : 'No price on record' }));
  });
}
