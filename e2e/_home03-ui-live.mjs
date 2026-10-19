// HOME03 phone check on the fixed sandbox, no AI call (intake answers before the model). Faisal at 390: report, tap the choices, photo offer shows, skip, card shows his words, Change puts his words back.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = '/workspace/qa/home03-live'; fs.mkdirSync(OUT, { recursive: true });
const s = await sandbox('imran'); await s.as('faisal');
const br = await chromium.launch(); const ctx = await br.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
const p = await ctx.newPage(); const res = {};
await p.goto(B + '/home', { waitUntil: 'networkidle' });
await p.getByRole('button', { name: /^Agent$/ }).first().click(); await p.waitForTimeout(800);
await p.fill('#assistant-input', 'my AC is not cooling'); await p.locator('#assistant-input').press('Enter'); await p.waitForTimeout(2500);
for (let i = 0; i < 3; i++) { const chips = p.locator('.agent-chips button'); if (!(await chips.count())) break; const t = await chips.first().innerText(); if (/Skip photo/.test(t)) break; await chips.first().click(); await p.waitForTimeout(2500); }
res.photoButton = await p.getByRole('button', { name: 'Add a photo' }).count();
res.fileInput = await p.locator('.assistant-chat input[type=file]').count();
await p.screenshot({ path: `${OUT}/faisal-photo-390.png` });
await p.getByRole('button', { name: 'Skip photo' }).click(); await p.waitForTimeout(2500);
res.card = (await p.locator('.pending-reply').innerText().catch(() => '')).slice(0, 300);
await p.screenshot({ path: `${OUT}/faisal-card-390.png` });
await p.getByRole('button', { name: 'Change' }).click(); await p.waitForTimeout(800);
res.restored = await p.inputValue('#assistant-input');
res.sideways = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
await br.close(); await s.as('imran'); console.log(JSON.stringify(res, null, 1));
