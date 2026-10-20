// PR #2 live (no AI call). Fails on empty. Client sign off with stars and thanks; client sees only a price he was told; the
// morning plan, urgent and sick moves preview for Imran and refuse Ravi; Ravi says I am on the way as himself; a standing rule
// is asked first and lands in his memory, a normal sentence is not caught; an unexpired document cannot be archived; screens
// at 360 and 390 in English and Gulf Arabic.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/nov-plan-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = {}; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const s0 = await sandbox('imran'); if (!process.env.NO_RESET) await s0.reset(); const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`;
const ask = async words => { const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: words }] }, timeout: 60000 }); return { status: r.status(), ...(await r.json().catch(() => ({}))) }; };
// Sign off with rating
await s.as('faisal'); const faisal = (await (await s.api.get('/api/me')).json()).user?.id;
await s.as('ravi'); const list = await (await s.api.get(`${A}/work-orders?status=scheduled&pageSize=100`)).json();
const mine = (list.data ?? []); const job = mine.find(o => o.created_by === faisal); check(job, 'Faisal job for Ravi');
const J = `${A}/work-orders/${job.id}`, C = `${J}/close`; res.job = `WO ${job.order_number} ${job.title}`;
await s.api.patch(J, { data: { status: 'in_progress', updated_at: job.updated_at } }); const cur = await (await s.api.get(J)).json();
check((await s.api.post(`${J}/report`, { data: { problem: 'Handrail loose', work: 'Tightened the bolts', part: '', outcome: 'fixed', updated_at: cur.updated_at ?? cur.data?.updated_at } })).status() < 300, 'report');
await s.as('faisal'); const noStars = await s.api.post(C, { data: { action: 'sign_off' } }); check(noStars.status() === 422, 'sign off needs stars');
const so = await s.api.post(C, { data: { action: 'sign_off', stars: 5, thanks: 'Thank you Ravi' } }); res.sign = so.status(); check(so.status() < 300, 'signed with 5 stars');
const fc = await (await s.api.get(C)).json(); res.faisal_card = fc.card; check(fc.signed_off && fc.card?.thanks, 'client sees thanks'); check(fc.card?.cost == null && !fc.draft, 'client sees no draft amounts');
await s.as('imran'); const ic = await s.api.post(C, { data: { action: 'sign_off', stars: 3 } }); check(ic.status() >= 400, 'office cannot rate');
// Day plan
const plan = await (await s.api.get(`${A}/day-plan`)).json(); res.plan = { can_plan: plan.can_plan, lines: plan.lines?.length, gates: plan.gates?.length, visits: plan.visits?.length, people: plan.people?.length };
check(plan.can_plan === true, 'Imran can plan'); check((plan.lines?.length ?? 0) + (plan.visits?.length ?? 0) > 0, 'plan has something');
const pv = await (await s.api.post(`${A}/day-plan`, { data: { action: 'preview', kind: 'morning' } })).json(); check(typeof pv.fingerprint === 'string', 'morning preview');
if (plan.visits?.length) { const u = await (await s.api.post(`${A}/day-plan`, { data: { action: 'preview', kind: 'urgent', job_id: plan.visits[0].id } })).json(); res.urgent = u.lines?.length; check(u.lines?.length > 0, 'urgent move preview'); }
const ravi = plan.people?.find(p => /Ravi/.test(p.name)); if (check(ravi, 'Ravi in people')) { const sk = await (await s.api.post(`${A}/day-plan`, { data: { action: 'preview', kind: 'sick', person_id: ravi.id } })).json(); res.sick = sk.summary; check(typeof sk.summary === 'string', 'sick preview'); }
const stale = await s.api.post(`${A}/day-plan`, { data: { action: 'approve', kind: 'morning', fingerprint: 'old' } }); check(stale.status() === 409, 'stale plan refused');
await s.as('ravi'); const rp = await (await s.api.get(`${A}/day-plan`)).json(); check(rp.can_plan === false && !(rp.people ?? []).length, 'Ravi sees no plan controls');
const rpost = await s.api.post(`${A}/day-plan`, { data: { action: 'preview', kind: 'morning' } }); check(rpost.status() === 403, 'Ravi cannot plan');
// On the way as himself
const ow = await ask('I am on the way'); res.on_way = ow.reply; check(ow.status === 200 && /on the way|no visit|Open the job/i.test(ow.reply ?? ''), 'on the way answered');
// Rules
const normal = await ask('The AC always leaks in the tower'); check(!normal.pending_action || !/remember this/i.test(normal.pending_action?.summary ?? ''), 'normal sentence not caught');
const rule = await ask('From now on call the client before every visit'); res.rule = rule.reply; check(rule.pending_action?.id, 'rule asks first');
if (rule.pending_action?.id) { const y = await s.api.post(`${A}/assistant`, { data: { messages: [], confirm_action_id: rule.pending_action.id }, timeout: 60000 }); check(y.status() < 300, 'rule yes');
  const mem = await (await s.api.get(`${A}/assistant/learning`)).json().catch(() => ({})); res.memory_has_rule = JSON.stringify(mem).includes('call the client before every visit'); check(res.memory_has_rule, 'rule in his memory'); }
const once = await ask('Just this once move my first job'); check(/one time/i.test(once.reply ?? ''), 'once not remembered');
// Documents
await s.as('imran'); const docs = await (await s.api.get(`${A}/documents`)).json(); const d = (docs.data ?? docs).find?.(x => x.expires_on && new Date(x.expires_on) > new Date());
if (d) { const a = await s.api.post(`${A}/documents/${d.id}`); check(a.status() === 409, 'unexpired doc not archived'); }
// Screens
const br = await chromium.launch();
const shot = async (who, path, sel, lang, w, name) => { await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
  const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  await ctx.route('**/api/i18n/translate', r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {} return r.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); });
  const p = await ctx.newPage(); await p.goto(`${B}${path}`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(lang === 'en-IN' ? 1500 : 3000);
  const el = p.locator(sel).first(); const has = await el.count() > 0; check(has, `${who} ${lang} ${w} ${sel}`); const text = has ? await el.innerText() : '';
  if (lang !== 'en-IN') check(/[\u0600-\u06FF]/.test(text) && !/\b(AM|PM)\b/.test(text), `${who} ar ${w} ${sel} Arabic, no AM PM`);
  check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${who} ${lang} ${w} sideways`);
  if (has) { const box = await el.boundingBox(); if (box && sel !== '.arrival-window') check(box.width >= w - 80, `${who} ${w} ${sel} full width (${Math.round(box.width)})`); await el.scrollIntoViewIfNeeded(); }
  await p.screenshot({ path: `${OUT}/${who}-${name}-${lang}-${w}.png` }); await ctx.close(); return text; };
try { for (const lang of ['en-IN', 'ar-AE']) for (const w of [360, 390]) {
  await shot('faisal', `/work-orders/${job.id}`, '.job-done-card', lang, w, 'signoff');
  await shot('imran', '/overview', '.day-plan', lang, w, 'plan');
  await shot('ravi', '/today', '.arrival-window', lang, w, 'window'); } }
finally { for (const who of ['imran', 'faisal', 'ravi']) { await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' } }).catch(() => {}); } await br.close(); }
res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'NOVPLAN_FAIL' : 'NOVPLAN_OK'); process.exit(fail.length ? 1 : 0);
