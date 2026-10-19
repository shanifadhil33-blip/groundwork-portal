// CLIENT10 live (no AI call): demo WO with tenant Hassan in 1204. Imran and Pranav see name and phone; Kevin (client office) and Faisal do not.
// Pranav fills For a tenant on New request at 390 and sends it; Imran approves; the job carries the tenant. Kevin sending tenant fields gets 400.
// Phone screens at 360 and 390 (en-IN, ar-AE): tenant row, tel link 44px, no sideways scroll. Fails on any missing piece.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/client10-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = {}; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`;
await s.as('imran'); const all = await (await s.api.get(`${A}/work-orders?pageSize=100&q=`)).json();
let wo = (all.data ?? []).find(o => o.tenant_unit === '1204'); check(wo, 'demo job with tenant 1204 (reset may be needed)');
if (!wo) { console.log(JSON.stringify({ fail })); process.exit(1); }
res.job = `WO ${wo.order_number} ${wo.title}`;
for (const who of ['imran', 'pranav', 'kevin', 'faisal', 'omar']) { await s.as(who); const r = await s.api.get(`${A}/work-orders/${wo.id}`); const b = r.status() === 200 ? await r.json() : null;
  res[`detail_${who}`] = b ? { unit: b.tenant_unit ?? null, name: b.tenant_name ?? null, phone: b.tenant_phone ?? null } : r.status();
  const l = await (await s.api.get(`${A}/work-orders?pageSize=100`)).json(); const row = (l.data ?? []).find(o => o.id === wo.id); res[`list_${who}`] = row ? { name: row.tenant_name ?? null, phone: row.tenant_phone ?? null } : 'not visible';
  const full = ['imran', 'pranav'].includes(who);
  if (full) check(b?.tenant_name === 'Hassan' && b?.tenant_phone, `${who} sees tenant name and phone`);
  else { check(!b || (!b.tenant_name && !b.tenant_phone), `${who} detail hides name and phone`); check(!row || (!row.tenant_name && !row.tenant_phone), `${who} list hides name and phone`); } }
// Kevin (office) may not add a tenant.
await s.as('kevin'); const sites = await (await s.api.get(`${A}/request-sites`)).json(); const site = (Array.isArray(sites) ? sites : sites.data ?? [])[0];
const kv = await s.api.post(`${A}/work-orders`, { data: { title: 'Tenant check by office', site_id: site?.id, tenant_unit: '9' } }); res.kevinTenantStatus = kv.status(); check(kv.status() === 400, 'Kevin gets 400');
const br = await chromium.launch(); const ctxFor = async w => { const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  await ctx.route('**/api/i18n/translate', r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {} return r.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); }); return ctx; };
// Screens: tenant row for Imran and Pranav, none for Kevin; Pranav's form.
for (const who of ['imran', 'pranav', 'kevin']) { await s.as(who); const pref = await (await s.api.get('/api/me/preferences')).json().catch(() => ({}));
 for (const lang of ['en-IN', 'ar-AE']) { await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
  for (const w of [360, 390]) { const ctx = await ctxFor(w); const p = await ctx.newPage(); await p.goto(`${B}/work-orders/${wo.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
   const tel = p.locator('a[href^="tel:+971500001204"]'); const n = await tel.count(); const box = n ? await tel.first().boundingBox() : null;
   if (who === 'kevin') check(n === 0 && !(await p.content()).includes('Hassan'), `kevin ${lang} ${w} no tenant contact`);
   else { check(n === 1 && box && box.height >= 44, `${who} ${lang} ${w} tel link 44px (${box?.height})`); await tel.first().scrollIntoViewIfNeeded(); }
   const side = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); check(!side, `${who} ${lang} ${w} sideways`);
   await p.screenshot({ path: `${OUT}/${who}-${lang}-${w}-job.png` });
   if (who === 'pranav') { await p.goto(`${B}/work-orders/new`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200); const sec = p.locator('#order-tenant_unit'); check(await sec.count() === 1, `pranav ${lang} ${w} form has tenant fields`); await sec.scrollIntoViewIfNeeded().catch(() => {});
     res[`formSideways_${lang}_${w}`] = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); check(!res[`formSideways_${lang}_${w}`], `pranav form ${lang} ${w} sideways`); await p.screenshot({ path: `${OUT}/pranav-${lang}-${w}-form.png` }); }
   if (who === 'kevin') { await p.goto(`${B}/work-orders/new`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200); check(await p.locator('#order-tenant_unit').count() === 0, `kevin ${lang} ${w} form has no tenant fields`); }
   await ctx.close(); } }
 await s.api.patch('/api/me/preferences', { data: { language: pref.language ?? 'en-IN' } }).catch(() => {}); }
// Pranav sends one with the form at 390 (English), Imran approves, the job carries it.
await s.as('pranav'); { const ctx = await ctxFor(390); const p = await ctx.newPage(); await p.goto(`${B}/work-orders/new`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
 await p.locator('#order-title').fill('Kitchen tap dripping, live tenant check'); await p.locator('#order-tenant_unit').fill('905'); await p.locator('#order-tenant_name').fill('Yusuf'); await p.locator('#order-tenant_phone').fill('+971 50 000 0905');
 const siteBox = p.locator('#order-site_id'); if (await siteBox.count()) { await siteBox.scrollIntoViewIfNeeded(); await siteBox.click(); await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/pranav-390-sites.png` }); await siteBox.scrollIntoViewIfNeeded(); const item = p.getByText('Harbor Annex', { exact: true }).last(); check(await item.count() > 0, 'site list opens'); await item.click(); await p.waitForTimeout(300); }
 await p.screenshot({ path: `${OUT}/pranav-390-filled.png` }); await p.getByRole('button', { name: 'Submit request' }).first().click(); await p.waitForTimeout(3000);
 await p.screenshot({ path: `${OUT}/pranav-390-sent.png` }); await ctx.close(); }
await s.as('imran'); const sug = await (await s.api.get(`${A}/suggestions`)).json(); const mine = (sug.data ?? sug ?? []).find?.(x => x.title?.includes('live tenant check') && x.status === 'pending');
check(mine?.tenant_unit === '905' && mine?.tenant_name === 'Yusuf', 'Imran sees the request with tenant 905 Yusuf'); res.suggestion = mine ? { unit: mine.tenant_unit, name: mine.tenant_name, phone: mine.tenant_phone } : null;
if (mine) { const d = await s.api.post(`${A}/suggestions/${mine.id}`, { data: { decision: 'approved' } }); res.approve = d.status(); const db = await d.json().catch(() => ({}));
  const jobId = db.work_order_id ?? db.job_id ?? db.id; const after = (await (await s.api.get(`${A}/work-orders?pageSize=100`)).json()).data.find(o => o.title.includes('live tenant check'));
  res.approvedJob = after ? { unit: after.tenant_unit, name: after.tenant_name, phone: after.tenant_phone } : null; check(after?.tenant_unit === '905' && after?.tenant_name === 'Yusuf' && after?.tenant_phone, 'approved job carries tenant'); }
await br.close(); res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'CLIENT10_FAIL' : 'CLIENT10_OK'); process.exit(fail.length ? 1 : 0);
