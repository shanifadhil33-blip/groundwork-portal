import { afterAll, expect, it } from 'vitest';
import { closePools } from '../lib/db';
import { ids } from '../scripts/seed';
import { listWorkOrders } from '../lib/services/work-orders';
afterAll(closePools);
const ws = ids.ridgeline;

/** The Jobs list loads 50 at a time. Walking every page must give each job once, in the same order as one full read. */
async function walk(user: string, query: string) {
  const seen: string[] = [];
  let cursor: string | null = null, total = 0;
  for (let n = 0; n < 200; n++) {
    const params = new URLSearchParams(query + '&pageSize=3');
    if (cursor) params.set('cursor', cursor);
    const page: { data: { id: string }[]; total: number; next_cursor: string | null } = await listWorkOrders(user, ws, params);
    total = page.total;
    seen.push(...page.data.map(o => o.id));
    cursor = page.next_cursor;
    if (!cursor) break;
  }
  return { seen, total };
}

it.each([
  'sort=updated_at&dir=desc', 'sort=updated_at&dir=asc', 'sort=created_at&dir=desc', 'sort=title&dir=asc', 'sort=priority&dir=desc', 'sort=due_on&dir=asc', 'sort=scheduled_for&dir=desc', 'sort=priority&dir=desc&overdue=true',
])('every job once, in order, for %s', async query => {
  const full = await listWorkOrders(ids.imran, ws, new URLSearchParams(query + '&active=false'), true);
  const { seen, total } = await walk(ids.imran, query + '&active=false');
  expect(total).toBe(full.total);
  expect(new Set(seen).size).toBe(seen.length);
  expect(seen).toEqual(full.data.map((o: { id: string }) => o.id));
});

it('a technician and a client page only their own jobs', async () => {
  for (const user of [ids.ravi, ids.pranav]) {
    const full = await listWorkOrders(user, ws, new URLSearchParams('active=false'), true);
    const { seen } = await walk(user, 'active=false');
    expect(seen).toEqual(full.data.map((o: { id: string }) => o.id));
  }
});

it('a cursor from other filters is refused', async () => {
  const first = await listWorkOrders(ids.imran, ws, new URLSearchParams('pageSize=2&active=false'));
  await expect(listWorkOrders(ids.imran, ws, new URLSearchParams(`pageSize=2&status=done&cursor=${first.next_cursor}`))).rejects.toThrow();
});
