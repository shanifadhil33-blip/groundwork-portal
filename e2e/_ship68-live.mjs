// Ship 68 live check (Oct 20 2026). Fails on empty. History card translated (units too); DEMO12 before and after learning, en, ar, hi, ne at 390. Viewport screenshots.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/ship68-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = { api: {}, pages: [] }; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const s = await sandbox('imran'); const LANGS = ['en-IN', 'ar-AE', 'hi', 'ne']; const dict = {};
for (const l of LANGS.slice(1)) dict[l] = await (await s.api.get(`${B}/i18n/${l}.json`)).json();
const t = (l, k) => l === 'en-IN' ? k : dict[l][k];
for (const l of LANGS.slice(1)) for (const k of ['Demo: before and after learning', 'Before learning', 'After learning', 'Usual time', 'min', 'From your company’s history']) check(t(l, k) && t(l, k) !== k, `${l} has ${k} live`);
check(dict['ar-AE'].min === 'دقيقة', 'Arabic min live');
for (const who of ['ravi', 'pranav']) { await s.as(who); const c = (await s.api.post('/api/demo/learning', { data: {} })).status(); res.api[`learning_${who}`] = c; check(c === 403, `${who} refused (${c})`); }
await s.as('imran'); const r = await s.api.post('/api/demo/learning', { data: {} }); const L = await r.json().catch(() => ({})); res.api.learning = { status: r.status(), ...L };
check(r.status() === 200 && L.after?.typical_minutes > 0 && L.after?.based_on >= 3 && L.before?.based_on === 0, 'learning control answers before and after');
const br = await chromium.launch();
try { for (const lang of LANGS) {
  await s.as('imran'); await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  await ctx.route('**/api/i18n/translate', q => { let b = {}; try { b = JSON.parse(q.request().postData() || '{}'); } catch {} return q.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); });
  const p = await ctx.newPage(); await p.goto(`${B}/dashboard`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(2500);
  await p.locator('button.phone-demo-options').first().click(); await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/imran-menu-${lang}.png` });
  const btn = p.getByRole('button', { name: t(lang, 'Demo: before and after learning') });
  if (check(await btn.count(), `${lang} learning button shown`)) { await Promise.all([p.waitForURL(/learning=1/, { timeout: 30000 }).catch(() => {}), btn.click()]); }
  check(/\/work-orders\/.+learning=1/.test(p.url()), `${lang} opened the job with learning (${p.url()})`);
  await p.waitForLoadState('networkidle'); await p.waitForTimeout(lang === 'en-IN' ? 1500 : 3500);
  const c = p.locator('.company-history'); if (await c.count()) await c.scrollIntoViewIfNeeded();
  const card = await c.innerText().catch(() => ''); await p.screenshot({ path: `${OUT}/imran-learning-${lang}.png` }); res.pages.push({ lang, url: p.url(), card });
  for (const k of ['From your company’s history', 'Before learning', 'After learning', 'Usual time', 'min']) check(card.includes(t(lang, k)), `${lang} card shows ${t(lang, k)}`);
  check(card.includes(String(L.after?.based_on)), `${lang} card says based on ${L.after?.based_on}`);
  if (lang !== 'en-IN') for (const k of ['Before learning', 'Usual time', 'finished jobs', ' min']) check(!card.includes(k), `${lang} card still English: ${k}`);
  await ctx.close(); }
  await s.as('ravi'); const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  const p = await ctx.newPage(); await p.goto(`${B}/today`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(1500); await p.locator('button.phone-demo-options').first().click(); await p.waitForTimeout(700);
  const text = await p.evaluate(() => document.body.innerText); await p.screenshot({ path: `${OUT}/ravi-menu-en-IN.png` });
  check(text.length > 150 && !text.includes('Demo: before and after learning') && !text.includes('Demo: make a job late'), 'technician sees no office demo controls'); await ctx.close();
} finally { await s.as('imran'); await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' } }).catch(() => {}); await br.close(); }
check(res.pages.length === LANGS.length, 'every page loaded');
res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'SHIP68_FAIL' : 'SHIP68_OK'); process.exit(fail.length ? 1 : 0);
