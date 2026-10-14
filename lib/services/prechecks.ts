import { z } from 'zod';
import { ApiError } from '../http';
import { inWorkspace, uuid } from './shared';
import { PRECHECK, precheckState } from '../precheck';
import { office, sendPush } from './push';
const keys = PRECHECK.map(p => p.key) as [string, ...string[]];
const body = z.object({ answers: z.partialRecord(z.enum(keys), z.boolean()), note: z.string().trim().max(1000).default('') }).strict();
export async function getPrecheck(user: string, ws: string, id: string) {
  return inWorkspace(user, ws, async c => { uuid.parse(id);
    const w = (await c.db.query('SELECT id,status,client_id FROM work_orders WHERE workspace_id=$1 AND id=$2', [ws, id])).rows[0];
    if (!w) throw new ApiError(404, 'not_found', 'This job was not found.');
    const r = (await c.db.query('SELECT answers,note,updated_at FROM job_prechecks WHERE work_order_id=$1', [id])).rows[0] ?? null;
    return { precheck: r, ...precheckState(r?.answers), can_answer: c.role === 'client' && w.client_id === c.client_id && ['open', 'scheduled'].includes(w.status) };
  });
}
export async function savePrecheck(user: string, ws: string, id: string, input: unknown) {
  const d = body.parse(input);
  const out = await inWorkspace(user, ws, async c => { uuid.parse(id);
    if (c.role !== 'client') throw new ApiError(403, 'forbidden', 'Only the client answers the visit check.');
    const w = (await c.db.query('SELECT id,status,client_id,title,order_number,assignee_id FROM work_orders WHERE workspace_id=$1 AND id=$2', [ws, id])).rows[0];
    if (!w || w.client_id !== c.client_id) throw new ApiError(404, 'not_found', 'This job was not found.');
    if (!['open', 'scheduled'].includes(w.status)) throw new ApiError(409, 'started', 'The visit has already started.');
    const r = (await c.db.query(`INSERT INTO job_prechecks(work_order_id,workspace_id,client_id,answered_by,answers,note) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT (work_order_id) DO UPDATE SET answers=EXCLUDED.answers,note=EXCLUDED.note,answered_by=EXCLUDED.answered_by,updated_at=now() RETURNING answers,note,updated_at`, [id, ws, c.client_id, user, JSON.stringify(d.answers), d.note])).rows[0];
    return { r, w };
  });
  const s = precheckState(out.r.answers);
  // Only a problem is worth a ping: a full yes stays quiet (no notification floods).
  if (!s.ready) await sendPush([out.w.assignee_id, ...(await office(ws, out.w.client_id, null))].filter(u => u && u !== user), { title: 'Visit check: not ready', body: `WO ${out.w.order_number} ${out.w.title}: ${s.missing.join(', ')}`, url: `/work-orders/${id}`, tag: `precheck-${id}` });
  return { precheck: out.r, ...s, can_answer: true };
}
