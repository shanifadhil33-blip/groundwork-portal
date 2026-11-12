import { afterAll, beforeEach, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { agentQuota, agentPerMinute } from '../lib/services/agent-quota';
afterAll(async () => { process.env.AGENT_DAILY_LIMIT = '100000'; process.env.AGENT_PER_MINUTE = '100000'; await closePools(); });
const ws = ids.ridgeline;
beforeEach(async () => {
  process.env.AGENT_DAILY_LIMIT = '12'; process.env.AGENT_PER_MINUTE = '10';
  await withSystem(db => db.query('DELETE FROM agent_quota_minute; DELETE FROM agent_quota_day'));
});

it('stops one person after the per minute limit, for every server', async () => {
  for (let n = 0; n < agentPerMinute(); n++) expect(await agentQuota(ids.imran, ws)).toBe('ok');
  expect(await agentQuota(ids.imran, ws)).toBe('minute');
  // Someone else in the same company still gets answers.
  expect(await agentQuota(ids.sam, ws)).toBe('ok');
});

it('stops the company for the rest of the day at the daily cap', async () => {
  for (let n = 0; n < 6; n++) expect(await agentQuota(ids.imran, ws)).toBe('ok');
  for (let n = 0; n < 6; n++) expect(await agentQuota(ids.sam, ws)).toBe('ok');
  expect(await agentQuota(ids.ravi, ws)).toBe('day');
  const row = await withSystem(db => db.query('SELECT calls FROM agent_quota_day WHERE workspace_id=$1', [ws]));
  expect(row.rows[0].calls).toBe(12);
});

it('many questions at once never pass the cap', async () => {
  process.env.AGENT_DAILY_LIMIT = '5';
  const people = [ids.imran, ids.sam, ids.ravi, ids.pranav, ids.omar, ids.nabil, ids.kevin];
  const results = await Promise.all(people.map(p => agentQuota(p, ws)));
  expect(results.filter(r => r === 'ok')).toHaveLength(5);
});
