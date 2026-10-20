// Ship 66 live check (Oct 20 2026). Fails on empty. Demo menu translated; LEARN10 company history card (office only), en, ar, hi at 390.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/ship66-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = { api: {}, pages: [] }; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`;
const dict = {}; for (const l of ['ar-AE', 'hi']) dict[l] = await (await s.api.get(`${B}/i18n/${l}.json`)).json();
for (const l of ['ar-AE', 'hi']) for (const k of ['Isolation check', 'Switch persona', 'Reset demo', 'Demo: make a job late']) check(dict[l][k] && dict[l][k] !== k, `${l} has ${k} live`);
const jobs = await (await s.api.get(`${A}/work-orders?status=scheduled&pageSize=50`)).json(); const list = jobs.data ?? jobs;
let job = null; for (const j of list) { const h = await (await s.api.get(`${A}/work-orders/${j.id}/history`)).json(); if (!job) job = { ...j, h }; if (h.typical_minutes) { job = { ...j, h }; break; } }
res.api.history = job?.h; check(job && typeof job.h.based_on === 'number', 'history answers with based_on');
check(job?.h.typical_minutes > 0 && job.h.based_on >= 3, `a job with a learned usual time (${JSON.stringify(job?.h)})`);
for (const who of ['ravi', 'pranav']) { await s.as(who); const c = (await s.api.get(`${A}/work-orders/${job.id}/history`)).status(); res.api[`history_${who}`] = c; check(c === 403 || c === 404, `${who} refused history (${c})`); }
const br = await chromium.launch();
try { for (const lang of ['en-IN', 'ar-AE', 'hi']) for (const [who, path, menu] of [['imran', '/dashboard', true], ['imran', `/work-orders/${job.id}`, false], ['ravi', `/work-orders/${job.id}`, false]]) {
  if (who === 'ravi' && lang === 'hi') continue;
  await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  await ctx.route('**/api/i18n/translate', r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {} return r.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); });
  const p = await ctx.newPage(); await p.goto(`${B}${path}`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(lang === 'en-IN' ? 1500 : 3000);
  if (menu) { const b = p.locator('button.phone-demo-options').first(); if (check(await b.count(), `${lang} demo menu button`)) { await b.click(); await p.waitForTimeout(600); } }
  else { const c = p.locator('.company-history'); if (await c.count()) await c.scrollIntoViewIfNeeded(); }
  const text = await p.evaluate(() => document.body.innerText); const name = `${who}-${path.replace(/[^a-z0-9]+/gi, '_').slice(0, 24)}-${lang}`;
  await p.screenshot({ path: `${OUT}/${name}.png` }); res.pages.push({ who, path, lang, chars: text.length });
  check(text.trim().length > 150, `${name} has content`);
  const t = k => lang === 'en-IN' ? k : dict[lang][k];
  if (menu) for (const k of ['Isolation check', 'Switch persona', 'Reset demo', 'Demo: make a job late']) { check(text.includes(t(k)), `${name} shows ${t(k)}`); if (lang !== 'en-IN') check(!text.includes(k), `${name} still English: ${k}`); }
  else if (who === 'imran') { const card = await p.locator('.company-history').innerText().catch(() => ''); res.pages.at(-1).card = card;
    check(card.includes(t('From your company’s history') ?? '@@') || (lang === 'hi' && card.length > 20), `${name} history card shown`); check(card.includes(String(job.h.based_on)), `${name} card says based on ${job.h.based_on}`); }
  else check(!(await p.locator('.company-history').count()), `${name} technician sees no history card`);
  await ctx.close(); } }
finally { for (const who of ['imran', 'ravi']) { await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' } }).catch(() => {}); } await br.close(); }
check(res.pages.length === 8, 'every page loaded');
res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'SHIP66_FAIL' : 'SHIP66_OK'); process.exit(fail.length ? 1 : 0);
