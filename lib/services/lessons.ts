import { z } from 'zod';
import { ApiError, missing } from '../http';
import { inWorkspace, uuid } from './shared';
/** LEARN12: lessons waiting for an admin or owner yes. Admins see the company's; everyone else sees only his own. */
export async function listLessons(user: string, ws: string) {
 return inWorkspace(user, ws, async c => ({ data: (await c.db.query(`SELECT l.id,l.body,l.scope,l.reason,l.status,l.created_at,coalesce(l.proposed_by_name,'Someone') AS proposed_by_name,(l.proposed_by=$2) AS mine
  FROM lesson_proposals l WHERE l.workspace_id=$1 AND l.status='waiting' ORDER BY l.created_at`, [ws, user])).rows, can_decide: c.role === 'admin' }));
}
const decision = z.object({ yes: z.boolean() }).strict();
export async function decideLesson(user: string, ws: string, id: string, body: unknown) {
 uuid.parse(id); const { yes } = decision.parse(body);
 return inWorkspace(user, ws, async c => {
  if (c.role !== 'admin') throw new ApiError(403, 'forbidden', 'Only an admin or the owner decides a lesson.');
  const r = (await c.db.query('SELECT decide_lesson($1,$2) AS r', [id, yes])).rows[0].r as string;
  if (r === 'missing') throw missing(); if (r === 'forbidden') throw new ApiError(403, 'forbidden', 'Only an admin or the owner decides a lesson.');
  if (r !== (yes ? 'approved' : 'declined')) throw new ApiError(409, 'decided', 'This lesson was already decided.');
  return { status: r, reply: yes ? 'Saved. The agent will use this lesson.' : 'Declined. Nothing was saved.' };
 });
}
