// Desert Stone 10 live clicks: Home next job title -> job page (shared title), company history flip, reduced motion still navigates.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = '/workspace/qa/desert-stone-live/ds10'; fs.mkdirSync(OUT, { recursive: true });
const fail = []; const check = (ok, w) => { console.log(ok ? 'ok' : 'FAIL', w); if (!ok) fail.push(w); return ok; };
const s = await sandbox('imran'); const br = await chromium.launch();
try {
  for (const [lang, w, rm] of [['en-IN', 390, 'no-preference'], ['ar-AE', 390, 'no-preference'], ['en-IN', 360, 'reduce'], ['ar-AE', 360, 'reduce']]) {
    await s.as('ravi'); await s.api.patch('/api/me/preferences', { data: { language: lang } });
    const ctx = await br.newContext({ viewport: { width: w, height: w === 360 ? 780 : 844 }, isMobile: true, hasTouch: true, reducedMotion: rm });
    await ctx.addCookies((await s.api.storageState()).cookies); const p = await ctx.newPage(); const tag = `ravi-${lang}-${w}-${rm}`;
    await p.goto(`${B}/today`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(2000);
    const vt = await p.evaluate(() => typeof document.startViewTransition === 'function'); console.log(tag, 'startViewTransition', vt);
    const link = p.locator('.next-job-title a');
    if (!check(await link.count() === 1, `${tag} next job title link`)) { await ctx.close(); continue; }
    const title = (await link.innerText()).trim(); await link.tap(); await p.waitForURL(/\/work-orders\//, { timeout: 20000 }); await p.waitForTimeout(1500);
    const h1 = (await p.locator('h1').first().innerText()).trim(); check(h1.includes(title), `${tag} job page h1 "${h1}" holds "${title}"`);
    await p.screenshot({ path: `${OUT}/${tag}-job.png` });
    const sw = await p.evaluate(() => document.documentElement.scrollWidth); check(sw <= w, `${tag} no sideways scroll (${sw})`);
    const fb = p.locator('.company-history .flip-front .ds-flip-btn');
    if (await fb.count()) {
      await fb.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/${tag}-history-front.png` }); await fb.tap(); await p.waitForTimeout(800);
      check(await p.locator('.company-history').getAttribute('data-flipped') === 'true', `${tag} history flipped`);
      check(await p.locator('.company-history .flip-front').evaluate(e => e.inert), `${tag} front inert`);
      await p.screenshot({ path: `${OUT}/${tag}-history-back.png` });
      await p.locator('.company-history .flip-back .ds-flip-btn').tap(); await p.waitForTimeout(800);
      check(await p.locator('.company-history').getAttribute('data-flipped') === 'false', `${tag} history flipped back`);
    } else console.log('note', tag, 'no company history card on this job');
    globalThis.jobUrl = p.url(); await ctx.close();
  }
  for (const [lang, w] of [['en-IN', 390], ['ar-AE', 390], ['en-IN', 360], ['ar-AE', 1440]]) {
    await s.as('imran'); await s.api.patch('/api/me/preferences', { data: { language: lang } });
    const phone = w < 500; const ctx = await br.newContext({ viewport: { width: w, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone });
    await ctx.addCookies((await s.api.storageState()).cookies); const p = await ctx.newPage(); const tag = `imran-${lang}-${w}`;
    await p.goto(globalThis.jobUrl, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(2500);
    const fb = p.locator('.company-history .flip-front .ds-flip-btn');
    if (check(await fb.count() === 1, `${tag} company history card`)) {
      await fb.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/${tag}-history-front.png` }); await fb.click(); await p.waitForTimeout(800);
      check(await p.locator('.company-history').getAttribute('data-flipped') === 'true', `${tag} history flipped`);
      check(await p.locator('.company-history .flip-front').evaluate(e => e.inert), `${tag} front inert`);
      check(await p.evaluate(() => document.activeElement?.closest('.flip-back') !== null), `${tag} focus on back`);
      await p.screenshot({ path: `${OUT}/${tag}-history-back.png` });
      await p.locator('.company-history .flip-back .ds-flip-btn').click(); await p.waitForTimeout(800);
      check(await p.locator('.company-history').getAttribute('data-flipped') === 'false', `${tag} history flipped back`);
    }
    const sw = await p.evaluate(() => document.documentElement.scrollWidth); check(sw <= w, `${tag} no sideways scroll (${sw})`);
    await ctx.close();
  }
} finally { await br.close(); }
console.log(fail.length ? 'DS10_FAIL ' + fail.length : 'DS10_OK');
