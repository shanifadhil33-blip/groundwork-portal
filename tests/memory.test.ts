import { afterAll, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { listAgentLearning, savePersonalLearning, updatePersonalLearning, deletePersonalLearning, resetPersonalLearning } from '../lib/services/agent-learning';
import { allowedTool } from '../lib/agent/role-tools';
import { actionSummary } from '../lib/ui/assistant-replies';
afterAll(async () => { await withSystem(db => db.query('DELETE FROM personal_agent_learning WHERE workspace_id=$1', [ids.ridgeline])); await closePools(); });
const mine = async (u: string) => (await listAgentLearning(u, ids.ridgeline)).data.filter((l: { scope: string }) => l.scope === 'personal');
it('LEARN15: he edits and deletes only his own lines, and reset clears only his', async () => {
  const a = await savePersonalLearning(ids.ravi, ids.ridgeline, { body: 'I start at 6' });
  const other = await savePersonalLearning(ids.sam, ids.ridgeline, { body: 'Sam likes voice' });
  expect((await updatePersonalLearning(ids.ravi, ids.ridgeline, a.id, { body: 'I start at 7 now' })).body).toBe('I start at 7 now');
  await expect(updatePersonalLearning(ids.ravi, ids.ridgeline, other.id, { body: 'x' })).rejects.toThrow();
  await expect(deletePersonalLearning(ids.ravi, ids.ridgeline, other.id)).rejects.toThrow();
  await savePersonalLearning(ids.ravi, ids.ridgeline, { body: 'Prefers Malayalam' });
  await deletePersonalLearning(ids.ravi, ids.ridgeline, a.id);
  expect((await mine(ids.ravi)).map((l: { body: string }) => l.body)).toEqual(['Prefers Malayalam']);
  expect((await resetPersonalLearning(ids.ravi, ids.ridgeline)).deleted).toBe(1);
  expect(await mine(ids.ravi)).toEqual([]); expect((await mine(ids.sam)).length).toBe(1);
});
it('LEARN15: every role may manage only its own memory through the Agent, always with a card', () => {
  for (const role of ['technician', 'client', 'client:office', 'client:household', 'office', 'admin', 'staff']) for (const t of ['my_memory', 'remember_about_me', 'forget_about_me', 'set_call_me']) expect(allowedTool(role, t)).toBe(true);
  expect(actionSummary('set_call_me', { name: 'Joe' })).toBe('Call you Joe from now on?');
  expect(actionSummary('remember_about_me', { note: 'I start at 7 now' })).toContain('I start at 7 now');
});
