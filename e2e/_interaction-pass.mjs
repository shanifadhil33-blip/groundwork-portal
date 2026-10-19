// Whole app interaction pass (Adhil, Oct 19): every role's own screens at phone 360/390 and laptop 1280/1440, light and dark.
// Measures what a script can: long animation frames and layout shifts on page changes and sheets, transition properties and
// durations on controls, outline after a tap, a ring for keyboard focus, hover and pressed feedback on laptop, cursor, sheet and
// dialog animations (duration, transform/opacity only), reduced motion, controls left disabled after open/close. No AI call.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/interaction-pass'; fs.mkdirSync(OUT + '/shots', { recursive: true });
const PERSONAS = (process.env.WHO || 'imran,sam,nabil,ravi,pranav,kevin,omar,faisal').split(',');
const CONFIGS = (process.env.CONFIGS || '360:light,390:dark,1280:light,1440:dark,360:dark,390:light,1280:dark,1440:light').split(',').map(c => { const [w, t] = c.split(':'); return { w: +w, theme: t }; });
const init = () => {
  window.__loaf = []; window.__cls = 0;
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.duration > 50) window.__loaf.push({ d: Math.round(e.duration), t: Math.round(e.startTime), blocking: Math.round(e.blockingDuration || 0) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
};
const pageChecks = (laptop) => {
  const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const label = e => (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const out = { badTransition: [], slowTransition: [], noPointer: [], unlabeled: [] };
  const LAYOUT = /^(all|width|height|top|left|right|bottom|margin|padding|inset|max-height|max-width|min-height)/;
  for (const e of document.querySelectorAll('button,a[href],[role=tab],summary,[role=button]')) {
    if (!vis(e) || e.closest('[aria-hidden=true]')) continue; const s = getComputedStyle(e);
    const props = s.transitionProperty.split(',').map(x => x.trim()), durs = s.transitionDuration.split(',').map(x => parseFloat(x) * (x.includes('ms') ? 1 : 1000));
    props.forEach((p, i) => { const d = durs[i] ?? durs[0]; if (d > 0 && LAYOUT.test(p)) out.badTransition.push(`${label(e)}: ${p} ${d}ms`); if (d > 300) out.slowTransition.push(`${label(e)}: ${p} ${d}ms`); });
    if (laptop && !e.disabled && s.cursor !== 'pointer') out.noPointer.push(`${label(e)} (${s.cursor})`);
    if (!label(e) && !e.querySelector('img[alt]')) out.unlabeled.push(e.outerHTML.slice(0, 80));
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].slice(0, 12);
  return out;
};
const ring = () => { const a = document.activeElement; if (!a || a === document.body) return null; const s = getComputedStyle(a); return { el: (a.getAttribute('aria-label') || a.textContent || a.tagName).trim().slice(0, 30), outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, shadow: s.boxShadow !== 'none' }; };
const anims = (sel) => { const el = document.querySelector(sel); if (!el) return null; return el.getAnimations({ subtree: true }).map(a => { const k = a.effect?.getKeyframes?.() ?? []; const props = [...new Set(k.flatMap(f => Object.keys(f).filter(x => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))))]; return { name: a.animationName || a.transitionProperty || 'anim', ms: a.effect?.getTiming?.().duration, props }; }).filter(a => typeof a.ms === 'number' && a.ms > 0 && a.ms !== Infinity && !/spin|pulse|agent-dot|skeleton/.test(a.name)); };
const report = { at: new Date().toISOString(), runs: [], findings: [] };
const find = (f) => { report.findings.push(f); };
const br = await chromium.launch(); const s = await sandbox('imran');
for (const who of PERSONAS) {
  await s.as(who);
  for (const { w, theme } of CONFIGS) {
    const phone = w < 1024, laptop = !phone; const tag = `${who}-${w}-${theme}`;
    const ctx = await br.newContext({ viewport: { width: w, height: phone ? 800 : 860 }, isMobile: phone, hasTouch: phone, colorScheme: theme });
    await ctx.addCookies((await s.api.storageState()).cookies); await ctx.addInitScript(t => { try { localStorage.setItem('groundwork-theme', t); } catch {} }, theme); await ctx.addInitScript(init); await ctx.addInitScript(`window.__anims = ${anims.toString()};`);
    const p = await ctx.newPage(); const run = { tag, pages: [] };
    await p.goto(B + '/dashboard', { waitUntil: 'networkidle' }).catch(() => {}); await p.waitForTimeout(1500);
    const meta = await p.evaluate(() => document.querySelector('meta[name=viewport]')?.content || '');
    if (!/width=device-width/.test(meta)) find({ tag, kind: 'tap-delay', note: 'no width=device-width viewport (300 ms tap delay)' });
    // Own screens from the visible navigation.
    const links = await p.evaluate(ph => [...document.querySelectorAll(ph ? '.bottom-tabs a[href]' : '.sidebar a[href].nav-link, .sidebar nav a[href]')].map(a => a.getAttribute('href')).filter((h, i, l) => h && h.startsWith('/') && l.indexOf(h) === i), phone);
    for (const href of links.slice(0, 8)) {
      await p.evaluate(() => { window.__loaf = []; window.__cls = 0; });
      const link = p.locator(phone ? `.bottom-tabs a[href="${href}"]` : `.sidebar a[href="${href}"]`).first();
      const t0 = Date.now(); let tapped = false;
      if (await link.isVisible().catch(() => false)) { if (phone) await link.tap().catch(() => {}); else await link.click().catch(() => {}); tapped = true; } else await p.goto(B + href).catch(() => {});
      await p.waitForURL(u => u.pathname.startsWith(href), { timeout: 8000 }).catch(() => {}); const navMs = Date.now() - t0; await p.waitForTimeout(1300);
      const afterTap = tapped ? await p.evaluate(ring) : null;
      if (afterTap?.outline) find({ tag, href, kind: 'outline-after-tap', note: afterTap.el });
      const m = await p.evaluate(() => ({ loaf: window.__loaf, cls: Math.round(window.__cls * 1000) / 1000 }));
      const checks = await p.evaluate(pageChecks, laptop);
      if (m.cls > 0.05) find({ tag, href, kind: 'layout-shift', note: `CLS ${m.cls}` });
      const longest = Math.max(0, ...m.loaf.map(x => x.d)); if (longest > 200) find({ tag, href, kind: 'long-frame', note: `${longest} ms frame on page change` });
      for (const k of ['badTransition', 'slowTransition', 'noPointer']) if (checks[k].length) find({ tag, href, kind: k, note: checks[k].join(' | ') });
      if (checks.unlabeled.length) find({ tag, href, kind: 'unlabeled-control', note: checks.unlabeled.join(' | ') });
      // Keyboard: Tab once from the page start shows a ring.
      if (laptop) { await p.evaluate(() => { document.activeElement?.blur?.(); }); await p.keyboard.press('Tab'); const r = await p.evaluate(ring); if (r && !r.outline && !r.shadow) find({ tag, href, kind: 'no-focus-ring', note: r.el }); }
      // Hover and pressed feedback on a laptop: an enabled button in the page.
      if (laptop) {
        for (const sel of ['.sidebar a.nav-link:not([aria-current]):visible', '.app-main .button:not([disabled]):visible', '.app-main a[href]:not(.button):visible', '.app-header button:visible', '.app-main [role=tab]:not([aria-selected=true]):visible']) {
          const btn = p.locator(sel).first(); if (!(await btn.count())) continue; const box = await btn.boundingBox(); if (!box) continue;
          const read = () => btn.evaluate(e => { const s = getComputedStyle(e); return s.backgroundColor + '|' + s.color + '|' + s.borderColor + '|' + s.textDecorationLine + '|' + s.boxShadow; });
          await p.mouse.move(2, 2); await p.waitForTimeout(200); const a0 = await read(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.waitForTimeout(250); const a1 = await read(); await p.mouse.down(); await p.waitForTimeout(80); const a2 = await read(); await p.mouse.up(); await p.mouse.move(2, 2);
          const lbl = sel.split(' ')[0] + ' "' + (await btn.innerText().catch(() => '')).slice(0, 30) + '"';
          // Real mouse hover here is only a hint (it flagged controls that do change, Oct 19); e2e/_hover-audit.mjs is the check.
          if (a0 === a1) find({ tag, href, kind: 'hover-hint', note: lbl }); if (a0 === a2 && a1 === a2) find({ tag, href, kind: 'pressed-hint', note: lbl });
          if (p.url().replace(B, '').split('?')[0] !== href && !p.url().includes(href)) await p.goto(B + href).catch(() => {});
        }
      }
      run.pages.push({ href, navMs, longest, cls: m.cls, ...checks });
    }
    // Sheets, menus and dialogs: phone More sheet, Agent panel; their animation, frames, and nothing left disabled.
    // A list page, so the laptop has the Agent launcher (the dashboard docks the Agent instead).
    await p.goto(B + (links.find(h => /work-orders|requests/.test(h)) || links[0] || '/dashboard'), { waitUntil: 'networkidle' }).catch(() => {}); await p.waitForTimeout(800);
    const disabledBefore = await p.evaluate(() => [...document.querySelectorAll('button:disabled')].length);
    const opener = phone ? p.locator('.bottom-tabs button[aria-label="More"]') : p.locator('.assistant-launcher:visible');
    for (const [name, open, sel] of [['more', phone ? p.locator('.bottom-tabs button[aria-label="More"]') : null, '[role=dialog]'], ['agent', phone ? p.locator('.phone-assistant') : p.locator('.assistant-launcher:visible'), '[role=dialog]'], ['notifications', p.locator('button[aria-label^="Notifications"]:visible'), '[role=dialog]']]) {
      if (!open || !(await open.first().isVisible().catch(() => false))) continue;
      // Open time is measured in the page (pointer down to the dialog in the DOM): Playwright's waitFor polls every 500 ms after a
      // few tries, which made every open look like about 830 ms.
      await p.evaluate(() => { window.__loaf = []; window.__cls = 0; window.__down = 0; window.__openAnims = null; window.__seen = 0; addEventListener('pointerdown', () => { window.__down = performance.now(); }, { capture: true, once: true }); const n = document.querySelectorAll('[role=dialog]').length; const mo = new MutationObserver(() => { if (document.querySelectorAll('[role=dialog]').length > n) { window.__seen = performance.now(); mo.disconnect(); requestAnimationFrame(() => { window.__openAnims = window.__anims('.modal-layer'); }); } }); mo.observe(document.body, { childList: true, subtree: true }); }); const t0 = Date.now();
      if (phone) await open.first().tap(); else await open.first().click();
      await p.locator(sel).first().waitFor({ timeout: 6000 }).catch(() => {}); const openMs = await p.evaluate(() => window.__seen && window.__down ? Math.round(window.__seen - window.__down) : -1).then(v => v >= 0 ? v : Date.now() - t0); const a = (await p.evaluate(() => window.__openAnims)) ?? await p.evaluate(anims, sel); if (openMs > 250) find({ tag, kind: 'slow-open', note: `${name} ${openMs} ms to appear` }); await p.waitForTimeout(400);
      await p.screenshot({ path: `${OUT}/shots/${tag}-${name}.png` });
      const closeBtn = p.locator(`${sel} button[aria-label="Close dialog"]`).last(); if (phone) await closeBtn.tap().catch(() => {}); else await closeBtn.click().catch(() => {}); await p.waitForTimeout(60);
      const c = await p.evaluate(anims, '.modal-layer'); await p.waitForTimeout(500);
      const still = await p.locator(sel).count(); const m = await p.evaluate(() => ({ loaf: window.__loaf }));
      const longest = Math.max(0, ...m.loaf.map(x => x.d));
      const bad = [...(a ?? []), ...(c ?? [])].filter(x => x.ms < 120 || x.ms > 320 || x.props.some(pr => !['transform', 'opacity', 'translate', 'scale', 'backgroundColor', 'color', 'borderColor', 'outlineColor'].includes(pr)));
      if (!a?.length) find({ tag, kind: 'no-open-transition', note: name }); if (!c?.length) find({ tag, kind: 'no-close-transition', note: name });
      if (bad.length) find({ tag, kind: 'transition-shape', note: `${name}: ${JSON.stringify(bad)}` });
      if (longest > 200) find({ tag, kind: 'long-frame', note: `${name} open/close ${longest} ms` }); if (still) find({ tag, kind: 'did-not-close', note: name });
      run[name] = { openMs, open: a, close: c, longest };
    }
    const disabledAfter = await p.evaluate(() => [...document.querySelectorAll('button:disabled')].length);
    if (disabledAfter > disabledBefore) find({ tag, kind: 'left-disabled', note: `${disabledAfter - disabledBefore} more disabled buttons after open/close` });
    await p.screenshot({ path: `${OUT}/shots/${tag}-last.png` });
    report.runs.push(run); await ctx.close(); fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1)); console.log(tag, 'findings so far', report.findings.length);
  }
}
// Reduced motion: no sheet or panel animation.
{ await s.as('ravi'); const ctx = await br.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' }); await ctx.addCookies((await s.api.storageState()).cookies);
  const p = await ctx.newPage(); await p.goto(B + '/today', { waitUntil: 'networkidle' }); await p.locator('.phone-assistant').tap(); await p.waitForTimeout(30); const a = await p.evaluate(anims, '[role=dialog]');
  await p.locator('[role=dialog] button[aria-label="Close dialog"]').tap(); await p.waitForTimeout(30); const gone = await p.locator('[role=dialog]').count() === 0;
  await p.locator('.bottom-tabs button[aria-label="More"]').tap(); await p.waitForTimeout(30); const b = await p.evaluate(anims, '[role=dialog]');
  report.reducedMotion = { agentAnims: a, closedAtOnce: gone, moreAnims: b }; if (a?.length || b?.length) find({ tag: 'ravi-390-reduced', kind: 'motion-not-reduced', note: JSON.stringify([a, b]) }); await ctx.close(); }
// Short screen recording of the key transitions at 390.
{ await s.as('ravi'); const ctx = await br.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, recordVideo: { dir: OUT + '/video', size: { width: 390, height: 800 } } }); await ctx.addCookies((await s.api.storageState()).cookies);
  const p = await ctx.newPage(); await p.goto(B + '/today', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  await p.locator('.phone-assistant').tap(); await p.waitForTimeout(900); await p.locator('[role=dialog] button[aria-label="Close dialog"]').tap(); await p.waitForTimeout(700);
  await p.locator('.bottom-tabs button[aria-label="More"]').tap(); await p.waitForTimeout(900); await p.locator('[role=dialog] button[aria-label="Close dialog"]').tap(); await p.waitForTimeout(700);
  for (const a of (await p.locator('.bottom-tabs a[href]').all()).slice(0, 3)) { await a.tap(); await p.waitForTimeout(1100); }
  await ctx.close(); }
await s.as('imran'); await br.close();
const byKind = {}; for (const f of report.findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1; report.byKind = byKind;
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1)); console.log(JSON.stringify(byKind));
