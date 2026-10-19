// Transitions are switched off in the audit so computed colours are read at their end state.
// Hover and pressed audit on a laptop: forces :hover and :active on every visible control (Chrome DevTools protocol) and lists
// controls whose look does not change. Env: WHO, THEME, OUT.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const WHO = (process.env.WHO || 'imran').split(','), THEME = process.env.THEME || 'light', OUT = process.env.OUT || '/workspace/qa/interaction-pass/hover.json';
const s = await sandbox('imran'); const br = await chromium.launch(); const res = {};
for (const who of WHO) { await s.as(who);
  const ctx = await br.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: THEME }); await ctx.addCookies((await s.api.storageState()).cookies); await ctx.addInitScript(t => localStorage.setItem('groundwork-theme', t), THEME);
  const p = await ctx.newPage(); await p.goto(B + '/dashboard', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  const links = await p.evaluate(() => [...document.querySelectorAll('.sidebar a[href]')].map(a => a.getAttribute('href')).filter((h, i, l) => h?.startsWith('/') && l.indexOf(h) === i));
  const cdp = await ctx.newCDPSession(p); await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  for (const href of links.slice(0, 8)) {
    await p.goto(B + href, { waitUntil: 'networkidle' }).catch(() => {}); await p.waitForTimeout(1200); await p.addStyleTag({ content: '*,*::before,*::after{transition:none!important}' }); if (!res.media) res.media = await p.evaluate(() => matchMedia('(hover:hover) and (pointer:fine)').matches);
    await p.evaluate(() => { let i = 0; for (const e of document.querySelectorAll('button:not(:disabled),a[href],[role=tab]')) { const r = e.getBoundingClientRect(); if (r.width && r.height && r.top < innerHeight && r.bottom > 0 && getComputedStyle(e).visibility !== 'hidden') e.setAttribute('data-ha', String(i++)); } });
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 }); const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-ha]' });
    const read = id => p.evaluate(i => { const e = document.querySelector(`[data-ha="${i}"]`); const s = getComputedStyle(e); return [s.backgroundColor, s.color, s.borderColor, s.textDecorationLine, s.boxShadow, s.cursor].join('|'); }, id);
    const bad = [];
    for (const nodeId of nodeIds) {
      const { attributes } = await cdp.send('DOM.getAttributes', { nodeId }); const id = attributes[attributes.indexOf('data-ha') + 1];
      const a0 = await read(id); await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] }); const a1 = await read(id);
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover', 'active'] }); const a2 = await read(id); await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
      const info = await p.evaluate(i => { const e = document.querySelector(`[data-ha="${i}"]`); return { label: (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), cls: e.className?.toString().slice(0, 60), current: e.getAttribute('aria-current') || e.getAttribute('aria-selected') }; }, id);
      const strip = x => x.split('|').slice(0, 5).join('|');
      if (strip(a0) === strip(a1)) bad.push({ ...info, issue: 'no hover' }); else if (strip(a1) === strip(a2)) bad.push({ ...info, issue: 'no pressed' });
      if (!a0.endsWith('pointer')) bad.push({ ...info, issue: 'cursor ' + a0.split('|').pop() });
    }
    res[`${who}${href}`] = bad; console.log(who, href, bad.length);
  }
  await ctx.close(); }
fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); await s.as('imran'); await br.close();
