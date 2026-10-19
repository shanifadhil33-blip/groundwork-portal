// JOB20 and SET05 live (no AI call): after a demo reset Harbor & Pine is promised a visit within 4 hours; WO 7 is past it and WO 1 is close.
// Imran and Sam see both on the dashboard API and card, missed first; Ravi, Pranav and Faisal get nothing. Quick answers for contract times and
// what needs my attention come from app data. Sam can not change the hours. Screens at 360 and 390 in en-IN and ar-AE. Fails on any missing piece.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/job20-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = {}; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
let s = await sandbox('imran'); await s.reset(); s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`;
for (const who of ['imran', 'sam', 'ravi', 'pranav', 'faisal']) { await s.as(who); const r = await s.api.get(`${A}/dashboard`); const b = r.status() === 200 ? await r.json() : null;
 const list = b?.contract_watch ?? []; res[`watch_${who}`] = r.status() === 200 ? list.map(j => `WO ${j.order_number} ${j.state}`) : r.status();
 if (['imran', 'sam'].includes(who)) { check(r.status() === 200, `${who} dashboard 200`); check(list[0]?.state === 'missed' && list.some(j => j.state === 'close'), `${who} sees missed first and a close job`); check(list.every(j => j.client_name === 'Harbor & Pine Coworking'), `${who} only Harbor jobs`); check(list.length <= 3, `${who} no old history flood (${list.length})`); }
 else check(!list.length, `${who} sees no contract warnings`); }
await s.as('imran'); const ask = async q => { const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: q }] }, timeout: 60000 }); return { status: r.status(), ...(await r.json().catch(() => ({}))) }; };
{ const b = await ask('any contract jobs about to miss?'); res.quickContract = { status: b.status, quick: b.quick, reply: b.reply }; check(b.status === 200 && b.quick === true && /Contract times/.test(b.reply ?? ''), 'contract quick answer'); }
for (const who of ['imran', 'ravi', 'pranav']) { await s.as(who); const t = Date.now(); const b = await ask('What needs my attention?'); res[`attention_${who}`] = { status: b.status, quick: b.quick, ms: Date.now() - t, reply: String(b.reply ?? '').slice(0, 160) };
 check(b.status === 200 && b.quick === true && b.reply && !/^\s*[{\[]/.test(b.reply), `${who} attention answered from app data`); }
await s.as('imran'); const clients = await (await s.api.get(`${A}/clients?pageSize=50`)).json(); const harbor = (clients.data ?? clients).find(c => c.name === 'Harbor & Pine Coworking');
res.harborHours = harbor?.contract_response_hours; check(harbor?.contract_response_hours === 4, 'Harbor promised 4 hours');
await s.as('sam'); { const r = await s.api.patch(`${A}/clients/${harbor?.id}`, { data: { contract_response_hours: 6 } }); res.samPatch = r.status(); check(r.status() === 403, 'Sam can not change hours'); }
const br = await chromium.launch(); const ctxFor = async w => { const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
 await ctx.route('**/api/i18n/translate', r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {} return r.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); }); return ctx; };
for (const who of ['imran', 'sam']) { await s.as(who); const pref = await (await s.api.get('/api/me/preferences')).json().catch(() => ({}));
 for (const lang of ['en-IN', 'ar-AE']) { await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
  for (const w of [360, 390]) { const ctx = await ctxFor(w); const p = await ctx.newPage(); await p.goto(`${B}/dashboard`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(1500);
   const links = p.locator('a[href^="/work-orders/"]', { has: p.locator('strong[data-no-translate]') }); const card = p.locator('.card', { has: p.locator('h2') }).filter({ hasText: /WO 7|WO 1/ });
   const n = await card.count(); check(n >= 1, `${who} ${lang} ${w} contract card`); if (n) await card.first().scrollIntoViewIfNeeded();
   const small = await links.evaluateAll(es => es.filter(e => e.getBoundingClientRect().height < 44).length); check(small === 0, `${who} ${lang} ${w} job links under 44px: ${small}`);
   const side = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); check(!side, `${who} ${lang} ${w} sideways`);
   await p.screenshot({ path: `${OUT}/${who}-${lang}-${w}-dashboard.png` });
   if (who === 'imran' && w === 390) { await p.goto(`${B}/clients/${harbor?.id}`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/imran-${lang}-390-client.png` });
    await p.goto(`${B}/overview`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(1200); check(await p.locator('a[href^="/work-orders/"]').count() >= 1, `imran ${lang} overview card`); await p.screenshot({ path: `${OUT}/imran-${lang}-390-overview.png` }); }
   await ctx.close(); } }
 await s.api.patch('/api/me/preferences', { data: { language: pref.language ?? 'en-IN' } }).catch(() => {}); }
await br.close(); res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'JOB20_FAIL' : 'JOB20_OK'); process.exit(fail.length ? 1 : 0);
