// NOTIF08 live (no AI call): after a sandbox reset, Ravi taps On the way on Faisal's scheduled job at 390.
// Faisal (household, en-IN and ar-AE, 360/390) then sees On the way on his card and job and a bell notice; Omar (Northgate manager) gets the notice;
// Pranav (other client) and Sam (staff) get none. Fails on any missing piece or empty selector.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/notif08-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = []; const res = {}; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const s0 = await sandbox('imran'); if (!process.env.NO_RESET) await s0.reset(); const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`;
await s.as('faisal'); const faisal = (await (await s.api.get('/api/me')).json()).user?.id; check(faisal, 'faisal id');
await s.as('ravi'); const list = await (await s.api.get(`${A}/work-orders?status=scheduled&pageSize=100`)).json();
const job = (list.data ?? []).find(o => o.created_by === faisal && !o.on_way_at); check(job, 'Faisal scheduled job for Ravi'); if (!job) { console.log(JSON.stringify({ fail, list: (list.data ?? []).length })); process.exit(1); }
res.job = `WO ${job.order_number} ${job.title}`;
const br = await chromium.launch(); const cookies = async () => (await s.api.storageState()).cookies;
const ctxFor = async w => { const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies(await cookies());
 await ctx.route('**/api/i18n/translate', r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {} return r.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); }); return ctx; };
// Ravi taps On the way.
{ const ctx = await ctxFor(390); const p = await ctx.newPage(); await p.goto(`${B}/work-orders/${job.id}`, { waitUntil: 'networkidle' });
  const btn = p.getByRole('button', { name: 'On the way', exact: true }); check(await btn.count() === 1, 'Ravi sees On the way button');
  await p.screenshot({ path: `${OUT}/ravi-390-before.png` }); await btn.click(); await p.waitForTimeout(2500);
  res.raviToast = (await p.locator('.toast-region').innerText().catch(() => '')).slice(0, 80); check(res.raviToast.includes('On the way'), 'Ravi toast says On the way');
  res.raviBadge = await p.locator('.detail-title').innerText().catch(() => ''); check(res.raviBadge.includes('On the way'), 'Ravi badge shows On the way');
  res.raviButtonGone = await btn.count() === 0; check(res.raviButtonGone, 'button gone after tap');
  const box = await p.getByRole('button', { name: /start work/i }).boundingBox().catch(() => null); res.startWorkHeight = box?.height;
  await p.screenshot({ path: `${OUT}/ravi-390-after.png` }); await ctx.close(); }
const notices = async who => { await s.as(who); const r = await (await s.api.get(`${A}/notifications?pageSize=50`)).json(); return (r.data ?? []).filter(n => n.kind === 'on_the_way' && n.entity_id === job.id); };
for (const who of ['faisal', 'omar', 'pranav', 'sam', 'ravi']) { const n = await notices(who); res[`notices_${who}`] = n.map(x => x.message); check(['faisal', 'omar'].includes(who) ? n.length === 1 : n.length === 0, `${who} on_the_way notices ${n.length}`); }
// Faisal sees it in both languages.
await s.as('faisal'); const pref = await (await s.api.get('/api/me/preferences')).json().catch(() => ({}));
for (const lang of ['en-IN', 'ar-AE']) { await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
 for (const w of [360, 390]) { const ctx = await ctxFor(w); const p = await ctx.newPage(); const want = lang === 'ar-AE' ? 'في الطريق' : 'On the way';
  await p.goto(`${B}/home`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  const homeHas = await p.getByText(want, { exact: true }).count(); check(homeHas > 0, `${lang} ${w} home shows ${want}`);
  await p.screenshot({ path: `${OUT}/faisal-${lang}-${w}-home.png` });
  await p.goto(`${B}/work-orders/${job.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  const badge = (await p.locator('.detail-title').innerText().catch(() => '')); check(badge.includes(want), `${lang} ${w} job badge ${want}`);
  res[`sideways_${lang}_${w}`] = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); check(!res[`sideways_${lang}_${w}`], `${lang} ${w} sideways`);
  await p.screenshot({ path: `${OUT}/faisal-${lang}-${w}-job.png` });
  await p.locator('.notification-trigger button').first().click(); await p.waitForTimeout(1200);
  const dialog = p.locator('[role=dialog]').last();
  const sheet = await dialog.innerText().catch(() => ''); res[`bell_${lang}_${w}`] = sheet.slice(0, 200);
  // The actual update must be a visible top-level row for this job, not hidden in grouped details.
  const notice = lang === 'en-IN' ? 'is on the way for' : 'الفني في الدرب';
  const row = dialog.locator(`.notification-item > .activity-link[href="/work-orders/${job.id}"]`).filter({ hasText: notice });
  check(await row.count() === 1 && await row.isVisible(), `${lang} ${w} bell shows the notice as a visible row for this job`);
  await p.screenshot({ path: `${OUT}/faisal-${lang}-${w}-bell.png` }); await ctx.close(); } }
await s.api.patch('/api/me/preferences', { data: { language: pref.language ?? 'en-IN' } }).catch(() => {});
await br.close(); await s.as('imran'); res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'NOTIF08_FAIL' : 'NOTIF08_OK'); process.exit(fail.length ? 1 : 0);
