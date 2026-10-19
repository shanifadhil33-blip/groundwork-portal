// HOME04 live: Imran sees the Visit charge settings; Faisal asks the price and gets the fixed reply. 360 and 390, en-IN and ar-AE.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/home04-live'; fs.mkdirSync(OUT, { recursive: true });
const br = await chromium.launch(); const out = [];
const s = await sandbox('imran');
for (const who of ['imran', 'faisal']) {
 await s.as(who); const before = await (await s.api.get('/api/me/preferences')).json().catch(() => ({}));
 for (const lang of ['en-IN', 'ar-AE']) {
  await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
  for (const w of [360, 390]) {
   const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
   await ctx.route('**/api/i18n/translate', r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {} return r.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); });
   const p = await ctx.newPage(); const res = { who, lang, w };
   if (who === 'imran') {
    await p.goto(B + '/settings?tab=company', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
    const sec = p.locator('section').filter({ has: p.locator('h2,h3').filter({ hasText: /visit|الزيارة/i }) }).first();
    res.section = (await sec.innerText().catch(() => '')).slice(0, 300);
    await sec.scrollIntoViewIfNeeded().catch(() => {});
   } else {
    await p.goto(B + '/home', { waitUntil: 'networkidle' });
    await p.locator('.phone-assistant').first().click(); await p.waitForTimeout(900);
    await p.fill('#assistant-input', lang === 'ar-AE' ? 'كم تكلفة الزيارة؟' : 'how much is a visit?'); await p.locator('#assistant-input').press('Enter'); await p.waitForTimeout(4000);
    res.reply = (await p.locator('.assistant-message.assistant:not(.pending-reply)').last().innerText().catch(() => '')).slice(0, 300);
   }
   res.sideways = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
   await p.screenshot({ path: `${OUT}/${who}-${lang}-${w}.png` }); out.push(res); await ctx.close();
  }
 }
 await s.api.patch('/api/me/preferences', { data: { language: before.language ?? 'en-IN' } }).catch(() => {});
}
await br.close(); await s.as('imran'); fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
