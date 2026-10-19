// Agent panel check while it is thinking (Adhil, Oct 19): open the Agent, ask, then while the answer is pending try to type,
// tap outside and tap close. Saves screenshots. Env: W (width), H, THEME (light|dark), WHO (ravi|sam|imran), PAGE, TAG (before|after), Q.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const W = Number(process.env.W || 390), H = Number(process.env.H || 800), THEME = process.env.THEME || 'dark', WHO = process.env.WHO || 'ravi', TAG = process.env.TAG || 'before';
const Q = process.env.Q || 'Show jobs waiting on parts', OUT = '/workspace/qa/agent-panel-fix/' + TAG; fs.mkdirSync(OUT, { recursive: true });
const name = `${WHO}-${W}-${THEME}`; const phone = W < 1024;
const s = await sandbox('imran'); await s.as(WHO);
const br = await chromium.launch(); const ctx = await br.newContext({ viewport: { width: W, height: H }, isMobile: phone, hasTouch: phone, colorScheme: THEME });
await ctx.addCookies((await s.api.storageState()).cookies); await ctx.addInitScript(t => { try { localStorage.setItem('groundwork-theme', t); } catch {} }, THEME);
const p = await ctx.newPage(); const res = { name, W, THEME, WHO, TAG };
await p.goto(B + (process.env.PAGE || (WHO === 'ravi' ? '/today' : '/work-orders')), { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
const opener = phone ? p.locator('.phone-assistant') : p.locator('.assistant-launcher');
const docked = !phone && await p.locator('.dashboard-assistant').isVisible().catch(() => false);
res.docked = docked;
if (!docked) { const t0 = Date.now(); await opener.first().click(); await p.locator('#assistant-input').waitFor({ timeout: 10000 }); res.openMs = Date.now() - t0; await p.waitForTimeout(450); }
await p.screenshot({ path: `${OUT}/${name}-1-open.png` });
const panel = docked ? p.locator('.dashboard-assistant') : p.locator('[role="dialog"]').last();
const input = p.locator('#assistant-input'); await input.fill(Q);
const before = await panel.locator('.assistant-message.assistant').count();
const t = Date.now(); await input.press('Enter');
await p.waitForTimeout(500);
const replied = await panel.locator('.assistant-message.assistant').count() > before;
res.answeredWithin500ms = replied;
const closeBtn = panel.getByRole('button', { name: /Close/ }).first();
res.thinking = { closeDisabled: docked ? null : await closeBtn.isDisabled().catch(() => null), inputDisabled: await input.isDisabled(), indicator: await panel.locator('.agent-typing,[role=status]').first().innerText().catch(() => '') };
res.stopButton = await panel.getByRole('button', { name: /^Stop$/ }).count();
await p.screenshot({ path: `${OUT}/${name}-2-thinking.png` });
// Type the next message while it thinks.
await input.click({ timeout: 2000 }).catch(() => {}); await p.keyboard.type('next one', { delay: 10 }).catch(() => {});
res.typedWhileThinking = (await input.inputValue().catch(() => '')).includes('next one');
// Tap outside the panel (laptop: the page on the left; phone: the panel is full screen, so the header area is inside).
if (!phone) { const hit = await p.evaluate(() => { const el = document.elementFromPoint(200, 300); return el ? (el.closest('[role=dialog],.dashboard-assistant') ? 'panel' : el.closest('.modal-layer') ? 'layer' : 'page') : 'none'; }); res.outsideHit = hit; }
// Wait for the reply (first useful content), unless it already came.
const got = await panel.locator('.assistant-message.assistant').nth(before).waitFor({ timeout: 90000 }).then(() => true).catch(() => false);
res.firstContentMs = got ? Date.now() - t : null; res.reply = got ? (await panel.locator('.assistant-message.assistant').nth(before).innerText()).slice(0, 200) : '';
await p.screenshot({ path: `${OUT}/${name}-3-answer.png` });
// Ask an AI question and close while it thinks.
if (!docked) {
  await input.fill('Summarise what my week looks like in two lines'); const t2 = Date.now(); await input.press('Enter'); await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/${name}-4-thinking-ai.png` });
  await closeBtn.click({ timeout: 3000 }).catch(e => { res.closeError = String(e).slice(0, 120); });
  await p.waitForTimeout(600); res.closedWhileThinking = !(await input.isVisible().catch(() => false)); res.closeMs = Date.now() - t2;
  await p.screenshot({ path: `${OUT}/${name}-5-after-close.png` });
  res.sideways = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  if (res.closedWhileThinking) { await opener.first().click(); await p.waitForTimeout(600); res.reopenInputEnabled = await input.isEnabled().catch(() => null); res.reopenText = (await p.locator('[role="dialog"]').last().innerText().catch(() => '')).slice(-200); await p.screenshot({ path: `${OUT}/${name}-6-reopen.png` }); }
}
const send = p.locator('.assistant-send').first(); const bb = await send.boundingBox().catch(() => null); res.sendSize = bb ? [Math.round(bb.width), Math.round(bb.height)] : null;
console.log(JSON.stringify(res, null, 1)); fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(res, null, 1)); await br.close(); await s.as('imran');
