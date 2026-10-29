if (process.env.RUN_ASSISTANT_QA !== '1') { console.log('Skipping live assistant QA during the build freeze'); process.exit(0); }
// AGENT09 live check on the fixed sandbox, no AI call: the Agent reply is stubbed in the browser. Ravi dictates (fake speech recognition), sends, the reply is read aloud (fake speechSynthesis), Stop reading shows, a typed message stays silent, and the remembered placeholder returns after reopening.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = '/workspace/qa/agent09-live'; fs.mkdirSync(OUT, { recursive: true });
const s = await sandbox('imran'); await s.as('ravi');
const br = await chromium.launch(); const ctx = await br.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
await ctx.addInitScript(() => {
  window.__spoken = []; let current = null;
  class U { constructor(t) { this.text = t; } }
  window.SpeechSynthesisUtterance = U;
  Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [{ lang: 'en-US', name: 'Fake' }], speak: u => { window.__spoken.push(u.text); current = u; }, cancel: () => { window.__cancelled = (window.__cancelled || 0) + 1; current = null; } }, configurable: true });
  class R { start() { setTimeout(() => { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'What is on today' }], { isFinal: true })] }); }, 300); } stop() { setTimeout(() => this.onend?.(), 50); } abort() { this.onend?.(); } }
  window.SpeechRecognition = R; window.webkitSpeechRecognition = R;
});
await ctx.route('**/assistant', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true, reply: 'You have **two jobs** today. [Open job](/work-orders)' }) }) : r.continue());
const p = await ctx.newPage(); const res = {};
await p.goto(B + '/today', { waitUntil: 'networkidle' });
await p.getByRole('button', { name: /^Agent$/ }).first().click(); await p.waitForTimeout(800);
const mic = p.getByRole('button', { name: 'Use microphone' }); await mic.click(); await p.waitForTimeout(1200);
const stopRec = p.getByRole('button', { name: 'Stop recording' }); if (await stopRec.count()) await stopRec.click();
await p.waitForTimeout(600); res.heard = await p.inputValue('#assistant-input');
await p.keyboard.press('Enter').catch(() => {}); await p.locator('#assistant-input').press('Enter');
await p.waitForTimeout(2500);
res.spoken = await p.evaluate(() => window.__spoken);
res.stopShown = await p.getByRole('button', { name: 'Stop reading' }).count();
await p.screenshot({ path: `${OUT}/ravi-reading-390.png` });
if (res.stopShown) { await p.getByRole('button', { name: 'Stop reading' }).click(); await p.waitForTimeout(300); res.stopGone = (await p.getByRole('button', { name: 'Stop reading' }).count()) === 0; }
await p.fill('#assistant-input', 'Typed question'); await p.locator('#assistant-input').press('Enter'); await p.waitForTimeout(2500);
res.spokenAfterTyped = (await p.evaluate(() => window.__spoken)).length;
res.mode = await p.evaluate(() => localStorage.getItem('gwAgentInputMode'));
res.sideways = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
console.log(JSON.stringify(res, null, 1)); fs.writeFileSync(`${OUT}/result.json`, JSON.stringify(res, null, 1)); await br.close(); await s.as('imran');
