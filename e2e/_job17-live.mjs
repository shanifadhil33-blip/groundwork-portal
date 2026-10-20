// JOB17 and JOB13 live (no AI call): after a sandbox reset, Ravi records Could not get in on Faisal's scheduled job through the
// Yes card; the job status stays the same, Faisal and Sam get the plain notice, Faisal can rebook from free slots, Pranav (other
// client) is refused, and the job page holds at 360 and 390 for Ravi and Faisal in English and Gulf Arabic. Fails on any missing piece.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/job17-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = {}; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const s0 = await sandbox('imran'); if (!process.env.NO_RESET) await s0.reset(); const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`;
await s.as('faisal'); const faisal = (await (await s.api.get('/api/me')).json()).user?.id;
await s.as('ravi'); const list = await (await s.api.get(`${A}/work-orders?status=scheduled&pageSize=100`)).json();
const job = (list.data ?? []).find(o => o.created_by === faisal); if (!check(job, 'Faisal scheduled job for Ravi')) { console.log(JSON.stringify(fail)); process.exit(1); }
res.job = `WO ${job.order_number} ${job.title}`; const N = `${A}/work-orders/${job.id}/next-step`;
const st = await (await s.api.get(N)).json(); res.ravi_state = { can_no_access: st.can_no_access }; check(st.can_no_access === true, 'Ravi can record no access');
const br = await chromium.launch(); const shot = async (who, lang, w, name) => { await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
 const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
 await ctx.route('**/api/i18n/translate', r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {} return r.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); });
 const p = await ctx.newPage(); await p.goto(`${B}/work-orders/${job.id}`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(lang === 'en-IN' ? 1500 : 3000);
 const card = p.locator('.job-next-step'); const has = await card.count() > 0; const text = has ? await card.innerText() : '';
 check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${who} ${lang} ${w} sideways`);
 if (has) await card.first().scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/${who}-${lang}-${w}-${name}.png` }); await ctx.close(); return { has, text }; };
try {
 const before = await shot('ravi', 'en-IN', 390, 'before'); check(before.has && /Could not get in/.test(before.text), 'Ravi sees Could not get in');
 await s.as('ravi'); const prep = await (await s.api.post(N, { data: { action: 'no_access' } })).json(); const aid = prep.pending_action?.id; check(aid, 'Yes card made'); res.summary = prep.pending_action?.summary;
 const mid = await (await s.api.get(`${A}/work-orders/${job.id}`)).json(); check((mid.status ?? mid.data?.status) === 'scheduled', 'nothing changed before Yes');
 const conf = await s.api.post(`${A}/assistant`, { data: { messages: [], confirm_action_id: aid }, timeout: 60000 }); res.confirm = conf.status(); check(conf.status() < 300, 'Yes confirmed');
 const after = await (await s.api.get(`${A}/work-orders/${job.id}`)).json(); res.status_after = after.status ?? after.data?.status; check(res.status_after === 'scheduled', 'status unchanged after no access');
 for (const who of ['faisal', 'sam', 'pranav']) { await s.as(who); const r = await (await s.api.get(`${A}/notifications?pageSize=50`)).json(); const n = (r.data ?? []).filter(x => x.kind === 'job_next_step' && x.entity_id === job.id); res[`notice_${who}`] = n.map(x => x.message ?? x.job_step_body); check(who === 'pranav' ? n.length === 0 : n.length === 1, `${who} notices ${n.length}`); }
 await s.as('pranav'); const pr = await s.api.get(N); res.pranav_next = pr.status(); check(pr.status() >= 400 && pr.status() < 500, 'Pranav refused');
 await s.as('faisal'); const fs2 = await (await s.api.get(N)).json(); check(fs2.can_book === true, 'Faisal can rebook'); const slots = await (await s.api.get(`${N}?slots=1`)).json(); res.slots = (slots.data ?? slots.slots ?? slots).length; check(res.slots > 0, 'free slots offered');
 for (const lang of ['en-IN', 'ar-AE']) for (const w of [360, 390]) { const f = await shot('faisal', lang, w, 'rebook'); check(f.has, `Faisal ${lang} ${w} next step card`); if (lang === 'en-IN') check(/Rebook|new time/i.test(f.text), `Faisal ${w} rebook offer`); }
 await shot('ravi', 'ar-AE', 360, 'after');
} finally { for (const who of ['ravi', 'faisal']) { await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' } }).catch(() => {}); } await br.close(); }
res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'JOB17_FAIL' : 'JOB17_OK'); process.exit(fail.length ? 1 : 0);
