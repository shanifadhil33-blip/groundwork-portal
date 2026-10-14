import { afterAll, expect, it, vi } from 'vitest';
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: async () => ({}) } }));
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { askSupervisor, decideAgentQuestion, listAgentQuestions } from '../lib/services/agent-questions';
import { allowedTool } from '../lib/agent/role-tools';
afterAll(async () => { await withSystem(db => db.query('DELETE FROM agent_questions WHERE workspace_id=$1', [ids.ridgeline])); await closePools(); });
it('TEAM09: technician asks, supervisor approves or fixes, once; clients cannot ask', async () => {
  expect(allowedTool('technician', 'ask_supervisor')).toBe(true); expect(allowedTool('client:manager', 'ask_supervisor')).toBe(false);
  const a = await askSupervisor(ids.ravi, ids.ridgeline, { question: 'Can I use the spare filter from the van?', proposed: 'Yes, log it on the job' });
  expect((await listAgentQuestions(ids.sam, ids.ridgeline)).data.some((q: { id: string }) => q.id === a.id)).toBe(true);
  expect((await listAgentQuestions(ids.ravi, ids.ridgeline)).data.length).toBeGreaterThan(0);
  await expect(decideAgentQuestion(ids.ravi, ids.ridgeline, a.id, { decision: 'approve' })).rejects.toThrow();
  const d = await decideAgentQuestion(ids.sam, ids.ridgeline, a.id, { decision: 'approve' }); expect(d.status).toBe('approved'); expect(d.answer).toBe('Yes, log it on the job');
  await expect(decideAgentQuestion(ids.sam, ids.ridgeline, a.id, { decision: 'approve' })).rejects.toThrow(/already/);
  const b = await askSupervisor(ids.ravi, ids.ridgeline, { question: 'What price for a new tap?' });
  await expect(decideAgentQuestion(ids.sam, ids.ridgeline, b.id, { decision: 'fix' })).rejects.toThrow(/right answer/);
  expect((await decideAgentQuestion(ids.imran, ids.ridgeline, b.id, { decision: 'fix', answer: '120 AED fitted' })).answer).toBe('120 AED fitted');
  await expect(askSupervisor(ids.omar, ids.ridgeline, { question: 'Can you come now?' })).rejects.toThrow();
});
it('TEAM09: the in app Agent lets a technician use ask_supervisor', async () => {
  const src = (await import('node:fs')).readFileSync('lib/services/assistant.ts', 'utf8');
  expect(src).toMatch(/role==='technician'&&!\[[^\]]*'ask_supervisor'/);
});
