import { afterAll, beforeAll, expect, it, vi } from 'vitest';
vi.mock('../lib/ai', async original => ({ ...await original<typeof import('../lib/ai')>(), assistantTurn: vi.fn() }));
import { assistantTurn } from '../lib/ai';
import { assistant } from '../lib/services/assistant';
import { jobRecord, myFixes } from '../lib/services/job-report';
import { callTool } from '../lib/agent/tools';
import { countAnswer, quickLookup } from '../lib/agent/data-answers';
import { arabicJobs, fixesLine, COUNT_LANGS } from '../lib/count-lines';
import { closePools, withSystem } from '../lib/db';
import { ids, siteId } from '../lib/fixture';
const ws = ids.ridgeline;
const ctx = (user: string) => ({ user, ws, scope: 'read' as const, kind: 'assistant' as const });
const made: string[] = [];
let counter: number;
beforeAll(async () => {
 await withSystem(async db => {
  counter = (await db.query('SELECT last_number FROM work_order_counters WHERE workspace_id=$1', [ws])).rows[0].last_number;
  // Relative local calendar dates stay valid across month and year boundaries.
  for (const [person, offset, title] of [[ids.ravi, 0, 'TECH06 drain clear'], [ids.ravi, 1, 'TECH06 old valve'], [ids.sam, 0, 'TECH06 someone else']] as const) {
   const r = await db.query(`INSERT INTO work_orders(workspace_id,client_id,site_id,title,status,assignee_id,created_by,report_at,report_problem,report_work,report_outcome,trade)
    VALUES($1,$2,$3,$4,'done',$5,$6,(date_trunc('month',now() AT TIME ZONE 'Asia/Dubai') - $7::int * interval '1 month' + interval '2 days') AT TIME ZONE 'Asia/Dubai','Blocked drain','Cleared pipe','fixed','ac') RETURNING id`, [ws, ids.harbor, siteId(1), title, person, ids.imran, offset]);
   made.push(r.rows[0].id);
  }
 });
});
afterAll(async () => {
 await withSystem(async db => {
  for (const id of made) {
   await db.query('DELETE FROM work_order_events WHERE work_order_id=$1', [id]);
   await db.query('DELETE FROM work_orders WHERE id=$1', [id]);
   await db.query('DELETE FROM audit_log WHERE work_order_id=$1', [id]);
  }
  if (counter !== undefined) await db.query('UPDATE work_order_counters SET last_number=$2 WHERE workspace_id=$1', [ws, counter]);
 });
 await closePools();
});
it('Ravi sees only his own done work, newest first, with counts equal to jobRecord', async () => {
 const r = await myFixes(ids.ravi, ws, { month: 'all' });
 expect(r.summary).toMatchObject(await jobRecord(ids.ravi, ws, ids.ravi));
 const expected = await withSystem(async db => (await db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 AND status='done' ORDER BY coalesce(report_at,updated_at) DESC,id DESC LIMIT 20", [ws, ids.ravi])).rows.map(r => r.id));
 expect(r.data.map(j => j.id)).toEqual(expected);
 expect(r.data.some(j => j.id === made[2])).toBe(false);
 expect(r.summary.trades.find(t => t.trade === 'ac')?.count).toBeGreaterThan(0);
 expect(r.data.find(j => j.id === made[0])).toMatchObject({ problem: 'Blocked drain', fix: 'Cleared pipe', outcome_label: 'Fixed', trade: 'ac', site_name: expect.any(String), done_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
});
it('search narrows title, site, problem and fix, with literal parameterised text', async () => {
 for (const q of ['TECH06 DRAIN', 'blocked DRAIN', 'cLeArEd PiPe']) {
  const r = await myFixes(ids.ravi, ws, { q });
  expect(r.data.some(j => j.id === made[0])).toBe(true);
  expect(r.data.every(j => [j.title,j.site_name,j.problem,j.fix].join(' ').toLowerCase().includes(q.toLowerCase()))).toBe(true);
 }
 const job = (await myFixes(ids.ravi, ws, {q:'TECH06 drain'})).data[0];
 expect((await myFixes(ids.ravi,ws,{q:job.site_name})).data.some(j=>j.id===job.id)).toBe(true);
 expect((await myFixes(ids.ravi,ws,{q:"%' OR true; --"})).total).toBe(0);
});
it('last month filter includes old fixes and keeps the whole personal summary', async () => {
 const r = await myFixes(ids.ravi, ws, { month: 'last' });
 expect(r.data.some(j => j.id === made[1])).toBe(true);
 expect(r.data.some(j => j.id === made[0])).toBe(false);
 expect(r.total).toBe(r.summary.last_month);
 expect(r.summary).toEqual((await myFixes(ids.ravi, ws)).summary);
 expect((await myFixes(ids.ravi,ws,{page:100})).data).toEqual([]);
});
it('Ravi cannot read Sam; Imran and office can read Ravi using the same service and name matching', async () => {
 await expect(myFixes(ids.ravi, ws, {of: ids.sam})).rejects.toMatchObject({status:403});
 expect(await callTool(ctx(ids.ravi), 'my_fixes', {person:'Sam'})).toMatchObject({isError:true});
 for (const user of [ids.imran,ids.sam,ids.nabil]) {
  expect((await myFixes(user,ws,{of:ids.ravi})).summary).toEqual((await myFixes(ids.ravi,ws)).summary);
  expect(await callTool(ctx(user),'my_fixes',{person:'rAvI'})).toMatchObject({structuredContent:{result:{name:'Ravi'}}});
 }
});
it.each([ids.pranav,ids.faisal])('client %s is refused', async user => {
 await expect(myFixes(user,ws)).rejects.toMatchObject({status:403});
 expect(await callTool(ctx(user),'my_fixes',{})).toMatchObject({isError:true,structuredContent:{error:{code:'forbidden'}}});
});
it('the four quick questions return counts and at most five fixes with no AI', async () => {
 const record = await myFixes(ids.ravi,ws);
 for (const question of ['Show my fixes this month','my fixes this month','show my fixes','what did I fix this month']) {
  expect(quickLookup(question)).toBe('my_fixes');
  const r:any = await assistant(ids.ravi,ws,{messages:[{role:'user',content:question}]});
  expect(r.quick).toBe(true);
  expect(r.reply.split('\n')[0]).toBe(fixesLine('en',record.summary));
  expect(r.reply.split('\n').at(-1)).toBe('See all in My record.');
  expect(r.reply.split('\n').filter((l:string)=>l.startsWith('WO ')).length).toBeLessThanOrEqual(5);
  expect(r.reply.split('\n').slice(1,-1)).toEqual(record.data.slice(0,5).map(j=>`WO ${j.order_number} ${j.title}, ${j.site_name ?? ''}, ${j.outcome_label}`));
 }
 expect(assistantTurn).not.toHaveBeenCalled();
});
it('Arabic uses arabicJobs for all three counts and every count language has a summary', async () => {
 const r = await myFixes(ids.ravi,ws);
 const a = await countAnswer(ctx(ids.ravi),'Show my fixes this month',{role:'technician',language:'ar-AE'});
 expect(a?.localized).toBe(true);
 expect(a?.text.split('\n')[0]).toBe(fixesLine('ar-AE',r.summary));
 for (const n of [1,2,7,11,100]) expect(fixesLine('ar-AE',{month:n,last_month:n,total:n})).toContain(arabicJobs(n));
 for (const lang of COUNT_LANGS) {
  const line = fixesLine(lang,{month:7,last_month:9,total:140});
  expect(line).not.toMatch(/[{}]|\p{Pd}/u);
  expect(line).toMatch(/7[\s\S]*9[\s\S]*140/);
  if (lang !== 'en') expect(line).not.toBe(fixesLine('en',{month:7,last_month:9,total:140}));
 }
 expect(assistantTurn).not.toHaveBeenCalled();
});
