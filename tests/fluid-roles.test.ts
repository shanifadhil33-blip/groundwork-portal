import './fixtures';
import { afterAll, afterEach, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { setMemberRoles, splitRoles } from '../lib/services/members';
import { suggestWorkers } from '../lib/services/assign';
import { myDay } from '../lib/services/my-day';
import { allRoles, doesJobs, rolesLabel } from '../lib/roles';
const ws = ids.ridgeline;
afterEach(async () => { await withSystem(db => db.query("UPDATE members SET role='admin', extra_roles='{}' WHERE workspace_id=$1 AND user_id=$2", [ws, ids.imran])); await withSystem(db => db.query("UPDATE members SET role='staff', extra_roles='{}' WHERE workspace_id=$1 AND user_id=$2", [ws, ids.sam])); });
afterAll(closePools);
it('splits roles into the highest main role plus extras, and labels them plainly', () => {
  expect(splitRoles(['technician', 'admin'])).toEqual({ role: 'admin', extra_roles: ['technician'], staff_kind: null });
  expect(rolesLabel({ role: 'admin', extra_roles: ['staff', 'technician'] })).toBe('Admin, Supervisor and Technician');
  expect(doesJobs({ role: 'admin', extra_roles: ['technician'] })).toBe(true); expect(allRoles({ role: 'staff' })).toEqual(['staff']);
});
it('an admin can hold every role, is then suggested for jobs and has a day of his own; only admins change roles', async () => {
  await expect(setMemberRoles(ids.sam, ws, ids.imran, { roles: ['admin', 'technician'] })).rejects.toMatchObject({ status: 403 });
  const saved = await setMemberRoles(ids.imran, ws, ids.imran, { roles: ['admin', 'staff', 'technician'] });
  expect(saved).toMatchObject({ role: 'admin', extra_roles: ['staff', 'technician'] });
  const job = await withSystem(async db => (await db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND status IN ('open','scheduled') LIMIT 1", [ws])).rows[0]);
  const s = await suggestWorkers(ids.imran, ws, job.id);
  expect(s.workers.some((w: any) => w.user_id === ids.imran)).toBe(true);
  await expect(myDay(ids.imran, ws)).resolves.toBeTruthy();
});
it('keeps at least one admin and at least one role', async () => {
  await expect(setMemberRoles(ids.imran, ws, ids.imran, { roles: ['technician'] })).rejects.toMatchObject({ status: 409 });
  await expect(setMemberRoles(ids.imran, ws, ids.sam, { roles: [] })).rejects.toBeTruthy();
  await expect(setMemberRoles(ids.imran, ws, ids.pranav, { roles: ['technician'] })).rejects.toMatchObject({ status: 422 });
  expect(await setMemberRoles(ids.imran, ws, ids.sam, { roles: ['staff', 'technician'] })).toMatchObject({ role: 'staff', extra_roles: ['technician'] });
});
