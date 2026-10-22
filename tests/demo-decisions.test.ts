import { afterAll, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
vi.mock('../lib/services/push', () => ({ sendPush: vi.fn(async () => 0) }));
import { closePools, withSystem } from '../lib/db';
import { ids } from '../lib/fixture';
import { DEMO_DECISION_COPY as copy } from '../lib/demo-decision-copy';
import { startDemo, resetDemo } from '../lib/services/demo';
import { decideTimeOff, leaveRequests, offReason, requestTimeOff } from '../lib/services/time-off';
import { decideAgentQuestion, listAgentQuestions } from '../lib/services/agent-questions';
import { decideLesson, listLessons } from '../lib/services/lessons';
import { listAgentLearning } from '../lib/services/agent-learning';
import { getHabits, rememberArea } from '../lib/services/habits';
import { sendPush } from '../lib/services/push';
const rows = (sql: string, args: unknown[] = []) => withSystem(async db => (await db.query(sql, args)).rows);
afterAll(closePools);
async function people(ws: string) {
  const u = Object.fromEntries((await rows('SELECT demo_persona,id FROM users WHERE demo_workspace_id=$1', [ws])).map(r => [r.demo_persona, r.id])) as Record<string,string>;
  return { ws, u };
}
async function sandbox() { return people((await startDemo({ persona: 'imran' }, 'local-decision-tests')).body.workspace_id); }
async function pending(s: Awaited<ReturnType<typeof sandbox>>) {
  return { leave: (await leaveRequests(s.u.sam, s.ws)).requests.find(r => r.user_id === s.u.ravi)!,
    question: (await listAgentQuestions(s.u.sam, s.ws)).data[0], lesson: (await listLessons(s.u.imran, s.ws)).data[0] };
}
it('D2 seeds pending decisions only in sandboxes, without sending or claiming personal learning', async () => {
  vi.mocked(sendPush).mockClear();
  for (const table of ['time_off','agent_questions','lesson_proposals']) expect(await rows(`SELECT id FROM ${table} WHERE workspace_id=$1`, [ids.ridgeline])).toEqual([]);
  const s = await sandbox(), p = await pending(s);
  expect(sendPush).not.toHaveBeenCalled();
  expect(p.leave).toMatchObject({ user_id: s.u.ravi, kind: 'leave', status: 'pending', name: 'Ravi' });
  expect(await withSystem(db => offReason(db, s.ws, s.u.ravi, p.leave.starts_on))).toBeNull();
  expect(await rows(`SELECT id FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 AND status IN ('scheduled','in_progress','waiting_on_parts')
    AND (scheduled_for AT TIME ZONE 'Asia/Dubai')::date=$3`, [s.ws,s.u.ravi,p.leave.starts_on])).toEqual([]);
  expect(p.question).toMatchObject({ asked_by: s.u.ravi, status: 'open', question: copy.question, proposed: copy.proposed });
  expect(p.lesson).toMatchObject({ proposed_by_name: 'Sam', body: copy.lesson, scope: 'company', reason: 'company', status: 'waiting' });
  expect((await listAgentLearning(s.u.imran,s.ws)).data.some(r => r.body === copy.lesson)).toBe(false);
  expect((await listAgentLearning(s.u.ravi,s.ws)).data.filter(r => r.scope === 'personal')).toEqual([]);
});
it('Sam decides leave and escalation, Ravi reads both; only Imran approves the company lesson', async () => {
  const s = await sandbox(), p = await pending(s);
  for (const actor of [s.u.ravi,s.u.nabil,s.u.pranav]) {
    await expect(decideTimeOff(actor,s.ws,p.leave.id,{decision:'approved'})).rejects.toMatchObject({status:403});
    await expect(decideAgentQuestion(actor,s.ws,p.question.id,{decision:'approve'})).rejects.toMatchObject({status:403});
    await expect(decideLesson(actor,s.ws,p.lesson.id,{yes:true})).rejects.toMatchObject({status:403});
  }
  await expect(decideLesson(s.u.sam,s.ws,p.lesson.id,{yes:true})).rejects.toMatchObject({status:403});
  await decideTimeOff(s.u.sam,s.ws,p.leave.id,{decision:'approved'});
  expect((await leaveRequests(s.u.ravi,s.ws)).requests.find(r=>r.id===p.leave.id)?.status).toBe('approved');
  expect(await withSystem(db=>offReason(db,s.ws,s.u.ravi,p.leave.starts_on))).toContain('on leave');
  await decideAgentQuestion(s.u.sam,s.ws,p.question.id,{decision:'approve'});
  expect((await listAgentQuestions(s.u.ravi,s.ws,true)).data.find(r=>r.id===p.question.id)).toMatchObject({answer:copy.proposed,status:'approved',decided_by_name:'Sam'});
  await decideLesson(s.u.imran,s.ws,p.lesson.id,{yes:true});
  expect((await listAgentLearning(s.u.imran,s.ws)).data.filter(r=>r.body===copy.lesson)).toHaveLength(1);
  await expect(decideLesson(s.u.imran,s.ws,p.lesson.id,{yes:false})).rejects.toMatchObject({status:409});
});
it('reset restores pending samples, supports decline and correction, and isolates a second sandbox and real people', async () => {
  const a=await sandbox(), b=await sandbox(), p=await pending(a);
  await decideLesson(a.u.imran,a.ws,p.lesson.id,{yes:true});
  for (const actor of [b.u.imran,ids.imran]) {
    await expect(decideTimeOff(actor,a.ws,p.leave.id,{decision:'declined'})).rejects.toMatchObject({status:404});
    await expect(decideAgentQuestion(actor,a.ws,p.question.id,{decision:'approve'})).rejects.toMatchObject({status:404});
    await expect(decideLesson(actor,a.ws,p.lesson.id,{yes:false})).rejects.toMatchObject({status:404});
  }
  const reset=await resetDemo(a.u.imran,{confirm:true}), s=await people(reset.body.workspace_id), fresh=await pending(s);
  expect(s.ws).not.toBe(a.ws);
  expect(fresh.leave.status).toBe('pending'); expect(fresh.question.status).toBe('open'); expect(fresh.lesson.status).toBe('waiting');
  await decideTimeOff(s.u.sam,s.ws,fresh.leave.id,{decision:'declined'});
  await decideAgentQuestion(s.u.sam,s.ws,fresh.question.id,{decision:'fix',answer:'Write the size in the report.'});
  await decideLesson(s.u.imran,s.ws,fresh.lesson.id,{yes:false});
  expect((await leaveRequests(s.u.ravi,s.ws)).requests.find(r=>r.id===fresh.leave.id)?.status).toBe('declined');
  expect((await listAgentQuestions(s.u.ravi,s.ws,true)).data[0]).toMatchObject({status:'fixed',answer:'Write the size in the report.'});
  expect((await listAgentLearning(s.u.imran,s.ws)).data.some(r=>r.body===copy.lesson)).toBe(false);
  expect((await pending(b)).lesson.status).toBe('waiting');
  expect(await rows('SELECT id FROM lesson_proposals WHERE workspace_id=$1',[a.ws])).toEqual([]);
});
it('booked leave still refuses without moving a job in both demo and real workspaces', async () => {
  const s=await sandbox();
  for (const [ws,ravi,sam] of [[s.ws,s.u.ravi,s.u.sam],[ids.ridgeline,ids.ravi,ids.sam]]) {
    const job=(await rows("SELECT id,assignee_id,status,scheduled_for,(scheduled_for AT TIME ZONE 'Asia/Dubai')::date::text AS day FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 AND status IN ('scheduled','in_progress','waiting_on_parts') AND scheduled_for>now() ORDER BY scheduled_for LIMIT 1",[ws,ravi]))[0];
    expect(job).toBeTruthy();
    const r=await requestTimeOff(ravi,ws,{kind:'leave',starts_on:job.day});
    await expect(decideTimeOff(sam,ws,r.id,{decision:'approved'})).rejects.toMatchObject({status:409,code:'booked'});
    expect((await rows('SELECT assignee_id,status,scheduled_for FROM work_orders WHERE id=$1',[job.id]))[0]).toEqual({assignee_id:job.assignee_id,status:job.status,scheduled_for:job.scheduled_for});
  }
});
it('D2 copy has static translations in all language files', () => {
  for (const file of readdirSync('public/i18n')) {
    const words=JSON.parse(readFileSync(`public/i18n/${file}`,'utf8'));
    for (const text of Object.values(copy)) expect(words[text],`${file}: ${text}`).toBeTruthy();
  }
});
it('the documented habit threshold uses recorded work and requires a separate Remember action', async () => {
  const s=await sandbox();
  // The documented sequence completes three visits at one site. Set their stored
  // completion here; ordinary report/lifecycle behavior is covered separately.
  await rows("UPDATE work_orders SET assignee_id=$2,status='done',updated_at=now() WHERE id IN (SELECT id FROM work_orders WHERE workspace_id=$1 AND site_id=(SELECT id FROM sites WHERE workspace_id=$1 AND name='Marina Exchange') AND status='open' LIMIT 3)",[s.ws,s.u.ravi]);
  expect((await getHabits(s.u.ravi,s.ws)).suggestions.some(r=>r.area==='Dubai Marina')).toBe(true);
  expect((await rows('SELECT usual_areas FROM user_preferences WHERE user_id=$1',[s.u.ravi]))[0]?.usual_areas??[]).not.toContain('Dubai Marina');
  await rememberArea(s.u.ravi,s.ws,{area:'Dubai Marina'});
  expect((await getHabits(s.u.ravi,s.ws)).suggestions.some(r=>r.area==='Dubai Marina')).toBe(false);
});
