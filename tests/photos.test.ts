import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { setAuthResolverForTests } from '../lib/auth';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { addPhoto, getPhoto, listPhotos, removePhoto } from '../lib/services/photos';
import { getWorkOrder, patchWorkOrder } from '../lib/services/work-orders';
import { tools } from '../lib/agent/tools';
import * as photoRoute from '../app/api/workspaces/[ws]/work-orders/[id]/photos/[photoId]/route';
let user: string | null = ids.ravi;
beforeEach(() => { user = ids.ravi; setAuthResolverForTests(async () => user); });
const jpeg = (n = 400) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 7)]).toString('base64');
const ravisJob = async (status: string) => (await withSystem(db => db.query('SELECT id, client_id FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 AND status=$3 LIMIT 1', [ids.ridgeline, ids.ravi, status]))).rows[0];
const made: string[] = [];
afterAll(async () => { setAuthResolverForTests(); await withSystem(db => db.query('DELETE FROM job_photos WHERE id=ANY($1::uuid[])', [made])); await closePools(); });
describe('before and after photos', () => {
  it('the assigned technician adds a photo; the office and that client see it; nobody else does', async () => {
    const j = await ravisJob('in_progress');
    const p = await addPhoto(ids.ravi, ids.ridgeline, j.id, { kind: 'before', mime: 'image/jpeg', data: jpeg(), width: 10, height: 10 }); made.push(p.id);
    expect((await listPhotos(ids.imran, ids.ridgeline, j.id)).map(x => x.id)).toContain(p.id);
    const owner = (await withSystem(db => db.query("SELECT user_id FROM members WHERE workspace_id=$1 AND role='client' AND client_id=$2 LIMIT 1", [ids.ridgeline, j.client_id]))).rows[0]?.user_id;
    if (owner) expect((await listPhotos(owner, ids.ridgeline, j.id)).length).toBeGreaterThan(0);
    const other = [ids.pranav, ids.omar].find(u => u !== owner)!;
    await expect(listPhotos(other, ids.ridgeline, j.id)).rejects.toThrow();
    await expect(listPhotos(ids.summitAdmin, ids.ridgeline, j.id)).rejects.toThrow();
    const bytes = await getPhoto(ids.sam, ids.ridgeline, j.id, p.id); expect(bytes.mime).toBe('image/jpeg');
  });
  it('rejects files that are not photos, too big, or too many; clients cannot add', async () => {
    const j = await ravisJob('in_progress');
    await expect(addPhoto(ids.ravi, ids.ridgeline, j.id, { kind: 'after', mime: 'image/jpeg', data: Buffer.alloc(500, 1).toString('base64'), width: 1, height: 1 })).rejects.toThrow('not a photo');
    await expect(addPhoto(ids.ravi, ids.ridgeline, j.id, { kind: 'after', mime: 'image/jpeg', data: jpeg(700 * 1024), width: 1, height: 1 })).rejects.toThrow();
    await expect(addPhoto(ids.pranav, ids.ridgeline, j.id, { kind: 'after', mime: 'image/jpeg', data: jpeg(), width: 1, height: 1 })).rejects.toThrow();
    for (let i = 0; i < 4; i++) made.push((await addPhoto(ids.sam, ids.ridgeline, j.id, { kind: 'after', mime: 'image/jpeg', data: jpeg(), width: 1, height: 1 })).id);
    await expect(addPhoto(ids.sam, ids.ridgeline, j.id, { kind: 'after', mime: 'image/jpeg', data: jpeg(), width: 1, height: 1 })).rejects.toThrow('Remove one first');
    await withSystem(db => db.query("DELETE FROM job_photos WHERE work_order_id=$1 AND kind='after'", [j.id]));
  });
  it('a technician needs an after photo to mark done; the office does not', async () => {
    const j = await ravisJob('in_progress');
    await withSystem(db => db.query("DELETE FROM job_photos WHERE work_order_id=$1 AND kind='after'", [j.id]));
    let o = await getWorkOrder(ids.ravi, ids.ridgeline, j.id);
    await expect(patchWorkOrder(ids.ravi, ids.ridgeline, j.id, { status: 'done', updated_at: new Date(o.updated_at).toISOString() })).rejects.toThrow('after photo');
    const a = await addPhoto(ids.ravi, ids.ridgeline, j.id, { kind: 'after', mime: 'image/jpeg', data: jpeg(), width: 1, height: 1 }); made.push(a.id);
    o = await getWorkOrder(ids.ravi, ids.ridgeline, j.id);
    const done = await patchWorkOrder(ids.ravi, ids.ridgeline, j.id, { status: 'done', updated_at: new Date(o.updated_at).toISOString() });
    expect(done.status).toBe('done');
    await expect(removePhoto(ids.ravi, ids.ridgeline, j.id, a.id)).rejects.toThrow('done');
  });
  it('a technician removes only his own photo; the image route sends safe headers', async () => {
    const j = await ravisJob('in_progress') ?? await ravisJob('scheduled');
    const sams = await addPhoto(ids.sam, ids.ridgeline, j.id, { kind: 'before', mime: 'image/jpeg', data: jpeg(), width: 1, height: 1 }); made.push(sams.id);
    await expect(removePhoto(ids.ravi, ids.ridgeline, j.id, sams.id)).rejects.toThrow();
    const r = await photoRoute.GET(new Request('http://localhost/x'), { params: Promise.resolve({ ws: ids.ridgeline, id: j.id, photoId: sams.id }) });
    expect(r.headers.get('content-type')).toBe('image/jpeg'); expect(r.headers.get('x-content-type-options')).toBe('nosniff'); expect(r.headers.get('cache-control')).toContain('private');
    expect(tools.list_job_photos.write).toBe(false);
  });
});
