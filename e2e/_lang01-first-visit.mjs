// One off LANG01 check: a first visit (empty browser) reads the language file and needs no AI translation for interface words.
import { chromium } from '@playwright/test'; import { sandbox, B } from './sandbox.mjs';
const s = await sandbox('imran'); const br = await chromium.launch(); const out = [];
for (const [who, lang, path] of [['ravi', 'ne', '/today'], ['imran', 'ar-AE', '/dashboard'], ['ravi', 'ta', '/work-orders']]) {
  await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: lang } });
  const ctx = await br.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  const p = await ctx.newPage(); const reqs = { file: 0, saved: 0, ai: 0, aiWords: 0 }; const t0 = Date.now(); let fileAt = null;
  p.on('request', r => { const u = r.url(); if (u.includes('/i18n/') && u.endsWith('.json')) { reqs.file++; } if (u.includes('/api/i18n/translate')) { const b = JSON.parse(r.postData() || '{}'); if (b.cached_only) reqs.saved++; else { reqs.ai++; reqs.aiWords += (b.strings || []).length; } } });
  p.on('response', r => { if (r.url().includes('/i18n/' + lang + '.json')) fileAt = Date.now() - t0; });
  await p.goto(B + path, { waitUntil: 'load' }); const loaded = Date.now() - t0; await p.waitForTimeout(2500);
  const english = await p.evaluate(() => [...document.querySelectorAll('.app-main h1,.app-main h2,.app-main button,.bottom-tabs .tab-label,.app-header a')].map(e => e.innerText.trim()).filter(t => /^[A-Za-z][A-Za-z ]{3,}$/.test(t) && !/^(Agent|Groundwork)$/.test(t)).slice(0, 8));
  await p.screenshot({ path: `/workspace/qa/lang01-${who}-${lang}.png` });
  out.push({ who, lang, path, loadedMs: loaded, fileMs: fileAt, ...reqs, englishLeftAfter2_5s: english }); await ctx.close();
  await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' } });
}
console.log(JSON.stringify(out, null, 1)); await br.close();
