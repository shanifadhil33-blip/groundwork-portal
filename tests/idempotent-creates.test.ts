import { afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closePools, withSystem } from '../lib/db';
import { ids, siteId } from '../scripts/seed';
import { addMoney } from '../lib/services/owner-overview';
import { addTimeOff } from '../lib/services/time-off';
import { createAsset } from '../lib/services/assets';
afterAll(closePools);
const ws = ids.ridgeline;

/** Bug 107: a create sent twice with the same Idempotency-Key (a retry after a dropped connection) makes one record. */
it('a payment sent twice with one key is saved once', async () => {
  const key = randomUUID(), body = { direction: 'in', amount: 1234.5, note: 'Retry test' };
  const [a, b] = await Promise.all([addMoney(ids.imran, ws, body, key), addMoney(ids.imran, ws, body, key)]);
  expect(b.id).toBe(a.id);
  expect((await withSystem(db => db.query("SELECT count(*)::int AS n FROM workspace_money WHERE workspace_id=$1 AND note='Retry test'", [ws]))).rows[0].n).toBe(1);
});

it('time off sent twice with one key is saved once', async () => {
  const key = randomUUID(), body = { user_id: ids.ravi, kind: 'leave', starts_on: '2027-03-01', ends_on: '2027-03-02', note: 'Retry test' };
  const a = await addTimeOff(ids.imran, ws, body, key), b = await addTimeOff(ids.imran, ws, body, key);
  expect(b.id).toBe(a.id);
  expect((await withSystem(db => db.query("SELECT count(*)::int AS n FROM time_off WHERE workspace_id=$1 AND note='Retry test'", [ws]))).rows[0].n).toBe(1);
});

it('equipment sent twice with one key is saved once, a new key makes a second one', async () => {
  const key = randomUUID(), body = { site_id: siteId(1), name: 'Retry test unit', kind: 'ac' };
  const a = await createAsset(ids.imran, ws, body, key), b = await createAsset(ids.imran, ws, body, key);
  expect(b.id).toBe(a.id);
  await createAsset(ids.imran, ws, body, randomUUID());
  expect((await withSystem(db => db.query("SELECT count(*)::int AS n FROM assets WHERE workspace_id=$1 AND name='Retry test unit'", [ws]))).rows[0].n).toBe(2);
});
