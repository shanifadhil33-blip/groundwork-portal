import { afterAll, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../lib/ai', async original => ({ ...await original<typeof import('../lib/ai')>(), assistantTurn: vi.fn() }));
import { assistantTurn } from '../lib/ai';
import { assistant } from '../lib/services/assistant';
import { jobRecord } from '../lib/services/job-report';
import { callTool, type AgentContext } from '../lib/agent/tools';
import { countAnswer, quickAnswer, quickLookup } from '../lib/agent/data-answers';
import { closePools, withSystem } from '../lib/db';
import { ids, siteId } from '../lib/fixture';

const ws = ids.ridgeline;
const context = (user: string): AgentContext => ({ user, ws, scope: 'read', kind: 'assistant' });
const who = { role: 'admin', tomorrow: '', timezone: 'Asia/Dubai' };
const ask = (user: string, content: string) => assistant(user, ws, { messages: [{ role: 'user', content }] }) as Promise<any>;
let addedJob: string | undefined;
let originalCounter: number | undefined;
const originalNames = new Map<string, string>();
beforeEach(() => {
  vi.mocked(assistantTurn).mockReset();
  vi.mocked(assistantTurn).mockResolvedValue({ text: 'Please tell me more.', calls: [] } as any);
});
afterAll(async () => {
  await withSystem(async db => {
    if (addedJob) {
      await db.query('DELETE FROM work_order_events WHERE work_order_id=$1', [addedJob]);
      await db.query('DELETE FROM work_orders WHERE id=$1', [addedJob]);
      await db.query('DELETE FROM audit_log WHERE work_order_id=$1', [addedJob]);
      if (originalCounter !== undefined) await db.query('UPDATE work_order_counters SET last_number=$2 WHERE workspace_id=$1', [ws, originalCounter]);
    }
    for (const [id, name] of originalNames) await db.query('UPDATE users SET name=$2 WHERE id=$1', [id, name]);
  });
  await closePools();
});
const sentence = (name: string, counts: { month: number; total: number }) => `${name} finished ${counts.month} ${counts.month === 1 ? 'job' : 'jobs'} this month and ${counts.total} in total.`;

it.each([ids.imran, ids.sam, ids.nabil])('office member %s gets the same Ravi counts as jobRecord without AI', async user => {
  const counts = await jobRecord(user, ws, ids.ravi);
  const result = await ask(user, 'How many jobs has Ravi completed this month, and in total?');
  expect(result).toMatchObject({ quick: true, reply: sentence('Ravi', counts) });
  expect(await callTool(context(user), 'job_counts', { person: 'rAvI' })).toMatchObject({ structuredContent: { result: { name: 'Ravi', ...counts } } });
  expect(assistantTurn).not.toHaveBeenCalled();
});
it('Ravi reads himself and gets a plain refusal for Sam without AI', async () => {
  const counts = await jobRecord(ids.ravi, ws, ids.ravi);
  for (const question of ['How many jobs did I complete this month?', 'How many jobs did I finish this month?', 'How many jobs did I do this month?']) {
    expect(await ask(ids.ravi, question)).toMatchObject({ quick: true, reply: sentence('You', counts) });
  }
  expect(await callTool(context(ids.ravi), 'job_counts', {})).toMatchObject({ structuredContent: { result: { name: 'Ravi', ...counts } } });
  expect(await ask(ids.ravi, 'How many jobs did Sam finish this month?')).toMatchObject({ quick: true, reply: 'You can see your own count.' });
  expect(await callTool(context(ids.ravi), 'job_counts', { person: 'Sam' })).toMatchObject({ isError: true, structuredContent: { error: { message: 'You can see your own count.' } } });
  expect(await ask(ids.ravi, "Ravi's job count")).toMatchObject({ quick: true, reply: sentence('Ravi', counts) });
  expect(assistantTurn).not.toHaveBeenCalled();
});
it.each([ids.pranav, ids.faisal])('client %s cannot read anyone count', async user => {
  for (const args of [{}, { person: 'Ravi' }]) {
    const result = await callTool(context(user), 'job_counts', args);
    expect(result).toMatchObject({ isError: true, structuredContent: { error: { code: 'forbidden' } } });
    expect(result.structuredContent).not.toHaveProperty('result');
  }
  expect(await quickAnswer(context(user), 'How many jobs has Ravi completed this month?', { ...who, role: 'client' })).toBe('Job counts are only for the company team. I can show your own requests instead.');
  expect(await countAnswer(context(user), 'How many jobs did your technicians finish this month?', { role: 'client', language: 'ar-AE' })).toEqual({ text: 'عدد الأعمال لفريق الشركة فقط. أقدر أعرض لك طلباتك.', localized: true });
  const reply = await ask(user, 'How many jobs has Ravi completed this month?');
  expect(reply).toMatchObject({ quick: true });
  expect(reply.reply).not.toMatch(/\d/);
  expect(assistantTurn).not.toHaveBeenCalled();
});
it('unknown people and questions with actions continue to AI', async () => {
  for (const user of [ids.imran, ids.ravi]) {
    expect(await quickAnswer(context(user), 'How many jobs did Nobody finish this month?', who)).toBeNull();
    expect(await callTool(context(user), 'job_counts', { person: 'Nobody' })).toMatchObject({ isError: true, structuredContent: { error: { message: 'I could not find that person on your team.' } } });
  }
  expect(await callTool(context(ids.imran), 'job_counts', { person: 'Nobody' })).toMatchObject({ isError: true, structuredContent: { error: { message: 'I could not find that person on your team.' } } });
  for (const question of ['How many jobs did Ravi finish this month and send Sam a message?', "Ravi's job count and assign him a job", 'How many jobs did Ravi finish this month at Marina Exchange?']) {
    expect(await quickAnswer(context(ids.imran), question, who)).toBeNull();
  }
  expect(assistantTurn).not.toHaveBeenCalled();
  expect((await ask(ids.imran, 'How many jobs did Nobody finish this month?')).quick).toBeUndefined();
  expect(assistantTurn).toHaveBeenCalled();
});
it('matches the requested short forms and returns Sam counts', async () => {
  for (const verb of ['complete', 'completed', 'finish', 'finished', 'do', 'done']) {
    expect(quickLookup(`How many jobs has Ravi ${verb} this month? and in total?`)).toBe('job_counts');
  }
  expect(await quickAnswer(context(ids.imran), "Ravi’s job count", who)).toBe(sentence('Ravi', await jobRecord(ids.imran, ws, ids.ravi)));
  expect(await ask(ids.imran, 'How many jobs did Sam finish this month?')).toMatchObject({ quick: true, reply: sentence('Sam', await jobRecord(ids.imran, ws, ids.sam)) });
  expect(assistantTurn).not.toHaveBeenCalled();
});
it('Arabic reader gets his counts with Arabic number words', async () => {
  const counts = await jobRecord(ids.imran, ws, ids.ravi);
  const r = await countAnswer(context(ids.imran), 'How many jobs has Ravi completed this month, and in total?', { role: 'admin', language: 'ar-AE' });
  expect(r?.localized).toBe(true);
  expect(r?.text).toMatch(counts.month === 0 ? /^لم ينجز Ravi أي عمل/ : /^أنجز Ravi /);
  expect(r?.text).toContain(`ومجموع أعماله ${counts.total}.`);
});
it('uses singular wording for one job', async () => {
  expect(await jobRecord(ids.imran, ws, ids.nabil)).toEqual({ month: 0, total: 0 });
  originalCounter = await withSystem(async db => (await db.query('SELECT last_number FROM work_order_counters WHERE workspace_id=$1', [ws])).rows[0].last_number);
  addedJob = await withSystem(async db => (await db.query("INSERT INTO work_orders(workspace_id,client_id,site_id,title,status,assignee_id,created_by,report_at) VALUES($1,$2,$3,'Count wording check','done',$4,$5,now()) RETURNING id", [ws, ids.harbor, siteId(1), ids.nabil, ids.imran])).rows[0].id);
  expect(await ask(ids.imran, "Nabil's job count")).toMatchObject({ quick: true, reply: 'Nabil finished 1 job this month and 1 in total.' });
  expect(assistantTurn).not.toHaveBeenCalled();
});
it('lists full names for an ambiguous first name and accepts a full name', async () => {
  await withSystem(async db => {
    for (const id of [ids.sam, ids.nabil]) originalNames.set(id, (await db.query('SELECT name FROM users WHERE id=$1', [id])).rows[0].name);
    await db.query("UPDATE users SET name=CASE WHEN id=$1 THEN 'Sam Kumar' ELSE 'Sam Patel' END WHERE id=ANY($2::uuid[])", [ids.sam, [ids.sam, ids.nabil]]);
  });
  expect(await callTool(context(ids.imran), 'job_counts', { person: 'sam' })).toMatchObject({ isError: true, structuredContent: { error: { message: 'Which person do you mean? Sam Kumar, Sam Patel.' } } });
  expect(await ask(ids.imran, "Sam's job count")).toMatchObject({ quick: true, reply: 'Which person do you mean? Sam Kumar, Sam Patel.' });
  expect(await callTool(context(ids.imran), 'job_counts', { person: 'sAm kUmAr' })).toMatchObject({ structuredContent: { result: { name: 'Sam Kumar', ...await jobRecord(ids.imran, ws, ids.sam) } } });
  expect(assistantTurn).not.toHaveBeenCalled();
});
