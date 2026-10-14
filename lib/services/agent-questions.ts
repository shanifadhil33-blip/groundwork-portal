import { z } from 'zod';
import { ApiError } from '../http';
import { allowTeam, inWorkspace, uuid } from './shared';
import { sendPush } from './push';
import { withSystem } from '../db';
// TEAM09: the Agent never guesses on something it is unsure about. It asks a supervisor, who approves or fixes in one tap.
const ask = z.object({ question: z.string().trim().min(3).max(1000), proposed: z.string().trim().max(1000).default(''), work_order_id: uuid.optional() }).strict();
const decide = z.object({ decision: z.enum(['approve', 'fix']), answer: z.string().trim().max(1000).optional() }).strict();
export async function askSupervisor(user: string, ws: string, body: unknown) {
  const d = ask.parse(body);
  const row = await inWorkspace(user, ws, async c => {
    if (!['admin', 'staff', 'technician'].includes(c.role)) throw new ApiError(403, 'forbidden', 'Ask your service company instead.');
    if (d.work_order_id && !(await c.db.query('SELECT 1 FROM work_orders WHERE workspace_id=$1 AND id=$2', [ws, d.work_order_id])).rowCount) throw new ApiError(404, 'not_found', 'That job was not found.');
    return (await c.db.query('INSERT INTO agent_questions(workspace_id,asked_by,work_order_id,question,proposed) VALUES($1,$2,$3,$4,$5) RETURNING *', [ws, user, d.work_order_id ?? null, d.question, d.proposed])).rows[0];
  });
  const sups = (await withSystem(db => db.query("SELECT user_id FROM members WHERE workspace_id=$1 AND archived_at IS NULL AND role IN ('admin','staff') AND coalesce(staff_kind,'')<>'office' AND user_id<>$2", [ws, user]))).rows.map(r => r.user_id);
  await sendPush(sups, { title: 'Agent needs your call', body: d.question.slice(0, 160), url: '/dashboard', tag: `ask-${row.id}` });
  return { id: row.id, status: 'open', message: 'Sent to your supervisor. Nothing changes until they answer.' };
}
export async function listAgentQuestions(user: string, ws: string) {
  return inWorkspace(user, ws, async c => {
    const staff = ['admin', 'staff'].includes(c.role);
    const rows = (await c.db.query(`SELECT q.*, u.name AS asked_by_name, w.order_number, w.title AS job_title FROM agent_questions q LEFT JOIN LATERAL visible_user(q.asked_by) u ON true LEFT JOIN work_orders w ON w.id=q.work_order_id
      WHERE q.workspace_id=$1 AND ${staff ? "q.status='open'" : 'q.asked_by=$2'} ORDER BY q.created_at DESC LIMIT 20`, staff ? [ws] : [ws, user])).rows;
    return { data: rows };
  });
}
export async function decideAgentQuestion(user: string, ws: string, id: string, body: unknown) {
  const d = decide.parse(body); uuid.parse(id);
  if (d.decision === 'fix' && !d.answer?.trim()) throw new ApiError(422, 'answer_required', 'Write the right answer.');
  const row = await inWorkspace(user, ws, async c => {
    allowTeam(c);
    const r = (await c.db.query(`UPDATE agent_questions SET status=$3, answer=CASE WHEN $3='approved' THEN nullif(proposed,'') ELSE $4 END, decided_by=$5, decided_at=now() WHERE workspace_id=$1 AND id=$2 AND status='open' RETURNING *`, [ws, id, d.decision === 'approve' ? 'approved' : 'fixed', d.answer ?? null, user])).rows[0];
    if (!r) throw new ApiError(409, 'decided', 'This was already answered.');
    return r;
  });
  await sendPush([row.asked_by], { title: row.status === 'approved' ? 'Supervisor said yes' : 'Supervisor answered', body: (row.answer || 'Go ahead.').slice(0, 160), url: row.work_order_id ? `/work-orders/${row.work_order_id}` : '/today', tag: `ask-${row.id}` });
  return row;
}
