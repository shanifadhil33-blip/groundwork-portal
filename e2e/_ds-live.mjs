// Desert Stone live clicks (Oct 21 2026). Fails on empty. Real clicks at 390 and 360, en and ar, viewport screenshots.
// Ravi: the Agent mic opens the Agent; Details flips the next job panel, Flip back returns, the hidden face is inert.
// Imran (1024): summary hero, Today's jobs table, Approve the plan scrolls to the day plan.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/desert-stone-live/clicks'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = []; const check = (ok, what) => { res.push([ok ? 'ok' : 'FAIL', what]); if (!ok) fail.push(what); return ok; };
const s = await sandbox('imran'); const br = await chromium.launch(); const dict = { 'ar-AE': await (await s.api.get(`${B}/i18n/ar-AE.json`)).json() };
const t = (l, k) => l === 'en-IN' ? k : dict[l][k] ?? k;
async function page(who, lang, path, w) { await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: lang } });
  const phone = w < 500; const ctx = await br.newContext({ viewport: { width: w, height: phone ? (w === 360 ? 780 : 844) : 720 }, isMobile: phone, hasTouch: phone }); await ctx.addCookies((await s.api.storageState()).cookies);
  await ctx.route('**/api/i18n/translate', q => { let b = {}; try { b = JSON.parse(q.request().postData() || '{}'); } catch {} return q.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); });
  const p = await ctx.newPage(); await p.goto(`${B}${path}`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(2500); return { ctx, p }; }
async function clear(p, loc, what) { await loc.evaluate(e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300); const b = await loc.boundingBox();
  const ok = b && await p.evaluate(([x, y, ]) => document.elementFromPoint(x, y)?.closest('button,a') !== null, [b.x + b.width / 2, b.y + b.height / 2]); const same = b && await loc.evaluate((e, [x, y]) => e.contains(document.elementFromPoint(x, y)), [b.x + b.width / 2, b.y + b.height / 2]); check(ok && same, `${what} not covered`); }
try {
  for (const [lang, w] of [['en-IN', 390], ['ar-AE', 390], ['en-IN', 360], ['ar-AE', 360]]) {
    const { ctx, p } = await page('ravi', lang, '/today', w); const tag = `ravi-${lang}-${w}`;
    const sw = await p.evaluate(() => document.documentElement.scrollWidth); check(sw <= w, `${tag} no sideways scroll (${sw})`);
    check(await p.locator('.ds-home .greeting-title').count() === 1, `${tag} greeting is the page title`);
    const flipBtn = p.locator('.flip-front .ds-flip-btn');
    if (check(await flipBtn.count() === 1, `${tag} next job panel with Details`)) {
      await p.screenshot({ path: `${OUT}/${tag}-front.png` }); await clear(p, flipBtn, `${tag} Details`); await flipBtn.click(); await p.waitForTimeout(700);
      check(await p.locator('.flip').getAttribute('data-flipped') === 'true', `${tag} flipped`);
      check(await p.locator('.flip-front').evaluate(e => e.inert === true), `${tag} front inert when flipped`);
      check(await p.evaluate(() => document.activeElement?.closest('.flip-back') !== null), `${tag} focus moved to the back`);
      const m = await p.locator('.flip-inner').evaluate(e => getComputedStyle(e).transform); check(m !== 'none', `${tag} rotated (${m.slice(0, 30)})`);
      await p.screenshot({ path: `${OUT}/${tag}-back.png` }); const back = p.locator('.flip-back .ds-flip-btn'); await clear(p, back, `${tag} Flip back`); await back.click(); await p.waitForTimeout(700);
      check(await p.locator('.flip').getAttribute('data-flipped') === 'false', `${tag} flipped back`);
    }
    const mic = p.locator('.bottom-tabs .tab-mic'); if (!check(await mic.count() === 1, `${tag} mic in the tab bar`)) { await p.screenshot({ path: `${OUT}/${tag}-nomic.png` }); await ctx.close(); continue; } await mic.click(); await p.waitForTimeout(1200);
    check(await p.locator('#assistant-input').isVisible().catch(() => false), `${tag} mic opens the Agent`); await p.screenshot({ path: `${OUT}/${tag}-agent.png` }); await ctx.close(); }
  for (const lang of ['en-IN', 'ar-AE']) { const { ctx, p } = await page('imran', lang, '/dashboard', 1024); const tag = `imran-${lang}-1024`;
    check(await p.locator('.owner-summary').count() === 1, `${tag} summary hero`); check(await p.locator('.ds-hero').count() + await p.locator('.owner-summary').count() >= 1 && await p.locator('.ds-hero').count() === 1, `${tag} exactly one dark panel`);
    check(await p.locator('.today-jobs .ds-table tbody tr').count() > 0, `${tag} today's jobs table has rows`);
    check(await p.locator('.sidebar .nav-label').first().isVisible(), `${tag} sidebar shows words`);
    await p.screenshot({ path: `${OUT}/${tag}-top.png` });
    const ap = p.locator('.owner-summary .ds-hero-main'); if (await ap.count()) { await ap.click(); await p.waitForTimeout(1200); const top = await p.locator('#day-plan').evaluate(e => e.getBoundingClientRect().top); check(top < 300, `${tag} Approve the plan jumps to the plan (${Math.round(top)})`); await p.screenshot({ path: `${OUT}/${tag}-plan.png` }); } else res.push(['note', `${tag} no plan to approve right now`]);
    await ctx.close(); }
  { const { ctx, p } = await page('imran', 'en-IN', '/dashboard', 390); check(await p.evaluate(() => document.documentElement.scrollWidth) <= 390, 'imran 390 no sideways scroll'); check(await p.locator('.today-jobs .ds-phone-rows li').count() > 0, 'imran 390 rows instead of the table'); await p.screenshot({ path: `${OUT}/imran-en-IN-390.png` }); await ctx.close(); }
} finally { for (const who of ['imran', 'ravi']) { await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' } }).catch(() => {}); } await br.close(); }
for (const r of res) console.log(r.join(' ')); console.log(fail.length ? 'DS_FAIL ' + fail.length : 'DS_OK'); process.exit(fail.length ? 1 : 0);
