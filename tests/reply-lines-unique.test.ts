// Nov 3: the late jobs reply repeated "Site: Marina Exchange", "Priority: Urgent" and blank lines when late jobs shared
// details (a blank line counts: at most one).
// Whatever day the sandbox was seeded, and even when
// every open job of a client shares every detail (title, site, priority, owner, status, due date), no reply line repeats.
import './fixtures';
import { afterAll, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { LANGUAGES } from '../lib/languages';
import { operationalAnswer } from '../lib/agent/operational-answers';
import { localizedDataAnswer } from '../lib/agent/localized-data-answers';
import { dataAnswer } from '../lib/agent/data-answers';
import type { AgentContext } from '../lib/agent/tools';
afterAll(closePools);

const people = [ids.imran, ids.sam, ids.ravi, ids.pranav];
const languages = ['en-IN', ...LANGUAGES.map(l => l.code).filter(c => !c.startsWith('en'))];
const questions = ['Which jobs are late?', 'Show jobs waiting on parts', 'Show my jobs today', 'What is my next job?', 'What needs attention?', 'How are my requests going?', 'When is the technician coming?', 'Show messages', 'Show suggestions', 'WO 31'];
const ctx = (user: string): AgentContext => ({ user, ws: ids.ridgeline, scope: 'read', kind: 'assistant' });
function noRepeats(reply: string | null | undefined, where: string) {
  if (!reply) return;
  const lines = reply.split('\n');
  expect(new Set(lines).size, `${where}\n${reply}`).toBe(lines.length);
}
async function everyReply(label: string) {
  for (const user of people) {
    for (const lang of languages) {
      for (const kind of ['overdue', 'attention', 'week', 'workload'] as const) noRepeats(await operationalAnswer(user, ids.ridgeline, kind, lang).catch(() => null), `${label} ${user} ${lang} ${kind}`);
      if (lang !== 'en-IN') for (const q of questions) noRepeats(await localizedDataAnswer(ctx(user), q, { language: lang }).catch(() => null), `${label} ${user} ${lang} ${q}`);
    }
    for (const q of questions) noRepeats(await dataAnswer(ctx(user), q).catch(() => null), `${label} ${user} en ${q}`);
  }
}

it('no reply line repeats with the seeded jobs', async () => { await everyReply('seed'); }, 300000);

it('no reply line repeats when every open job shares the same title, site, priority, owner, status and due date', async () => {
  await withSystem(db => db.query(`UPDATE work_orders w SET title='Adjust meeting room cooling', site_id=(SELECT s.id FROM sites s WHERE s.workspace_id=w.workspace_id AND s.client_id=w.client_id ORDER BY s.name LIMIT 1),
    priority='urgent', assignee_id=$2, status='in_progress', due_on=(now() AT TIME ZONE 'Asia/Dubai')::date - 5,
    scheduled_for=CASE WHEN order_number % 2 = 0 THEN now() ELSE NULL END
    WHERE workspace_id=$1 AND status NOT IN ('done','cancelled') AND archived_at IS NULL`, [ids.ridgeline, ids.ravi]), ids.imran);
  const late = await withSystem(async db => (await db.query(`SELECT count(*)::int n FROM work_orders WHERE workspace_id=$1 AND status='in_progress' AND due_on < (now() AT TIME ZONE 'Asia/Dubai')::date`, [ids.ridgeline])).rows[0].n as number);
  expect(late).toBeGreaterThan(3);
  const reply = await operationalAnswer(ids.imran, ids.ridgeline, 'overdue', 'ar-AE');
  expect(reply.split('\n').filter(l => l.startsWith('مهمة #')).length).toBeGreaterThan(3);
  await everyReply('shared');
}, 300000);
