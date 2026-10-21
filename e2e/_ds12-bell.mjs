import { chromium } from '@playwright/test'; import { sandbox, B } from '/workspace/portal-hero/e2e/sandbox.mjs';
const s = await sandbox('imran'); const br = await chromium.launch();
for (const [lang, w] of [['en-IN', 390], ['ar-AE', 390], ['en-IN', 1440], ['ar-AE', 360]]) { await s.api.patch('/api/me/preferences', { data: { language: lang } });
  const phone = w < 500; const ctx = await br.newContext({ viewport: { width: w, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone }); await ctx.addCookies((await s.api.storageState()).cookies);
  const p = await ctx.newPage(); await p.goto(`${B}/dashboard`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
  await p.locator('.notification-trigger').first().click(); await p.waitForTimeout(+(process.env.WAIT||1500));
  const en = await p.locator('.notification-read-toggle').first().innerText().catch(()=>''); console.log('toggle text', en);
  const n = await p.locator('.notification-item').count(), u = await p.locator('.notification-item.unread').count();
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log(lang, w, 'items', n, 'unread', u, 'scroll', sw <= w ? 'ok' : sw); await p.screenshot({ path: `/workspace/qa/desert-stone-live/ds13/imran-notifications-${w}-${lang}.png` }); await ctx.close(); }
await br.close();
