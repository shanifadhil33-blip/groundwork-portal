import { z } from 'zod';
import { ApiError } from '../http';
import { inWorkspace, uuid } from './shared';
import { office, sendPush } from './push';
// CMP09: the client rates a finished job, once. Low stars tell the office straight away.
const body = z.object({ stars: z.number().int().min(1).max(5), note: z.string().trim().max(1000).default('') }).strict();
export async function getRating(user: string, ws: string, id: string) {
  return inWorkspace(user, ws, async c => { uuid.parse(id);
    const w = (await c.db.query('SELECT id,status,client_id FROM work_orders WHERE workspace_id=$1 AND id=$2', [ws, id])).rows[0];
    if (!w) throw new ApiError(404, 'not_found', 'This job was not found.');
    const r = (await c.db.query('SELECT stars,note,created_at FROM job_ratings WHERE work_order_id=$1', [id])).rows[0] ?? null;
    return { rating: r, can_rate: !r && w.status === 'done' && c.role === 'client' && w.client_id === c.client_id };
  });
}
export async function rateJob(user: string, ws: string, id: string, input: unknown) {
  const d = body.parse(input);
  const saved = await inWorkspace(user, ws, async c => { uuid.parse(id);
    if (c.role !== 'client') throw new ApiError(403, 'forbidden', 'Only the client can rate a job.');
    const w = (await c.db.query('SELECT id,status,client_id,title,order_number FROM work_orders WHERE workspace_id=$1 AND id=$2', [ws, id])).rows[0];
    if (!w || w.client_id !== c.client_id) throw new ApiError(404, 'not_found', 'This job was not found.');
    if (w.status !== 'done') throw new ApiError(409, 'not_done', 'You can rate the job once it is done.');
    const r = (await c.db.query('INSERT INTO job_ratings(work_order_id,workspace_id,client_id,rated_by,stars,note) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (work_order_id) DO NOTHING RETURNING stars,note,created_at', [id, ws, c.client_id, user, d.stars, d.note])).rows[0];
    if (!r) throw new ApiError(409, 'rated', 'This job already has a rating.');
    return { rating: r, w };
  });
  const to = (await office(ws, saved.w.client_id, null)).filter(u => u !== user);
  await sendPush(to, { title: d.stars <= 2 ? 'Low rating' : 'Job rated', body: `WO ${saved.w.order_number} ${saved.w.title}: ${d.stars} of 5${d.note ? `. ${d.note.slice(0, 120)}` : ''}`, url: `/work-orders/${id}`, tag: `rating-${id}` });
  return { rating: saved.rating, can_rate: false };
}
