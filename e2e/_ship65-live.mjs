if (process.env.RUN_ASSISTANT_QA !== '1') { console.log('Skipping live assistant QA during the build freeze'); process.exit(0); }
// Ship 65 live check (Oct 20 2026). Fails on empty. Leftovers of the scope cut and DEMO10 to DEMO12, English and Gulf Arabic, 390 wide.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/ship65-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = { api: {}, agent: [], pages: [] }; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`;
const st = async (p, m = 'get', data) => (await s.api[m](p, data === undefined ? {} : { data })).status();
// Leftovers: Simulate WhatsApp refused, Cobalt webhook and nightly sync off.
res.api.simulate = await st(`${A}/suggestions/simulate`, 'post', {}); check(res.api.simulate === 410, `simulate refused (${res.api.simulate})`);
res.api.cobalt_webhook = await st('/api/webhooks/cobalt', 'post', {}); check(res.api.cobalt_webhook === 503, `Cobalt webhook off (${res.api.cobalt_webhook})`);
res.api.cobalt_cron = await st('/api/cron/supplier-sync'); check(res.api.cobalt_cron === 503, `Cobalt nightly sync off (${res.api.cobalt_cron})`);
const ar = await (await s.api.get(`${B}/i18n/ar-AE.json`)).json(); res.api.ar_done = ar['All done for today']; res.api.ar_late = ar['Demo: make a job late'];
check(/[\u0600-\u06FF]/.test(ar['All done for today'] ?? ''), 'All done for today has Arabic live'); check(/[\u0600-\u06FF]/.test(ar['Demo: make a job late'] ?? ''), 'demo control has Arabic live');
// Agent: phone ask answered in the asker's language; the name lead keeps a capital I.
const ask = async (who, words) => { await s.as(who); const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: words }] }, timeout: 90000 }); const b = await r.json().catch(() => ({})); return { status: r.status(), reply: String(b.reply ?? b.message ?? '') }; };
for (const [words, lang] of [['change my phone number', 'en'], ['غير رقمي', 'ar']]) { const a = await ask('ravi', words); res.agent.push({ words, ...a });
  check(a.status === 200 && a.reply.trim().length > 0, `agent answered ${lang}`);
  if (lang === 'ar') { check(/[\u0600-\u06FF]/.test(a.reply) && /المكتب/.test(a.reply), 'Arabic phone answer in Arabic'); check(!/[A-Za-z]{3,}/.test(a.reply.replace(/Ravi/g, '')), 'Arabic phone answer has no English'); }
  else { check(/office/i.test(a.reply), 'English phone answer points to the office'); check(!/,\s+i\b/.test(a.reply), `capital I kept: ${a.reply.slice(0, 80)}`); } }
// DEMO12: make a job late. Technician and client refused; office gets one late job.
for (const who of ['ravi', 'pranav']) { await s.as(who); const c = await st('/api/demo/late', 'post', {}); res.api[`late_${who}`] = c; check(c === 403, `${who} refused the demo control (${c})`); }
await s.as('imran'); const lr = await s.api.post('/api/demo/late', { data: {} }); const late = await lr.json().catch(() => ({})); res.api.late = { status: lr.status(), ...late };
check(lr.status() === 200 && late.work_order_id, 'office made a job late');
const job = late.work_order_id ? await (await s.api.get(`${A}/work-orders/${late.work_order_id}`)).json() : {}; res.api.late_due = job.due_on ?? job.data?.due_on;
check(res.api.late_due && String(res.api.late_due).slice(0, 10) < new Date().toISOString().slice(0, 10) || String(res.api.late_due).slice(0, 10) <= new Date(Date.now() + 4 * 3600000 - 86400000).toISOString().slice(0, 10), `job due date moved to yesterday (${res.api.late_due})`);
// Screens: the demo menu with the labelled control, the late job, Ravi's day, the Dune free demo page.
const br = await chromium.launch();
try { for (const lang of ['en-IN', 'ar-AE']) for (const [who, path, menu] of [['imran', '/dashboard', true], ['imran', `/work-orders/${late.work_order_id}`, false], ['ravi', '/today', true], ['nabil', '/dashboard', true]]) {
  await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  await ctx.route('**/api/i18n/translate', r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {} return r.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); });
  const p = await ctx.newPage(); await p.goto(`${B}${path}`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(lang === 'en-IN' ? 1500 : 3000);
  if (menu) { const b = p.locator('button.phone-demo-options').first(); if (check(await b.count(), `${who} ${lang} demo menu button`)) { await b.click(); await p.waitForTimeout(600); } }
  const text = await p.evaluate(() => document.body.innerText); const name = `${who}-${path.replace(/[^a-z0-9]+/gi, '_').slice(0, 30)}-${lang}`;
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: !menu }); res.pages.push({ who, path, lang, chars: text.length });
  check(text.trim().length > 150, `${name} page has content (${text.length})`); if (lang === 'ar-AE') check(/[\u0600-\u06FF]/.test(text), `${name} Arabic shown`);
  check(!text.includes('Simulate WhatsApp'), `${name} shows Simulate WhatsApp`);
  const label = lang === 'ar-AE' ? ar['Demo: make a job late'] : 'Demo: make a job late';
  if (menu) check(who === 'ravi' ? !text.includes(label) : text.includes(label), `${name} demo control ${who === 'ravi' ? 'hidden from technician' : 'shown and labelled'}`);
  await ctx.close(); } }
finally { for (const who of ['imran', 'ravi', 'nabil']) { await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' } }).catch(() => {}); } await br.close(); }
check(res.pages.length === 8, 'every page loaded');
res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'SHIP65_FAIL' : 'SHIP65_OK'); process.exit(fail.length ? 1 : 0);
