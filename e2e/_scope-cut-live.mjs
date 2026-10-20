// Scope cut live check (Adhil, Oct 20 2026). Fails on empty. Every removed or hidden feature must be gone from every role's
// screens (English and Gulf Arabic, 390 wide) and agent answers, and the server must refuse it. Data stays.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/scope-cut-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = { api: {}, pages: [], agent: [] }; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const AR = JSON.parse(fs.readFileSync(process.env.AR_BEFORE || '/tmp/ar-before.json', 'utf8'));
const EN = ['Arrival window', 'Confirm gate pass', 'Jobs with no gate pass', 'Urgent call', 'Off sick', 'Show the move', 'Midday heat', 'midday heat',
  'Reach the site within', 'Contract times', 'Connect your AI agent', 'Connect AI', 'Cobalt', 'Parts & supplier', 'Close a parts order',
  'Finish the contract', 'Clear the contract', 'Archive this document', 'Send a code', 'WhatsApp channel'];
const ARW = ['Arrival window', 'Confirm gate pass', 'Jobs with no gate pass tomorrow', 'Urgent call', 'Off sick', 'Show the move', 'Midday heat: move this', 'Reach the site within (hours)',
  'Contract times', 'Connect your AI agent', 'Connect AI', 'Parts & supplier', 'Close a parts order', 'Finish the contract', 'Clear the contract'].map(k => AR[k]).filter(Boolean);
