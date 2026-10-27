if (process.env.RUN_ASSISTANT_QA !== '1') { console.log('Skipping live assistant QA during the build freeze'); process.exit(0); }
// PR #1 live (no AI call): Ravi reports Fixed with a Washer on Faisal's job; Faisal signs off through the Yes step; Imran (owner)
// sees the unsent draft bill (Work 150 + Washer 25) and keeps it; Ravi and Faisal never see its amounts; Pranav is refused; the Job
// done card holds at 360 and 390 in English and Gulf Arabic; the phone change says plainly no code went out and saves nothing.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/nov-close-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = {}; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const s0 = await sandbox('imran'); if (!process.env.NO_RESET) await s0.reset(); const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`;
await s.as('faisal'); const faisal = (await (await s.api.get('/api/me')).json()).user?.id;
await s.as('ravi'); const list = await (await s.api.get(`${A}/work-orders?status=scheduled&pageSize=100`)).json();
const job = (list.data ?? []).find(o => o.created_by === faisal); if (!check(job, 'Faisal scheduled job for Ravi')) { console.log(JSON.stringify(fail)); process.exit(1); }
res.job = `WO ${job.order_number} ${job.title}`; const J = `${A}/work-orders/${job.id}`, C = `${J}/close`;
await s.api.patch(J, { data: { status: 'in_progress', updated_at: job.updated_at } });
const cur = await (await s.api.get(J)).json(); const up = cur.updated_at ?? cur.data?.updated_at;
const rep = await s.api.post(`${J}/report`, { data: { problem: 'Tap leaking', work: 'Changed the washer', part: 'Washer', outcome: 'fixed', updated_at: up } }); res.report = rep.status(); check(rep.status() < 300, 'report saved');
const rv = await (await s.api.get(C)).json(); res.ravi_close = { can_sign_off: rv.can_sign_off, cost: rv.card?.cost, draft: !!rv.draft }; check(rv.card && rv.card.problem === 'Tap leaking', 'Ravi job done card has problem'); check(rv.card?.cost == null && !rv.draft, 'Ravi sees no bill amounts'); check(!rv.can_sign_off, 'technician cannot sign off');
await s.as('pranav'); const pc = await s.api.get(C); res.pranav = pc.status(); check(pc.status() >= 400 && pc.status() < 500, 'Pranav refused');
await s.as('faisal'); const f1 = await (await s.api.get(C)).json(); check(f1.can_sign_off === true, 'Faisal can sign off'); check(f1.card?.cost == null && !f1.draft, 'Faisal sees no draft amounts');
const so = await s.api.post(C, { data: { action: 'sign_off' } }); res.sign = so.status(); check(so.status() < 300, 'sign off saved');
const f2 = await (await s.api.get(C)).json(); check(f2.signed_off === true && !f2.can_sign_off, 'signed off stays'); const again = await s.api.post(C, { data: { action: 'sign_off' } }); check(again.status() >= 400, 'second sign off refused');
await s.as('imran'); const i1 = await (await s.api.get(C)).json(); res.draft = i1.draft; check(i1.draft && i1.draft.lines.length === 2 && i1.draft.cost === '175.00' && i1.draft.can_keep, 'owner sees draft 175.00');
const kp = await s.api.post(C, { data: { action: 'keep_draft' } }); check(kp.status() < 300, 'owner keeps draft'); const i2 = await (await s.api.get(C)).json(); check(i2.draft?.status === 'kept', 'draft kept, not sent');
// Phone change: no sender is connected, so nothing is sent or saved.
await s.as('ravi'); const me0 = (await (await s.api.get('/api/me')).json()).user?.phone ?? null;
for (const words of ['Change my phone number', 'My phone number is +971 50 111 2233', '123456']) { const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: words }] }, timeout: 60000 }); const b = await r.json(); res[`phone_${words.slice(0, 12)}`] = { status: r.status(), reply: b.reply, card: !!b.pending_action };
  check(!b.pending_action, `${words}: no Send a code card`); check(!/I will send|code from your new number|code was sent/i.test(b.reply ?? ''), `${words}: never claims a code`); }
check(/no code went out/.test(res['phone_Change my ph']?.reply ?? ''), 'phone ask says no code went out');
const me1 = (await (await s.api.get('/api/me')).json()).user?.phone ?? null; check(me0 === me1, 'phone unchanged');
const br = await chromium.launch();
try { for (const [who, want] of [['faisal', /Signed off/], ['imran', /Draft bill/]]) for (const lang of ['en-IN', 'ar-AE']) for (const w of [360, 390]) {
  await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
  const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  await ctx.route('**/api/i18n/translate', r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {} return r.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); });
  const p = await ctx.newPage(); await p.goto(`${B}/work-orders/${job.id}`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(lang === 'en-IN' ? 1500 : 3000);
  const card = p.locator('.job-close'); const has = await card.count() > 0; check(has, `${who} ${lang} ${w} job done card`); const text = has ? await card.innerText() : '';
  if (lang === 'en-IN') { check(want.test(text), `${who} ${w} ${want}`); check(who === 'imran' || !/AED|175/.test(text), `${who} ${w} no amounts`); }
  else check(/[\u0600-\u06FF]/.test(text) && !/Job done|Signed off|Draft bill/.test(text), `${who} ar ${w} card in Arabic`);
  check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${who} ${lang} ${w} sideways`);
  if (has) await card.first().scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/${who}-${lang}-${w}-close.png` }); await ctx.close(); } }
finally { for (const who of ['imran', 'faisal']) { await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' } }).catch(() => {}); } await br.close(); }
res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'NOVCLOSE_FAIL' : 'NOVCLOSE_OK'); process.exit(fail.length ? 1 : 0);
