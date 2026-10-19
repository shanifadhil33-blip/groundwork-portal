// Visit charge spacing: screenshot the section on the live site at 360/390, optional CSS injected (CSS env) to preview before shipping.
// Measures gaps between fields so the check fails on loose spacing, and fails if the section is not found.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/visit-spacing/before'; fs.mkdirSync(OUT, { recursive: true });
const css = process.env.CSS ? fs.readFileSync(process.env.CSS, 'utf8') : '';
const br = await chromium.launch(); const out = []; const s = await sandbox('imran'); await s.as('imran');
const langs = (process.env.LANGS || 'en-IN').split(','); let fail = false;
for (const lang of langs) {
 await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
 for (const theme of (process.env.THEMES || 'light').split(',')) for (const w of [360, 390]) {
  const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  await ctx.addInitScript(t => { try { localStorage.setItem('groundwork-theme', t); } catch {} }, theme);
  await ctx.route('**/api/i18n/translate', r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {} return r.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); });
  const p = await ctx.newPage(); await p.goto(B + '/settings?tab=company', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  if (css) await p.addStyleTag({ content: css });
  const sec = p.locator('section').filter({ has: p.locator('h2').filter({ hasText: /visit|الزيارة/i }) }).first();
  if (!(await sec.count())) { out.push({ lang, w, theme, error: 'section not found' }); fail = true; await ctx.close(); continue; }
  if (process.env.ADD) { await sec.getByRole('button', { name: /add region|إضافة/i }).click().catch(() => {}); await p.waitForTimeout(300); }
  await sec.scrollIntoViewIfNeeded();
  const m = await sec.evaluate(el => { const f = el.querySelector('form'); if (!f) return null; const kids = [...f.children].filter(k => k.getBoundingClientRect().height > 0); const r = kids.map(k => k.getBoundingClientRect()); const gaps = r.slice(1).map((b, i) => Math.round(b.top - r[i].bottom));
   const cb = f.querySelector('input[type=checkbox]')?.getBoundingClientRect(); const amt = f.querySelector('input[type=number]')?.getBoundingClientRect();
   return { kids: kids.map(k => k.tagName.toLowerCase() + (k.className ? '.' + String(k.className).split(' ')[0] : '')), gaps, height: Math.round(el.getBoundingClientRect().height), checkboxLeft: cb && Math.round(cb.left), checkboxRight: cb && Math.round(cb.right), fieldLeft: amt && Math.round(amt.left), fieldRight: amt && Math.round(amt.right), sideways: document.documentElement.scrollWidth > innerWidth + 1,
    small: [...el.querySelectorAll('button,input,select,label.queue-check')].filter(x => { const b = x.getBoundingClientRect(); return b.height > 0 && b.height < 44 && x.type !== 'checkbox'; }).length }; });
  const big = Math.max(...(m?.gaps ?? [999])); const res = { lang, theme, w, ...m, maxGap: big }; if (!m || big > 24 || m.sideways || m.small) fail = true; out.push(res);
  await sec.screenshot({ path: `${OUT}/imran-${lang}-${theme}-${w}.png` }); await ctx.close();
 }
}
await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' } }).catch(() => {});
await br.close(); fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1)); console.log(fail ? 'SPACING_FAIL' : 'SPACING_OK'); process.exit(fail ? 1 : 0);
