import './fixtures';
import { afterAll, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids, siteId } from '../scripts/seed';
import { archiveMember, unarchiveMember, memberImpact, changeMember } from '../lib/services/members';
import { restoreJob, jobImpact, deleteJob } from '../lib/services/job-records';
import { createWorkOrder, patchWorkOrder, getWorkOrder, createComment } from '../lib/services/work-orders';
import { teamToday } from '../lib/services/team';
import { listWorkspaces } from '../lib/services/workspaces';
const ws = ids.ridgeline;
afterAll(closePools);
it('archives a former team member, keeps history, blocks access, and unarchive gives open jobs back', async () => {
  const before = await memberImpact(ids.imran, ws, ids.ravi);
  expect(before.can_delete).toBe(false);
  await expect(changeMember(ids.imran, ws, ids.ravi)).rejects.toMatchObject({ status: 409 });
  await expect(archiveMember(ids.sam, ws, ids.ravi)).rejects.toMatchObject({ status: 403 });
  await expect(archiveMember(ids.imran, ws, ids.imran)).rejects.toBeTruthy();
  const r = await archiveMember(ids.imran, ws, ids.ravi);
  expect(r.unassigned).toBe(before.open_jobs);
  try {
    expect((await listWorkspaces(ids.ravi)).some((w: any) => w.id === ws)).toBe(false);
    expect(((await teamToday(ids.imran, ws)) as any[]).some(p => p.user_id === ids.ravi)).toBe(false);
    const done = await withSystem(async db => Number((await db.query("SELECT count(*) n FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 AND status IN ('done','cancelled')", [ws, ids.ravi])).rows[0].n));
    expect(done).toBe(before.jobs - before.open_jobs);
  } finally {
    const back = await unarchiveMember(ids.imran, ws, ids.ravi);
    expect(back.jobs_back).toBe(before.open_jobs);
  }
  expect((await listWorkspaces(ids.ravi)).some((w: any) => w.id === ws)).toBe(true);
});
it('cancel is undone by restore, and only a job with no activity can be deleted', async () => {
  const job: any = await createWorkOrder(ids.sam, ws, { title: 'Made by mistake', site_id: siteId(1) });
  expect((await jobImpact(ids.sam, ws, job.id)).can_delete).toBe(true);
  const cancelled: any = await patchWorkOrder(ids.sam, ws, job.id, { status: 'cancelled', updated_at: job.updated_at.toISOString?.() ?? job.updated_at });
  expect(cancelled.status).toBe('cancelled');
  expect((await restoreJob(ids.sam, ws, job.id, { status: 'open' })).status).toBe('open');
  expect((await jobImpact(ids.sam, ws, job.id)).can_delete).toBe(false);
  const fresh: any = await createWorkOrder(ids.sam, ws, { title: 'Second mistake', site_id: siteId(1) });
  await expect(deleteJob(ids.ravi, ws, fresh.id)).rejects.toBeTruthy();
  expect(await deleteJob(ids.sam, ws, fresh.id)).toEqual({ deleted: true });
  await expect(getWorkOrder(ids.sam, ws, fresh.id)).rejects.toMatchObject({ status: 404 });
  const noted: any = await createWorkOrder(ids.sam, ws, { title: 'Has a note', site_id: siteId(1) });
  await createComment(ids.sam, ws, noted.id, { body: 'Checked it', visibility: 'internal' });
  await expect(deleteJob(ids.sam, ws, noted.id)).rejects.toMatchObject({ status: 409 });
});