check(ARW.length >= 10, `Arabic words for removed items loaded (${ARW.length})`);
const window = /\b\d{1,2}\s?(AM|PM)\s+to\s+\d{1,2}\s?(AM|PM)\b/;
const s0 = await sandbox('imran'); if (!process.env.NO_RESET) await s0.reset(); const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`;
const st = async (p, m = 'get', data) => (await s.api[m](p, data === undefined ? {} : { data })).status();
// Server refuses
const plan = await (await s.api.get(`${A}/day-plan`)).json(); res.api.plan_lines = plan.lines?.length;
check(Array.isArray(plan.lines) && !('gates' in plan), 'day plan has no gate list');
check(!JSON.stringify(plan).match(/"window"|AM to|PM to/), 'day plan has no windows');
for (const body of [{ action: 'confirm_gate', job_id: '00000000-0000-4000-8000-000000000001' }, { action: 'preview', kind: 'urgent', job_id: '00000000-0000-4000-8000-000000000001' }, { action: 'preview', kind: 'sick', person_id: '00000000-0000-4000-8000-000000000001' }]) {
  const c = await st(`${A}/day-plan`, 'post', body); res.api[`day_plan_${body.kind ?? body.action}`] = c; check(c === 410, `day plan ${body.kind ?? body.action} refused (${c})`); }
const dash = await (await s.api.get(`${A}/dashboard`)).json(); check(Array.isArray(dash.contract_watch) && dash.contract_watch.length === 0, 'dashboard has no contract times');
const clients = await (await s.api.get(`${A}/clients?pageSize=50`)).json(); const client = (clients.data ?? clients)[0]; check(client?.id, 'a client to check');
res.api.client_hours = await st(`${A}/clients/${client.id}`, 'patch', { contract_response_hours: 4 }); check(res.api.client_hours >= 400 && res.api.client_hours < 500, 'response hours refused');
res.api.contract_finish = await st(`${A}/clients/${client.id}/contract`, 'post', { finish: true }); check(res.api.contract_finish === 410, 'contract finish refused');
res.api.channel = await st(`${A}/channel`, 'post', { text: 'hi' }); check(res.api.channel === 410, 'WhatsApp channel refused');
for (const p of ['supplier/orders', 'supplier/sync-runs', 'supplier/simulator/events']) { const c = await st(`${A}/${p}`); res.api[p] = c; check(c === 410, `${p} refused (${c})`); }
res.api.supplier_check = await st(`${A}/supplier/check`, 'post', {}); check(res.api.supplier_check === 410, 'supplier check refused');
res.api.token_imran_demo = await st(`${A}/tokens`, 'post', { name: 'x', scope: 'read' }); check(res.api.token_imran_demo === 403, 'no Connect AI key in the demo');
const docs = await (await s.api.get(`${A}/documents`)).json(); const doc = (docs.data ?? docs)[0]; if (check(doc?.id, 'a document to check')) { res.api.doc_archive = await st(`${A}/documents/${doc.id}`, 'post', {}); check(res.api.doc_archive === 410, 'document archive refused'); }
const jobs = await (await s.api.get(`${A}/work-orders?status=scheduled&pageSize=50`)).json(); const job = (jobs.data ?? [])[0]; check(job?.id, 'a scheduled job');
await s.as('sam'); res.api.token_sam = await st(`${A}/tokens`, 'post', { name: 'x', scope: 'read' }); check(res.api.token_sam === 403, 'supervisor cannot make a key');
// Agent answers (two AI calls per language at most; phone ask is a fixed phrase)
const ask = async (who, words) => { await s.as(who); const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: words }] }, timeout: 90000 }); const b = await r.json().catch(() => ({})); return { status: r.status(), reply: String(b.reply ?? b.message ?? ''), pending: b.pending_action }; };
for (const [who, words, lang] of [['ravi', 'change my phone number', 'en'], ['ravi', 'غير رقمي', 'ar'], ['imran', 'What can you do for me today?', 'en'], ['imran', 'وش تقدر تسوي لي اليوم؟', 'ar'], ['faisal', 'When will the technician come?', 'en']]) {
  const a = await ask(who, words); res.agent.push({ who, words, status: a.status, reply: a.reply.slice(0, 400) });
  check(a.status === 200 && a.reply.trim().length > 0, `${who} agent answered: ${words}`);
  check(!a.pending || !/code/i.test(a.pending.summary ?? ''), `${who} no phone code card`);
  for (const w of [...EN, ...ARW]) check(!a.reply.includes(w), `${who} agent reply mentions "${w}"`);
  check(!window.test(a.reply), `${who} agent reply has an arrival window`);
  if (/phone|رقم/.test(words)) check(/office|المكتب/.test(a.reply), `${who} phone ask points to the office`); }
// Screens
const pages = [['imran', '/overview'], ['imran', '/dashboard'], ['imran', '/schedule'], ['imran', `/work-orders/${job?.id}`], ['imran', `/clients/${client?.id}`], ['imran', '/documents'], ['imran', '/settings'], ['imran', '/supplier'],
  ['sam', '/dashboard'], ['sam', `/work-orders/${job?.id}`], ['nabil', '/dashboard'], ['ravi', '/today'], ['ravi', '/work-orders'], ['pranav', '/home'], ['faisal', '/home'], ['kevin', '/home']];
const br = await chromium.launch();
try { for (const lang of ['en-IN', 'ar-AE']) for (const [who, path] of pages) {
  await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  await ctx.route('**/api/i18n/translate', r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {} return r.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); });
  const p = await ctx.newPage(); await p.goto(`${B}${path}`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(lang === 'en-IN' ? 1500 : 3000);
  // Open the phone menu so the nav is in the text too.
  const menu = p.locator('button[aria-label*="menu" i], button[aria-label*="More" i]').first(); if (await menu.count()) { await menu.click().catch(() => {}); await p.waitForTimeout(400); }
  const text = await p.evaluate(() => document.body.innerText); const links = await p.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')));
  const name = `${who}-${path.replace(/[^a-z0-9]+/gi, '_').slice(0, 30)}-${lang}`; await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const row = { who, path, lang, url: p.url(), chars: text.length }; res.pages.push(row);
  check(text.trim().length > 150, `${name} page has content (${text.length})`);
  if (lang === 'ar-AE') check(/[\u0600-\u06FF]/.test(text), `${name} Arabic shown`);
  if (path === '/supplier') check(/\/work-orders/.test(p.url()), `${name} /supplier sends to jobs (${p.url()})`);
  for (const w of [...EN, ...ARW]) check(!text.includes(w), `${name} shows "${w}"`);
  check(!window.test(text), `${name} shows an arrival window`);
  check(!links.some(h => h && (h.startsWith('/supplier') || h.includes('tab=agent-access'))), `${name} links to Parts or Connect AI`);
  await ctx.close(); } }
finally { for (const who of ['imran', 'sam', 'nabil', 'ravi', 'pranav', 'faisal', 'kevin']) { await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' } }).catch(() => {}); } await br.close(); }
check(res.pages.length === pages.length * 2, 'every page loaded');
res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify({ api: res.api, agent: res.agent, pages: res.pages.length, fail }, null, 1)); console.log(fail.length ? 'SCOPECUT_FAIL' : 'SCOPECUT_OK'); process.exit(fail.length ? 1 : 0);
