import { z } from 'zod';
import { ApiError } from '../http';
import { withSystem } from '../db';
import { inWorkspace, uuid } from './shared';
import { lowRatingRecipients } from '../job-close';
import { office, sendPush } from './push';
import { useDemoRatingReader } from './demo-rating-reader';
// CMP09: the client rates a finished job, once. Low stars tell the office straight away.
const body = z.object({ stars: z.number().int().min(1).max(5), note: z.string().trim().max(1000).default('') }).strict();
export async function getRating(user: string, ws: string, id: string) {
  return inWorkspace(user, ws, async c => { uuid.parse(id);
    const w = (await c.db.query('SELECT id,status,client_id,assignee_id FROM work_orders WHERE workspace_id=$1 AND id=$2', [ws, id])).rows[0];
    if (!w) throw new ApiError(404, 'not_found', 'This job was not found.');
    let r = (await c.db.query('SELECT stars,note,created_at FROM job_ratings WHERE work_order_id=$1', [id])).rows[0] ?? null;
    // A sandbox technician can read thanks for his own work. Never return a
    // low rating through this reader or change the real account read path.
    if (!r && c.role === 'technician' && w.assignee_id === user) r = await withSystem(async db => {
      if (!await useDemoRatingReader(db, ws, user)) return null;
      return (await db.query(`SELECT r.stars,r.note,r.created_at FROM job_ratings r
        JOIN work_orders j ON j.id=r.work_order_id AND j.workspace_id=r.workspace_id
        WHERE j.workspace_id=$1 AND j.id=$2 AND j.assignee_id=$3 AND r.stars>=4`, [ws, id, user])).rows[0] ?? null;
    }, user);
    const privateLow = r && r.stars <= 2 && c.role !== 'client' && !(c.role === 'admin' || (c.role === 'staff' && c.staff_kind !== 'office'));
    return { rating: privateLow ? null : r, private: !!privateLow, can_rate: !r && w.status === 'done' && c.role === 'client' && w.client_id === c.client_id };
  });
}
export async function rateJob(user: string, ws: string, id: string, input: unknown) {
  const d = body.parse(input);
  const saved = await inWorkspace(user, ws, async c => { uuid.parse(id);
    if (c.role !== 'client') throw new ApiError(403, 'forbidden', 'Only the client can rate a job.');
    const w = (await c.db.query('SELECT id,status,client_id,title,order_number,assignee_id FROM work_orders WHERE workspace_id=$1 AND id=$2', [ws, id])).rows[0];
    if (!w || w.client_id !== c.client_id) throw new ApiError(404, 'not_found', 'This job was not found.');
    if (w.status !== 'done') throw new ApiError(409, 'not_done', 'You can rate the job once it is done.');
    const r = (await c.db.query('INSERT INTO job_ratings(work_order_id,workspace_id,client_id,rated_by,stars,note) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (work_order_id) DO NOTHING RETURNING stars,note,created_at', [id, ws, c.client_id, user, d.stars, d.note])).rows[0];
    if (!r) throw new ApiError(409, 'rated', 'This job already has a rating.');
    return { rating: r, w };
  });
  const to = d.stars <= 2
    ? lowRatingRecipients((await withSystem(db => db.query("SELECT user_id,role,staff_kind FROM members WHERE workspace_id=$1 AND archived_at IS NULL AND role IN ('admin','staff')", [ws]), user)).rows, saved.w.assignee_id)
    : (await office(ws, saved.w.client_id, null)).filter(u => u !== user);
  await sendPush(to, { title: d.stars <= 2 ? 'Low rating' : 'Job rated', body: `WO ${saved.w.order_number} ${saved.w.title}: ${d.stars} of 5${d.note ? `. ${d.note.slice(0, 120)}` : ''}`, url: `/work-orders/${id}`, tag: `rating-${id}` });
  if (d.stars <= 2) await withSystem(db => db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,work_order_title,job_step_body)
    SELECT unnest($1::uuid[]),$2,'low_rating','work_orders',$3,$4,$5`, [to, ws, id, saved.w.title, 'A client gave a low rating. Open the job.']), user);
  return { rating: saved.rating, can_rate: false };
}
