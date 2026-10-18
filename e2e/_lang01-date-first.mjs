// LANG01 slice 3 check: on a first visit (empty browser) how long until the Today date line and the first screen are in the person's language, and what goes to the AI.
import { chromium } from '@playwright/test'; import { sandbox, B } from './sandbox.mjs';
const BASE = process.env.BASE || B;
const s = await sandbox('imran'); const br = await chromium.launch(); const out = [];
const langs = (process.env.LANGS || 'ne,ar-AE,ta,hi,yo').split(',');
for (const lang of langs) {
  await s.as('ravi'); await s.api.patch('/api/me/preferences', { data: { language: lang } });
  const ctx = await br.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  const p = await ctx.newPage(); const ai = []; const t0 = Date.now();
  p.on('request', r => { if (r.url().includes('/api/i18n/translate')) { const b = JSON.parse(r.postData() || '{}'); if (!b.cached_only) ai.push(...(b.strings || [])); } });
  await p.goto(BASE + '/today', { waitUntil: 'commit' });
  const marks = {}; let firstDate = null;
  for (let i = 0; i < 80; i++) {
    const st = await p.evaluate(() => { const d = document.querySelector('.app-main h1 + p, h1 + p'); return { date: d?.textContent || null, lang: document.documentElement.lang, h1: document.querySelector('h1')?.textContent || null }; }).catch(() => ({}));
    const ms = Date.now() - t0;
    if (st.date && firstDate === null) { firstDate = st.date; marks.dateShownMs = ms; }
    if (st.date && !/Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday/.test(st.date) && marks.dateNativeMs === undefined) { marks.dateNativeMs = ms; marks.dateNative = st.date; }
    if (st.h1 && st.h1 !== 'Today' && marks.h1Ms === undefined) { marks.h1Ms = ms; marks.h1 = st.h1; }
    if (marks.dateNativeMs !== undefined && marks.h1Ms !== undefined) break;
    await p.waitForTimeout(50);
  }
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `/workspace/qa/lang01-s3/${lang}.png` });
  out.push({ lang, firstDate, ...marks, aiStrings: ai.length, aiDates: ai.filter(x => /\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(x)) });
  await ctx.close();
}
await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' } });
console.log(JSON.stringify(out, null, 1)); await br.close();
