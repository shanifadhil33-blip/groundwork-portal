// AGENT12 live (no AI call): job counts from app data. Imran and Sam ask about Ravi and get the same numbers as Ravi's record;
// Ravi asks about himself and gets his numbers, asks about Sam and is refused plainly; Pranav and Faisal never get a count.
// Phone check: the Agent panel at 360 and 390 shows the answer, no sideways scroll. Fails on any missing piece.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/agent12-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = {}; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`;
const ask = async q => { const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: q }] }, timeout: 60000 }); return { status: r.status(), ...(await r.json().catch(() => ({}))) }; };
const team = await (await s.api.get(`${A}/team`)).json(); const people = team.data ?? team.members ?? team;
const ravi = people.find(p => /^Ravi\b/.test(p.name ?? '')); check(!!ravi, 'Ravi on the team');
const rec = await (await s.api.get(`${A}/members/${ravi?.user_id}/record`)).json().catch(() => ({})); res.raviRecord = rec;
check(Number.isInteger(rec.month) && Number.isInteger(rec.total), 'Ravi record has numbers');
const want = () => `${rec.month} ${rec.month === 1 ? 'job' : 'jobs'} this month and ${rec.total} in total.`;
for (const who of ['imran', 'sam']) { await s.as(who); const b = await ask('How many jobs has Ravi completed this month, and in total?'); res[`count_${who}`] = { status: b.status, quick: b.quick, reply: b.reply };
 check(b.status === 200 && b.quick === true && b.reply === `Ravi finished ${want()}`, `${who} gets Ravi counts from app data`); }
await s.as('ravi'); { const b = await ask('How many jobs did I complete this month?'); res.count_ravi_self = { status: b.status, quick: b.quick, reply: b.reply }; check(b.quick === true && b.reply === `You finished ${want()}`, 'Ravi gets his own counts'); }
{ const b = await ask('How many jobs did Sam finish this month?'); res.count_ravi_sam = { status: b.status, quick: b.quick, reply: b.reply }; check(b.quick === true && b.reply === 'You can see your own count.', 'Ravi refused for Sam'); }
for (const who of ['pranav', 'faisal']) { await s.as(who); const b = await ask('How many jobs has Ravi completed this month?'); res[`count_${who}`] = { status: b.status, quick: b.quick, reply: String(b.reply ?? '').slice(0, 200) };
 check(b.quick !== true && !/finished \d+ jobs? this month/.test(b.reply ?? ''), `${who} gets no count`); }
const br = await chromium.launch();
for (const [who, q, re] of [['imran', 'How many jobs has Ravi completed this month, and in total?', /Ravi finished \d+ jobs? this month and \d+ in total/], ['ravi', 'How many jobs did I complete this month?', /You finished \d+ jobs? this month and \d+ in total/]]) {
 await s.as(who);
 for (const w of [360, 390]) { const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  const p = await ctx.newPage(); await p.goto(`${B}/work-orders`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(1200);
  const opener = p.locator('.phone-assistant'); if (!check(await opener.count() > 0, `${who} ${w} Agent button`)) { await ctx.close(); continue; }
  await opener.first().click(); const input = p.locator('#assistant-input'); await input.waitFor({ timeout: 10000 }); const panel = p.locator('[role="dialog"]').last();
  const before = await panel.locator('.assistant-message.assistant').count(); await input.fill(q); await p.locator('.assistant-send').first().click();
  await panel.locator('.assistant-message.assistant').nth(before).waitFor({ timeout: 30000 }).catch(() => {}); await p.waitForTimeout(600);
  const text = await panel.locator('.assistant-message.assistant').nth(before).innerText().catch(() => ''); res[`ui_${who}_${w}`] = text.slice(0, 160);
  check(re.test(text), `${who} ${w} answer shown in the Agent`);
  check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${who} ${w} sideways`);
  await p.screenshot({ path: `${OUT}/${who}-${w}-agent-count.png` }); await ctx.close(); } }
await br.close(); res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'AGENT12_FAIL' : 'AGENT12_OK'); process.exit(fail.length ? 1 : 0);
