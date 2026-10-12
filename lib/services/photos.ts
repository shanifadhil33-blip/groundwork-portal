import { z } from 'zod';
import { ApiError, invalid } from '../http';
import { inWorkspace, row, uuid } from './shared';

/** Before and after photos, stored in Postgres. The phone shrinks each photo (and drops its location data) before upload. */
const PHOTO_MAX_BYTES = 600 * 1024, PHOTOS_PER_KIND = 4;
const uploadSchema = z.object({ kind: z.enum(['before', 'after']), mime: z.enum(['image/jpeg', 'image/webp']), data: z.string().min(100).max(Math.ceil(PHOTO_MAX_BYTES * 4 / 3) + 8), width: z.number().int().min(1).max(4000), height: z.number().int().min(1).max(4000) }).strict();

function looksLike(mime: string, b: Buffer) {
  if (mime === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
}

export async function listPhotos(user: string, ws: string, workOrderId: string) {
  return inWorkspace(user, ws, async c => {
    await row(c, 'work_orders', workOrderId);
    return (await c.db.query('SELECT id, kind, width, height, taken_by, created_at, (taken_by = app_user_id()) AS mine FROM job_photos WHERE workspace_id=$1 AND work_order_id=$2 ORDER BY kind DESC, created_at', [ws, workOrderId])).rows;
  });
}

export async function addPhoto(user: string, ws: string, workOrderId: string, body: unknown) {
  const d = uploadSchema.parse(body);
  const bytes = Buffer.from(d.data, 'base64');
  if (bytes.length < 100 || bytes.length > PHOTO_MAX_BYTES) throw invalid('This photo is too big. Try again.', 'data');
  if (!looksLike(d.mime, bytes)) throw invalid('This file is not a photo.', 'data');
  return inWorkspace(user, ws, async c => {
    if (c.role === 'client') throw new ApiError(403, 'forbidden', 'Only the team adds photos.');
    const job = await row(c, 'work_orders', workOrderId, true);
    if (job.status === 'cancelled') throw invalid('This job is cancelled.', 'kind');
    const n = (await c.db.query('SELECT count(*)::int n FROM job_photos WHERE workspace_id=$1 AND work_order_id=$2 AND kind=$3', [ws, workOrderId, d.kind])).rows[0].n;
    if (n >= PHOTOS_PER_KIND) throw invalid(`You can add ${PHOTOS_PER_KIND} ${d.kind} photos. Remove one first.`, 'kind');
    return (await c.db.query('INSERT INTO job_photos(workspace_id,client_id,work_order_id,kind,mime,bytes,width,height,taken_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,app_user_id()) RETURNING id, kind, width, height, created_at, true AS mine', [ws, job.client_id, workOrderId, d.kind, d.mime, bytes, d.width, d.height])).rows[0];
  });
}

export async function getPhoto(user: string, ws: string, workOrderId: string, photoId: string) {
  uuid.parse(photoId);
  return inWorkspace(user, ws, async c => {
    const p = (await c.db.query('SELECT mime, bytes FROM job_photos WHERE workspace_id=$1 AND work_order_id=$2 AND id=$3', [ws, workOrderId, photoId])).rows[0];
    if (!p) throw new ApiError(404, 'not_found', 'Photo not found.');
    return p as { mime: string; bytes: Buffer };
  });
}

export async function removePhoto(user: string, ws: string, workOrderId: string, photoId: string) {
  uuid.parse(photoId);
  return inWorkspace(user, ws, async c => {
    const job = await row(c, 'work_orders', workOrderId);
    if (c.role === 'technician' && job.status === 'done') throw new ApiError(403, 'forbidden', 'This job is done. Ask a supervisor to change its photos.');
    const r = await c.db.query('DELETE FROM job_photos WHERE workspace_id=$1 AND work_order_id=$2 AND id=$3 RETURNING id', [ws, workOrderId, photoId]);
    if (!r.rowCount) throw new ApiError(404, 'not_found', 'Photo not found.');
    return { removed: photoId };
  });
}

/** Proof of the work: a technician needs at least one after photo to mark his job done. */
export async function hasAfterPhoto(db: { query: (q: string, v: unknown[]) => Promise<{ rows: { n: number }[] }> }, ws: string, workOrderId: string) {
  return (await db.query("SELECT count(*)::int n FROM job_photos WHERE workspace_id=$1 AND work_order_id=$2 AND kind='after'", [ws, workOrderId])).rows[0].n > 0;
}
