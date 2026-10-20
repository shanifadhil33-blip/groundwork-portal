// Desert Stone: viewport screenshots of key screens for side by side with the mockups. Usage: OUT=dir node e2e/_ds-shoot.mjs
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/desert-stone-live'; fs.mkdirSync(OUT, { recursive: true });
const shots = (process.env.SHOTS || 'ravi:/today:390,imran:/dashboard:390,imran:/dashboard:1024,ravi:/today:360').split(',');
const langs = (process.env.LANGS || 'en-IN,ar-AE').split(',');
const s = await sandbox('imran'); const br = await chromium.launch(); const out = [];
for (const lang of langs) for (const spec of shots) { const [who, path, w] = spec.split(':'); await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: lang } });
  const ctx = await br.newContext({ viewport: { width: +w, height: +w > 500 ? 640 : (+w === 360 ? 780 : 844) }, isMobile: +w < 500, hasTouch: +w < 500 }); await ctx.addCookies((await s.api.storageState()).cookies);
  await ctx.route('**/api/i18n/translate', q => { let b = {}; try { b = JSON.parse(q.request().postData() || '{}'); } catch {} return q.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); });
  const p = await ctx.newPage(); await p.goto(`${B}${path}`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(2500);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth); const f = `${OUT}/${who}${path.replace(/\//g, '-')}-${w}-${lang}.png`; await p.screenshot({ path: f }); out.push({ f, sw, w: +w }); await ctx.close(); }
for (const who of ['imran', 'ravi']) { await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' } }); }
await br.close(); console.log(JSON.stringify(out)); const wide = out.filter(o => o.sw > o.w); console.log(wide.length ? 'OVERFLOW ' + JSON.stringify(wide) : 'NO_OVERFLOW');
