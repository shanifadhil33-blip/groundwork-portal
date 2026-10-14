import { afterAll, expect, it, vi } from 'vitest';
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: async () => ({}) } }));
import { closePools, withSystem } from '../lib/db';
import { startDemo, cleanupDemo } from '../lib/services/demo';
import { rateJob } from '../lib/services/ratings';
import { savePrecheck } from '../lib/services/prechecks';
import { askSupervisor, decideAgentQuestion } from '../lib/services/agent-questions';
import { patchPreferences } from '../lib/services/settings';
afterAll(async () => { await closePools(); });
it('an expired demo with ratings, visit checks, Agent questions and preferences is cleaned up', async () => {
  const d = await startDemo({ persona: 'omar' }, 'cleanup-ip-' + Date.now()); const ws = d.body.workspace_id;
  const ids = await withSystem(async db => {
    const u = (p: string) => db.query('SELECT id FROM users WHERE demo_workspace_id=$1 AND demo_persona=$2', [ws, p]).then(r => r.rows[0].id as string);
    const omar = await u('omar'), ravi = await u('ravi'), sam = await u('sam');
    const done = (await db.query("SELECT id,client_id FROM work_orders WHERE workspace_id=$1 AND status='done' AND client_id=(SELECT client_id FROM members WHERE user_id=$2 AND workspace_id=$1) LIMIT 1", [ws, omar])).rows[0];
    const open = (await db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND status IN ('open','scheduled') AND client_id=$2 LIMIT 1", [ws, done.client_id])).rows[0];
    const mine = (await db.query('SELECT id FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 LIMIT 1', [ws, ravi])).rows[0].id as string;
    return { mine, omar, ravi, sam, done: done.id as string, open: open?.id as string | undefined };
  });
  await rateJob(ids.omar, ws, ids.done, { stars: 4 });
  if (ids.open) await savePrecheck(ids.omar, ws, ids.open, { answers: { home: true } });
  const q = await askSupervisor(ids.ravi, ws, { question: 'Can I?', work_order_id: ids.mine });
  await decideAgentQuestion(ids.sam, ws, q.id, { decision: 'fix', answer: 'Yes' });
  await patchPreferences(ids.ravi, { preferred_name: 'Ravi bhai', agent_avatar: 'cat' });
  await withSystem(db => db.query("UPDATE workspaces SET demo_expires_at=now()-interval '1 minute' WHERE id=$1", [ws]));
  await cleanupDemo();
  expect((await withSystem(db => db.query('SELECT 1 FROM workspaces WHERE id=$1', [ws]))).rowCount).toBe(0);
});
