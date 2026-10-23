import { afterAll, beforeEach, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../lib/fixture';
import { DEMO_MEMORY_COPY } from '../lib/demo-memory-copy';
import { startDemo, resetDemo, switchDemo } from '../lib/services/demo';
import { listCompanyMemory, companyMemoryContext, correctCompanyMemory, deleteCompanyMemory } from '../lib/services/company-memory';

let ws: string, people: Record<string, string>;
async function load(workspace: string) {
  ws = workspace;
  people = await withSystem(async db => Object.fromEntries((await db.query(
    'SELECT demo_persona,id FROM users WHERE demo_workspace_id=$1', [ws],
  )).rows.map(row => [row.demo_persona, row.id])));
}
beforeEach(async () => load((await startDemo({ persona: 'hassan', language: 'ar-AE' }, 'local-demo-memory')).body.workspace_id));
afterAll(closePools);

it('seeds recorded sandbox lessons with fixture people, dates and ledger counts, leaving real companies empty', async () => {
  const memory = await listCompanyMemory(people.hassan, ws);
  expect(memory.can_edit).toBe(true);
  expect(memory.data).toHaveLength(3);
  for (const [body, recorded_by, context_uses] of [
    [DEMO_MEMORY_COPY.technician, 'Ravi', 8], [DEMO_MEMORY_COPY.access, 'Sam', 5], [DEMO_MEMORY_COPY.parts, 'Imran', 3],
  ]) {
    const lesson = memory.data.find(row => row.body === body);
    expect(lesson).toMatchObject({ recorded_by, context_uses });
    expect(lesson!.created_at.getTime()).toBeLessThan(Date.now());
    const events = await withSystem(async db => (await db.query(`SELECT actor_id,at FROM audit_log
      WHERE workspace_id=$1 AND entity='company_rules' AND entity_id=$2 AND action='memory_used'`, [ws, lesson!.id])).rows);
    expect(events).toHaveLength(context_uses as number);
    expect(events.every(event => event.actor_id === people.imran && event.at > lesson!.created_at && event.at < new Date())).toBe(true);
  }
  expect((await listCompanyMemory(ids.imran, ids.ridgeline)).data).toEqual([]);
  expect((await listCompanyMemory(ids.summitAdmin, ids.summit)).data).toEqual([]);
});

it('owner and plain admin can change seeded lessons; supervisor reads and cannot write', async () => {
  const memory = await listCompanyMemory(people.sam, ws);
  expect(memory.can_edit).toBe(false);
  const first = memory.data[0];
  await expect(correctCompanyMemory(people.sam, ws, first.id, { body: 'Changed instruction' })).rejects.toMatchObject({ status: 403 });
  await expect(deleteCompanyMemory(people.sam, ws, first.id)).rejects.toMatchObject({ status: 403 });
  for (const who of ['nabil', 'ravi', 'pranav']) await expect(listCompanyMemory(people[who], ws)).rejects.toMatchObject({ status: 403 });
  expect((await listCompanyMemory(people.imran, ws)).can_edit).toBe(true);
  expect(await correctCompanyMemory(people.hassan, ws, first.id, { body: 'Confirm access with reception before dispatch.' })).toMatchObject({ status: 'waiting' });
  const second = memory.data[1];
  await deleteCompanyMemory(people.imran, ws, second.id);
  const context = await companyMemoryContext(people.hassan, ws);
  expect(context).not.toContain(first.body); expect(context).not.toContain(second.body);
  expect(context).not.toContain('Confirm access with reception before dispatch.');
  expect((await listCompanyMemory(people.hassan, ws)).data[0].context_uses).toBe(memory.data[2].context_uses + 1);
});

it('switching keeps changes, reset restores fresh samples, and another sandbox stays separate', async () => {
  const originalWs = ws, originalOwner = people.imran;
  const lesson = (await listCompanyMemory(people.hassan, ws)).data[0];
  await deleteCompanyMemory(people.hassan, ws, lesson.id);
  await switchDemo(people.hassan, { persona: 'sam', language: 'ar-AE' });
  expect((await listCompanyMemory(people.sam, ws)).data).toHaveLength(2);
  const other = await startDemo({ persona: 'imran' }, 'local-demo-memory-other');
  await load(other.body.workspace_id);
  expect((await listCompanyMemory(people.imran, ws)).data).toHaveLength(3);
  await expect(deleteCompanyMemory(people.imran, originalWs, lesson.id)).rejects.toMatchObject({ status: 404 });
  await load((await resetDemo(originalOwner, { confirm: true })).body.workspace_id);
  expect(ws).not.toBe(originalWs);
  const reset = (await listCompanyMemory(people.hassan, ws)).data;
  expect(reset).toHaveLength(3);
  expect(reset.some(row => row.id === lesson.id)).toBe(false);
  expect(reset.find(row => row.body === DEMO_MEMORY_COPY.technician)).toMatchObject({ recorded_by: 'Ravi', context_uses: 8 });
  expect(await withSystem(async db => (await db.query("SELECT id FROM audit_log WHERE workspace_id=$1 AND entity='company_rules'", [originalWs])).rows)).toEqual([]);
});
