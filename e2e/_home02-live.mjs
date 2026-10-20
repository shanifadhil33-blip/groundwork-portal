// HOME02 live (demo sandbox): demo companies are never listed and demo users can not search or ask to join, so this checks
// the refusals and the screens: search API refused for a demo user, listing switch refused, Requests to join loads for Imran
// (admin) and is refused for Sam, Ravi and Pranav, the Clients page shows Requests to join, Settings shows the Find your company
// section, /find-company holds at 360 and 390 in English and Gulf Arabic with no sideways scroll, and no "Add another company"
// link in demo. The real search, request, accept and address flow is covered by tests/home02-find-company.test.ts. Fails on any missing piece.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/home02-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = {}; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`;
const q = await s.api.get('/api/find-company?q=du'); res.search = q.status(); check(q.status() >= 400 && q.status() < 500, 'demo search refused');
const j = await s.api.post('/api/join-requests', { data: { workspace_id: s.ws, kind: 'household', name: 'Test', phone: '0500000000', address: 'Villa 1', note: '' } }); res.join = j.status(); check(j.status() >= 400 && j.status() < 500, 'demo join refused');
const l = await s.api.patch(A, { data: { listed: true } }); res.listing = l.status(); check(l.status() >= 400 && l.status() < 500, 'demo listing refused');
const st = await (await s.api.get(`${A}/settings`)).json(); res.listed_now = st.listed ?? st.data?.listed; check(res.listed_now === false, 'demo company not listed');
const r = await s.api.get(`${A}/join-requests`); res.imran_requests = r.status(); check(r.status() === 200, 'Imran reads requests');
for (const who of ['sam', 'ravi', 'pranav']) { const o = await sandbox(who); const x = await o.api.get(`/api/workspaces/${o.ws}/join-requests`); res[`${who}_requests`] = x.status(); check(x.status() === 403, `${who} refused requests`); }
const before = await (await s.api.get('/api/me/preferences')).json().catch(() => ({})); const was = before.language ?? before.data?.language ?? 'en-IN';
const br = await chromium.launch();
try { for (const lang of ['en-IN', 'ar-AE']) { await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
 for (const w of [360, 390]) { const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  const p = await ctx.newPage(); const wait = lang === 'en-IN' ? 1200 : 3000;
  await p.goto(`${B}/clients`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(wait);
  const c = await p.locator('main').innerText().catch(() => ''); if (lang === 'en-IN') check(/Requests to join/.test(c), `${w} clients Requests to join`);
  check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${lang} ${w} clients sideways`);
  await p.locator('h2', { hasText: /Requests to join|طلبات/ }).first().scrollIntoViewIfNeeded().catch(() => {}); await p.screenshot({ path: `${OUT}/imran-${lang}-${w}-requests.png` });
  await p.goto(`${B}/settings?tab=company`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(wait);
  const t = await p.locator('main').innerText().catch(() => ''); if (lang === 'en-IN') check(/Find your company/.test(t), `${w} settings listing section`);
  check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${lang} ${w} settings sideways`);
  await p.locator('h3', { hasText: /Find your company|ابحث/ }).first().scrollIntoViewIfNeeded().catch(() => {}); await p.screenshot({ path: `${OUT}/imran-${lang}-${w}-listing.png` });
  await p.goto(`${B}/find-company`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(wait);
  const f = await p.locator('main').innerText().catch(() => ''); check(f.trim().length > 20, `${lang} ${w} find page has content`); if (lang === 'en-IN') check(/Find your company/.test(f), `${w} find page title`);
  check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${lang} ${w} find sideways`);
  check(await p.getByRole('link', { name: 'Add another company' }).count() === 0, `${lang} ${w} no Add another company in demo`);
  await p.screenshot({ path: `${OUT}/imran-${lang}-${w}-find.png`, fullPage: true }); await ctx.close(); } } }
finally { await s.api.patch('/api/me/preferences', { data: { language: was } }).catch(() => {}); await br.close(); }
res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'HOME02_FAIL' : 'HOME02_OK'); process.exit(fail.length ? 1 : 0);
