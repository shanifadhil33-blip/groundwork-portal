// TEAM09 live check on the fixed sandbox: Ravi asks, Sam sees and approves, Ravi sees the answer on Today; office staff and clients limited.
import { chromium } from '@playwright/test'; import { sandbox, B } from './sandbox.mjs'; import fs from 'node:fs';
const OUT = '/workspace/qa/team09-live'; fs.mkdirSync(OUT, { recursive: true });
const s = await sandbox('ravi'); const base = `/api/workspaces/${s.ws}/agent-questions`; const res = {};
const q = await (await s.api.post(base, { data: { question: 'Can I use the spare 1.5 m hose from the van on this job?', proposed: 'Yes, note it on the job report' } })).json(); res.asked = q.status;
const shot = async (who, path, name) => { await s.as(who); const br = await chromium.launch(); const ctx = await br.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies); const p = await ctx.newPage(); await p.goto(B + path, { waitUntil: 'load' }); await p.waitForTimeout(2500); const t = await p.evaluate(() => ({ mine: document.querySelector('.my-agent-questions')?.textContent ?? null, queue: document.querySelector('.agent-questions')?.textContent ?? null, x: document.documentElement.scrollWidth > innerWidth })); await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }); await br.close(); return t; };
res.raviWaiting = await shot('ravi', '/today', '1-ravi-waiting');
await s.as('nabil'); res.officeList = (await (await s.api.get(base)).json()).data.map(x => x.id).includes(q.id);
res.officeDecide = (await s.api.post(`${base}/${q.id}`, { data: { decision: 'approve' } })).status();
await s.as('pranav'); res.clientAsk = (await s.api.post(base, { data: { question: 'Can you come now?' } })).status();
res.samQueue = await shot('sam', '/dashboard', '2-sam-queue');
res.imranQueue = await shot('imran', '/dashboard', '3-imran-queue');
await s.as('sam'); res.samDecide = (await s.api.post(`${base}/${q.id}`, { data: { decision: 'approve' } })).status();
res.raviAnswer = await shot('ravi', '/today', '4-ravi-answer');
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1));
