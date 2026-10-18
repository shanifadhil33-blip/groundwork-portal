// AGENT11 phone check on the fixed sandbox: Ravi opens the Agent at 360 or 390, asks for a change he may not make, sees the Ask button, taps it once and sees the sent line.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const W = Number(process.env.W || 390), OUT = '/workspace/qa/agent11-live'; fs.mkdirSync(OUT, { recursive: true });
const s = await sandbox('imran'); await s.as('ravi'); const A = `/api/workspaces/${s.ws}`;
const j = ((await (await s.api.get(`${A}/work-orders?pageSize=20`)).json()).data ?? []).find(o => !['done', 'cancelled'].includes(o.status));
const br = await chromium.launch(); const ctx = await br.newContext({ viewport: { width: W, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
const p = await ctx.newPage(); const res = { W };
await p.goto(B + '/today', { waitUntil: 'networkidle' });
await p.getByRole('button', { name: /^Agent$/ }).first().click(); await p.waitForTimeout(800);
await p.fill('#assistant-input', `Change the priority of WO ${j.order_number} to urgent`); await p.keyboard.press('Enter');
const btn = p.getByRole('button', { name: /^Ask / }); res.offerShown = await btn.first().waitFor({ timeout: 90000 }).then(() => true).catch(() => false);
res.reply = (await p.locator('.assistant-chat').innerText()).slice(-300);
res.sideways = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
await p.screenshot({ path: `${OUT}/ravi-offer-${W}.png` });
if (res.offerShown) { const b = btn.first(); res.btnHeight = (await b.boundingBox())?.height; res.label = await b.innerText(); await b.click(); await b.click().catch(() => {});
  res.sentShown = await p.getByText(/^Sent to .+ Nothing changes until he answers\.$/).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  await p.screenshot({ path: `${OUT}/ravi-sent-${W}.png` }); }
console.log(JSON.stringify(res, null, 1)); fs.writeFileSync(`${OUT}/ui-${W}.json`, JSON.stringify(res, null, 1)); await br.close(); await s.as('imran');
