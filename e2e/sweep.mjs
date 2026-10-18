// Pre-release phone UI sweep (build-knowledge/rules/phone-ui-sweep.md). Fixed sandbox only.
// node sweep.mjs <outdir> [personas] [langs] : every role at 360 and 390 in English, Gulf Arabic and Tamil.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.argv[2] ?? '/workspace/qa/sweep'; fs.mkdirSync(OUT, { recursive: true });
const PERSONAS = (process.argv[3] ?? 'imran,sam,ravi,nabil,pranav,kevin,omar,faisal').split(',');
const LANGS = (process.argv[4] ?? 'en-IN,ar-AE,ta').split(','); const WIDTHS = (process.env.WIDTHS ?? '360,390').split(',').map(Number);
const HOME = { ravi: '/today', pranav: '/home', kevin: '/home', omar: '/home', faisal: '/home' };
const s = await sandbox('imran'); const br = await chromium.launch(); const issues = []; let pages = 0;
const check = () => {
  const out = []; const vis = e => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && +st.opacity > 0; };
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(['sideways scroll', document.documentElement.scrollWidth]);
  if (getComputedStyle(document.documentElement).fontSynthesis !== 'none') out.push(['font synthesis on']);
  for (const t of document.querySelectorAll('.bottom-tabs>a,.bottom-tabs>button')) {
    const l = t.querySelector('.tab-label'); const r = t.getBoundingClientRect(); if (!r.height) continue; const txt = (l ?? t).textContent;
    if (l && l.scrollWidth > l.clientWidth + 1) out.push(['tab label cut', txt]);
    const lh = l ? parseFloat(getComputedStyle(l).lineHeight) || 20 : 20; if ((l ?? t).getBoundingClientRect().height > lh * 1.5 + (l ? 0 : 30)) out.push(['tab label wraps', txt]);
    if (r.height < 44) out.push(['tab too small', txt, Math.round(r.height)]);
  }
  for (const e of document.querySelectorAll('.app-main button,.app-main input,.app-main select,.app-main [role=tab],.app-header a,.app-header button')) {
    if (!vis(e)) continue; const box = /checkbox|radio/.test(e.type) && e.closest('label') ? e.closest('label') : e; const r = box.getBoundingClientRect();
    if (r.height < 40 && r.width < 200) out.push(['small tap target', (e.innerText || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30), Math.round(r.width) + 'x' + Math.round(r.height)]);
  }
  const w = document.createTreeWalker(document.querySelector('.app-main') ?? document.body, NodeFilter.SHOW_TEXT); let n; const small = new Set();
  while ((n = w.nextNode())) { const el = n.parentElement; if (!n.data.trim() || !el || !vis(el) || el.closest('kbd,svg,.count-dot,.sr-only')) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 14) small.add(n.data.trim().slice(0, 30) + ' ' + fs + 'px'); }
  for (const x of [...small].slice(0, 5)) out.push(['text under 14px', x]);
  if (!/^en/.test(document.documentElement.lang)) for (const x of [...document.querySelectorAll('.app-main h1,.app-main h2,.app-main button,.bottom-tabs .tab-label')].filter(e => vis(e) && !e.closest('[data-no-translate]') && /^[A-Za-z][A-Za-z ]{3,}$/.test(e.innerText.trim()) && !/^(Agent|Groundwork)$/.test(e.innerText.trim())).map(e => e.innerText.trim()).slice(0, 5)) out.push(['English left', x]);
  return out;
};
for (const who of PERSONAS) {
  await s.as(who);
  for (const lang of LANGS) {
    await s.api.patch('/api/me/preferences', { data: { language: lang } });
    for (const w of WIDTHS) {
      const ctx = await br.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies); const p = await ctx.newPage();
      for (const path of [HOME[who] ?? '/dashboard', '/work-orders', '/settings', ...(process.env.PATHS ?? '').split(',').filter(Boolean)]) {
        try {
          await p.goto(B + path, { waitUntil: 'load', timeout: 45000 }); await p.waitForTimeout(lang === 'en-IN' ? 1500 : 4000); pages++;
          const found = await p.evaluate(check); const tag = `${who}-${lang}-${w}${path.replace(/\//g, '_')}`;
          await p.screenshot({ path: `${OUT}/${tag}.png` });
          for (const f of found) issues.push({ who, lang, w, path, issue: f[0], detail: f.slice(1).join(' ') });
          if (path === '/settings' && (w === 360 || w >= 1000)) { // rule 3: dropdown attached to its field
            const trig = p.locator('.dropdown-trigger').filter({ has: p.locator('[data-no-translate]') }).last();
            if (await trig.count()) { await trig.scrollIntoViewIfNeeded(); await trig.tap(); await p.waitForTimeout(400); const m = await p.locator('.dropdown-menu').boundingBox(), t = await trig.boundingBox();
              if (m && t) { const gap = Math.min(Math.abs(m.y + m.height - t.y), Math.abs(t.y + t.height - m.y)); if (gap > 8) issues.push({ who, lang, w, path, issue: 'dropdown detached', detail: Math.round(gap) + 'px' }); }
              await p.screenshot({ path: `${OUT}/${tag}-dropdown.png` }); await p.keyboard.press('Escape'); }
          }
        } catch (e) { issues.push({ who, lang, w, path, issue: 'page failed', detail: e.message.slice(0, 80) }); }
      }
      await ctx.close();
    }
  }
  await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' } });
  console.log(who, 'issues so far', issues.length);
}
await br.close();
const summary = {}; for (const i of issues) summary[i.issue] = (summary[i.issue] ?? 0) + 1;
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ pages, summary, issues }, null, 1)); console.log(JSON.stringify({ pages, summary }));
process.exit(0);
