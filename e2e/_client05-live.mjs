// CLIENT05 live check on the fixed sandbox (reset first so the new demo equipment is in it). No AI call.
// Office: Equipment on the client page at 360 and 390, add a unit, its job history, archive it again. Facility manager: read only on his home.
// Technician: only units on his jobs. Household: none.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/client05-live'; fs.mkdirSync(OUT, { recursive: true });
const s = await sandbox('imran'); if (!process.env.NO_RESET) await s.reset(); await s.as('imran'); const ws = s.ws; const res = {};
const j = async r => { try { return await r.json(); } catch { return null; } };
const clients = await j(await s.api.get(`/api/workspaces/${ws}/clients`)); const list = clients?.data ?? clients ?? [];
const harbor = list.find(c => /Harbor/.test(c.name)); res.harbor = !!harbor;
const all = await j(await s.api.get(`/api/workspaces/${ws}/assets`)); res.officeUnits = (all?.data ?? all ?? []).map(a => a.name);
const linked = (all?.data ?? all ?? []).find(a => a.name === 'Roof AC 1');
if (linked) { const d = await j(await s.api.get(`/api/workspaces/${ws}/assets/${linked.id}`)); res.roofAc1History = (d?.history ?? []).map(h => `WO ${h.order_number} ${h.status}`); }
const br = await chromium.launch();
for (const w of [360, 390]) {
 const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
 const p = await ctx.newPage(); await p.goto(`${B}/clients/${harbor.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
 const eq = p.locator('.equipment').first(); await eq.scrollIntoViewIfNeeded().catch(() => {});
 res[`office${w}`] = { sections: await p.locator('.equipment').count(), units: await p.locator('.equipment-unit').count(), sideways: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
  smallTargets: await p.evaluate(() => [...document.querySelectorAll('.equipment button')].filter(b => b.getBoundingClientRect().height && b.getBoundingClientRect().height < 44).length) };
 await p.screenshot({ path: `${OUT}/office-client-${w}.png` });
 if (w === 390) {
  await p.locator('.equipment-unit').first().click(); await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/office-unit-history-${w}.png` });
  res.historyDialog = (await p.locator('[role=dialog]').last().innerText().catch(() => '')).slice(0, 300);
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Add equipment' }).first().click(); await p.waitForTimeout(800);
  const dlg = p.locator('[role=dialog]').last(); await dlg.getByLabel('Name').fill('Lobby AC check');
  await p.screenshot({ path: `${OUT}/office-add-${w}.png` });
  await dlg.getByRole('button', { name: 'Save equipment' }).click(); await p.waitForTimeout(1800);
  res.afterAdd = await p.locator('.equipment-unit', { hasText: 'Lobby AC check' }).count();
  await p.screenshot({ path: `${OUT}/office-after-add-${w}.png` });
 }
 await ctx.close();
}
// Clean up the check unit (archive; there is no delete by design).
const again = await j(await s.api.get(`/api/workspaces/${ws}/assets`)); for (const a of (again?.data ?? again ?? []).filter(a => a.name === 'Lobby AC check')) res.archived = (await s.api.patch(`/api/workspaces/${ws}/assets/${a.id}`, { data: { archived_at: new Date().toISOString() } })).status();
for (const who of ['pranav', 'ravi', 'faisal', 'kevin']) { await s.as(who); const r = await s.api.get(`/api/workspaces/${ws}/assets`); const b = await j(r); res[`${who}Units`] = r.status() === 200 ? (b?.data ?? b ?? []).map(a => a.name) : r.status(); }
await s.as('pranav');
for (const w of [360, 390]) { const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies); const p = await ctx.newPage(); await p.goto(`${B}/home`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
 const eq = p.locator('.equipment').first(); await eq.scrollIntoViewIfNeeded().catch(() => {});
 res[`pranav${w}`] = { sections: await p.locator('.equipment').count(), addButtons: await p.getByRole('button', { name: 'Add equipment' }).count(), sideways: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1) };
 await p.screenshot({ path: `${OUT}/pranav-home-${w}.png` }); await ctx.close(); }
await br.close(); await s.as('imran'); fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1));
