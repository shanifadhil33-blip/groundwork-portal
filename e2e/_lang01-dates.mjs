// LANG01 slice 2 live check: today's date, the greeting and schedule days in the person's language, without waiting for the AI.
import { chromium } from '@playwright/test'; import { sandbox, B } from './sandbox.mjs'; import fs from 'node:fs';
const OUT = process.env.OUT ?? '/workspace/qa/lang01-dates'; fs.mkdirSync(OUT, { recursive: true });
const s = await sandbox('ravi'); const br = await chromium.launch(); const out = [];
const cases = [['ravi', 'ne', '/today'], ['ravi', 'yo', '/today'], ['ravi', 'ta', '/today'], ['ravi', 'hi', '/today'], ['ravi', 'fa-IR', '/today'], ['ravi', 'ar-AE', '/today'], ['sam', 'ne', '/schedule'], ['sam', 'ar-AE', '/schedule'], ['pranav', 'ne', '/home'], ['imran', 'ta', '/dashboard']];
for (const [who, lang, path] of cases) {
  await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: lang } });
  const ctx = await br.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  const p = await ctx.newPage(); const ai = []; p.on('request', r => { if (r.url().includes('/api/i18n/translate')) { const b = JSON.parse(r.postData() || '{}'); if (!b.cached_only) ai.push(...(b.strings || [])); } });
  const t0 = Date.now(); await p.goto(B + path, { waitUntil: 'load' });
  const read = () => p.evaluate(() => ({ date: document.querySelector('.my-day .page-header p[data-no-translate], .my-day header p[data-no-translate]')?.textContent ?? null, days: [...document.querySelectorAll('.sched-day span, .sched-head [role=columnheader]')].map(e => e.textContent).filter(Boolean).slice(0, 4), greeting: document.querySelector('.greeting')?.textContent ?? document.querySelector('.name-ask strong')?.textContent ?? null, dir: document.documentElement.dir, lang: document.documentElement.lang }));
  await p.waitForTimeout(800); const early = await read(); const earlyMs = Date.now() - t0;
  await p.waitForTimeout(2500); const late = await read();
  await p.screenshot({ path: `${OUT}/${who}-${lang}-${path.slice(1)}.png` });
  const english = (t) => /Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|January|February|March|April|May|June|July|August|September|October|November|December|\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat|Oct)\b/.test(t ?? '');
  out.push({ who, lang, path, earlyMs, early, late, englishDateEarly: english(early.date) || early.days.some(english), aiDateWords: ai.filter(english) }); await ctx.close();
}
for (const who of ['ravi', 'sam', 'pranav', 'imran']) { await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' } }); }
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1)); await br.close();
