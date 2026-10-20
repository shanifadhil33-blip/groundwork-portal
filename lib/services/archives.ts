import { z } from 'zod';
import { withSystem } from '../db';
import { ApiError, missing } from '../http';
import { ARCHIVE_REPLIES, contractChoice, documentChoice, supplierChoice } from '../record-archive';
import { allow, inWorkspace, uuid } from './shared';

const office = () => new ApiError(403, 'forbidden', ARCHIVE_REPLIES.onlyOffice);

export async function archiveDocument(user: string, ws: string, id: string) {
  uuid.parse(id);
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff']);
    const row = (await c.db.query(`SELECT d.archived_at, CASE WHEN d.expires_on IS NULL THEN NULL ELSE d.expires_on - (CURRENT_TIMESTAMP AT TIME ZONE w.timezone)::date END AS days_left
      FROM company_documents d JOIN workspaces w ON w.id=d.workspace_id WHERE d.workspace_id=$1 AND d.id=$2`, [ws, id])).rows[0];
    if (!row) throw new ApiError(404, 'not_found', ARCHIVE_REPLIES.notFound);
    if (row.archived_at) return { reply: ARCHIVE_REPLIES.documentArchived };
    if (documentChoice(row.days_left == null ? null : Number(row.days_left)) !== 'archive') throw new ApiError(409, 'closed', ARCHIVE_REPLIES.documentWait);
    await c.db.query('UPDATE company_documents SET archived_at=clock_timestamp(), updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2', [ws, id]);
    return { reply: ARCHIVE_REPLIES.documentArchived };
  });
}

export async function closeSupplierOrder(user: string, ws: string, id: string) {
  uuid.parse(id);
  return withSystem(async db => {
    const m = (await db.query('SELECT role FROM members WHERE workspace_id=$1 AND user_id=$2 AND archived_at IS NULL', [ws, user])).rows[0];
    if (!m || m.role !== 'admin') throw office();
    const order = (await db.query('SELECT id, cobalt_ref, local_status, archived_at FROM supplier_orders WHERE workspace_id=$1 AND id=$2', [ws, id])).rows[0];
    if (!order) throw new ApiError(404, 'not_found', ARCHIVE_REPLIES.notFound);
    if (order.archived_at) return { reply: ARCHIVE_REPLIES.supplierArchive };
    const events = Number((await db.query('SELECT count(*)::int AS n FROM supplier_events WHERE workspace_id=$1 AND cobalt_ref=$2', [ws, order.cobalt_ref])).rows[0].n);
    const choice = supplierChoice(events, order.local_status);
    if (choice === 'delete') {
      const removed = (await db.query('DELETE FROM supplier_orders WHERE workspace_id=$1 AND id=$2 AND NOT EXISTS (SELECT 1 FROM supplier_events e WHERE e.workspace_id=$1 AND e.cobalt_ref=$3) RETURNING id', [ws, id, order.cobalt_ref])).rows[0];
      if (removed) return { reply: ARCHIVE_REPLIES.supplierDelete };
    }
    await db.query('UPDATE supplier_orders SET archived_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2', [ws, id]);
    return { reply: ARCHIVE_REPLIES.supplierArchive };
  }, user);
}

const contractBody = z.object({ finish: z.boolean() }).strict();

export async function finishContract(user: string, ws: string, id: string, input: unknown) {
  const { finish } = contractBody.parse(input);
  uuid.parse(id);
  return withSystem(async db => {
    const m = (await db.query('SELECT role FROM members WHERE workspace_id=$1 AND user_id=$2 AND archived_at IS NULL', [ws, user])).rows[0];
    if (!m || m.role !== 'admin') throw office();
    const client = (await db.query(`SELECT c.contract_ends_on::text, c.contract_archived_at,
      (c.contract_ends_on IS NOT NULL AND c.contract_ends_on < (now() AT TIME ZONE w.timezone)::date) AS ended,
      (SELECT count(*)::int FROM work_orders o WHERE o.workspace_id=c.workspace_id AND o.client_id=c.id AND o.payment_status='contract' AND o.status<>'cancelled') AS covered
      FROM clients c JOIN workspaces w ON w.id=c.workspace_id WHERE c.workspace_id=$1 AND c.id=$2`, [ws, id])).rows[0];
    if (!client) throw new ApiError(404, 'not_found', ARCHIVE_REPLIES.notFound);
    const choice = contractChoice(Number(client.covered), !!client.ended || !!client.contract_archived_at, finish);
    if (choice === 'refuse') throw new ApiError(409, 'closed', ARCHIVE_REPLIES.contractOpen);
    if (choice === 'archive') {
      await db.query('UPDATE clients SET contract_archived_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2', [ws, id]);
      return { reply: ARCHIVE_REPLIES.contractArchive };
    }
    await db.query('UPDATE clients SET contract_visits=NULL, contract_ends_on=NULL, contract_response_hours=NULL, contract_archived_at=NULL WHERE workspace_id=$1 AND id=$2', [ws, id]);
    return { reply: ARCHIVE_REPLIES.contractClear };
  }, user);
}
