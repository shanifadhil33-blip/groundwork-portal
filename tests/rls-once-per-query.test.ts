import { afterAll, expect, it } from 'vitest';
import { closePools, ownerPool, withUser } from '../lib/db';
import { ids } from '../scripts/seed';
afterAll(closePools);

/** Bug 98: row level security must look up the person's memberships once per query, not once per row. */
const PER_ROW = /\b(is_staff|is_member|my_role|my_client|my_client_kind|my_staff_kind)\(/;

it('no policy calls a per row membership helper', async () => {
  const policies = (await ownerPool.query("SELECT tablename, policyname, coalesce(qual,'') || ' ' || coalesce(with_check,'') AS expr FROM pg_policies WHERE schemaname='public'")).rows;
  expect(policies.length).toBeGreaterThan(100);
  expect(policies.filter(p => PER_ROW.test(p.expr)).map(p => `${p.tablename}.${p.policyname}`)).toEqual([]);
});

it.each([['owner', ids.imran], ['technician', ids.ravi], ['client', ids.pranav]])('a job count for the %s runs the membership lookup once', async (_, user) => {
  const plan = await withUser(user, async db => JSON.stringify((await db.query('EXPLAIN (FORMAT JSON) SELECT count(*) FROM work_orders')).rows[0]['QUERY PLAN']));
  expect(plan).not.toMatch(PER_ROW);
  expect(plan).toContain('app_memberships');
  // The lookup sits in an InitPlan or a hashed SubPlan, evaluated once, never per row.
  expect(plan).toMatch(/InitPlan|Hashed SubPlan|hashed SubPlan|"Subplan Name"/);
});
