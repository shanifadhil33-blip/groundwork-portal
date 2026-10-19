// Household card check on the fixed sandbox (no AI call for the intake; label translation uses saved words, then the translate chain once).
// Faisal at 360 and 390 in en-IN, ar-AE and ml: heading New request, labels in his language, his words untouched, no sideways scroll.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/household-card-live'; fs.mkdirSync(OUT, { recursive: true });
const s = await sandbox('imran'); await s.as('faisal');
const before = await (await s.api.get('/api/me/preferences')).json().catch(() => ({}));
const words = { 'en-IN': 'my AC is not cooling', 'ar-AE': 'المكيف لا يبرد', ml: 'എസി തണുക്കുന്നില്ല' };
const br = await chromium.launch(); const out = [];
for (const lang of (process.env.LANGS || 'en-IN,ar-AE,ml').split(',')) {
 await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
 for (const w of [360, 390]) {
  const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  if (process.env.CACHED_ONLY) await ctx.route('**/api/i18n/translate', r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {} return r.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); });
  const p = await ctx.newPage(); const res = { lang, w };
  await p.goto(B + '/home', { waitUntil: 'networkidle' });
  await p.locator('.phone-assistant').first().click(); await p.waitForTimeout(900);
  await p.fill('#assistant-input', words[lang]); await p.locator('#assistant-input').press('Enter'); await p.waitForTimeout(2500);
  for (let i = 0; i < 4; i++) { if (await p.locator('.assistant-chat input[type=file]').count()) break; const chips = p.locator('.agent-chips button'); if (!(await chips.count())) break; await chips.first().click(); await p.waitForTimeout(2500); }
  const skip = p.locator('.agent-chips button').last(); await skip.click(); await p.waitForTimeout(3500);
  const card = p.locator('.pending-reply');
  res.heading = await card.locator('h3').innerText().catch(() => '');
  res.labels = await card.locator('dt').allInnerTexts().catch(() => []);
  res.values = await card.locator('dd').allInnerTexts().catch(() => []);
  res.words = await card.locator('p.preserve').first().innerText().catch(() => '');
  res.sideways = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  res.dir = await p.evaluate(() => document.documentElement.dir);
  await card.scrollIntoViewIfNeeded().catch(() => {}); await p.screenshot({ path: `${OUT}/faisal-${lang}-${w}.png` });
  await p.getByRole('button').filter({ hasText: /./ }).count();
  // Leave the draft: Change puts his words back, nothing is sent.
  await card.locator('button').nth(1).click().catch(() => {}); await p.waitForTimeout(600);
  res.restored = await p.inputValue('#assistant-input').catch(() => '');
  out.push(res); await ctx.close();
 }
}
await s.api.patch('/api/me/preferences', { data: { language: before.language ?? 'en-IN' } }).catch(() => {});
await br.close(); await s.as('imran'); fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
