// Reduced motion check (Oct 21 2026): with prefers-reduced-motion reduce, no element keeps a running animation or a
// transition longer than 0.01 s, on every main screen for owner and technician, phone and desktop. Also opens the Agent and flips a card.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/desert-stone-live/reduced-motion'; fs.mkdirSync(OUT, { recursive: true });
const PAGES = { imran: ['/dashboard', '/work-orders', '/schedule', '/team', '/messages', '/settings', '/clients'], ravi: ['/today', '/work-orders', '/messages'] };
const s = await sandbox('imran'); const br = await chromium.launch(); const bad = [];
const scan = () => { const out = []; const sec = v => Math.max(...v.split(',').map(x => x.trim().endsWith('ms') ? parseFloat(x) / 1000 : parseFloat(x) || 0));
  for (const e of document.querySelectorAll('*')) { const st = getComputedStyle(e); const name = e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    if (st.animationName !== 'none' && sec(st.animationDuration) > 0.01 && st.animationPlayState === 'running') out.push(['animation', name, st.animationName, st.animationDuration]);
    if (sec(st.transitionDuration) > 0.01) out.push(['transition', name, st.transitionProperty, st.transitionDuration]); }
  return out; };
try { for (const [who, paths] of Object.entries(PAGES)) { await s.as(who);
  for (const w of [390, 1280]) { const phone = w < 500; const ctx = await br.newContext({ viewport: { width: w, height: phone ? 844 : 860 }, isMobile: phone, hasTouch: phone, reducedMotion: 'reduce' });
    await ctx.addCookies((await s.api.storageState()).cookies); const p = await ctx.newPage();
    for (const path of paths) { await p.goto(`${B}${path}`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(1500);
      const found = await p.evaluate(scan); const tag = `${who} ${w} ${path}`; console.log(found.length ? 'MOVES' : 'still', tag, found.length);
      for (const f of found.slice(0, 6)) console.log('   ', f.join(' | ')); if (found.length) bad.push([tag, found.length]); }
    if (phone && who === 'ravi') { await p.goto(`${B}/today`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
      const f = p.locator('.flip-front .ds-flip-btn'); if (await f.count()) { await f.tap(); await p.waitForTimeout(50); const tr = await p.locator('.flip-inner').evaluate(e => getComputedStyle(e).transitionDuration); console.log('flip transition', tr); if (parseFloat(tr) > 0.01) bad.push(['flip', tr]); await p.screenshot({ path: `${OUT}/ravi-390-flip-reduced.png` }); }
      const mic = p.locator('.tab-mic'); if (await mic.count()) { await mic.tap(); await p.waitForTimeout(80); const found = await p.evaluate(scan); console.log('agent open', found.length); if (found.length) bad.push(['agent open', found.length]); await p.screenshot({ path: `${OUT}/ravi-390-agent-reduced.png` }); } }
    await ctx.close(); } } } finally { await br.close(); }
console.log(bad.length ? 'RM_FAIL ' + JSON.stringify(bad) : 'RM_OK');
