import { z } from 'zod';
import type { PoolClient } from 'pg';
import { withSystem } from '../db';
import { ApiError, missing } from '../http';
import { allow, inWorkspace, uuid } from './shared';

const correction = z.object({ body: z.string().trim().min(1).max(300) }).strict();

async function member(db: PoolClient, user: string, ws: string) {
  uuid.parse(ws);
  const m = (await db.query(`SELECT role,staff_kind FROM members
    WHERE workspace_id=$1 AND user_id=$2 AND archived_at IS NULL`, [ws, user])).rows[0];
  if (!m) throw missing();
  return m;
}

/** Only shared instructions and their provenance cross this boundary. Never personal Agent history. */
export async function listCompanyMemory(user: string, ws: string) {
  return withSystem(async db => {
    const m = await member(db, user, ws);
    if (m.role !== 'admin' && !(m.role === 'staff' && m.staff_kind !== 'office')) {
      throw new ApiError(403, 'forbidden', 'Company Memory is for owners, admins and supervisors.');
    }
    const data = (await db.query(`SELECT r.id,r.body,r.created_at,
        u.name AS recorded_by,
        (SELECT count(*)::int FROM audit_log a WHERE a.workspace_id=r.workspace_id
          AND a.entity='company_rules' AND a.entity_id=r.id AND a.action='memory_used') AS context_uses
      FROM company_rules r JOIN users u ON u.id=r.created_by
      WHERE r.workspace_id=$1 ORDER BY r.created_at DESC,r.id`, [ws])).rows;
    return { data, can_edit: m.role === 'admin' };
  }, user);
}

/** Fresh context for each Agent request. A use means supplied to the Agent, not proof it changed a decision.
 * The existing audit ledger records only company rule ids, never a person's question or private notes.
 */
export async function companyMemoryContext(user: string, ws: string): Promise<string[]> {
  return withSystem(async db => {
    const m = await member(db, user, ws);
    // Match the existing company_rules SELECT policy, including its exclusion of clients.
    if (!['admin', 'staff', 'technician'].includes(m.role)) return [];
    const rules = (await db.query(`SELECT id,body FROM company_rules WHERE workspace_id=$1
      ORDER BY created_at DESC,id LIMIT 5 FOR SHARE`, [ws])).rows;
    for (const rule of rules) {
      await db.query(`INSERT INTO audit_log(workspace_id,actor_id,actor_kind,action,entity,entity_id)
        VALUES($1,$2,'assistant','memory_used','company_rules',$3)`, [ws, user, rule.id]);
    }
    return rules.map(r => String(r.body).slice(0, 200));
  }, user);
}

/** Retire the incorrect instruction immediately. Its replacement waits in the existing approval queue.
 * Deletion and proposal are atomic; a failed proposal cannot silently remove the original.
 */
export async function correctCompanyMemory(user: string, ws: string, id: string, input: unknown) {
  uuid.parse(id);
  const d = correction.parse(input);
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin']);
    const old = (await c.db.query('SELECT body FROM company_rules WHERE workspace_id=$1 AND id=$2 FOR UPDATE', [ws, id])).rows[0];
    if (!old) throw missing();
    if (old.body === d.body) return { status: 'unchanged' };
    await c.db.query(`INSERT INTO lesson_proposals(workspace_id,proposed_by,proposed_by_name,body,scope,reason)
      VALUES($1,$2,(SELECT name FROM visible_user($2)),$3,'company','company')
      ON CONFLICT (workspace_id,proposed_by,body) WHERE status='waiting' DO NOTHING`, [ws, user, d.body]);
    await c.db.query('DELETE FROM company_rules WHERE workspace_id=$1 AND id=$2', [ws, id]);
    return { status: 'waiting' };
  });
}

export async function deleteCompanyMemory(user: string, ws: string, id: string) {
  uuid.parse(id);
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin']);
    const deleted = await c.db.query('DELETE FROM company_rules WHERE workspace_id=$1 AND id=$2 RETURNING id', [ws, id]);
    if (!deleted.rowCount) throw missing();
    return { deleted: true };
  });
}
