// LEARN11 live (no AI call): demo words after reset. Company word "the tower" means Marina Exchange; Ravi's own "the annex" means Harbor Annex.
// Team (Imran, Sam, Ravi) see company words, clients (Pranav, Faisal) do not. "anything late at the tower?" gets a quick answer about that site only.
// Ravi adds and removes a word on the phone at 390; the Words section at 360 and 390 in en-IN and ar-AE has no sideways scroll. Fails on any missing piece.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/learn11-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = {}; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
let s = await sandbox('imran'); await s.reset(); s = await sandbox('imran'); await s.as('imran'); const A = `/api/workspaces/${s.ws}`;
for (const who of ['imran', 'sam', 'ravi', 'pranav', 'faisal']) { await s.as(who); const r = await s.api.get(`${A}/words`); const b = r.status() === 200 ? await r.json() : null;
 res[`words_${who}`] = b ? { company: b.company.map(w => `${w.phrase} = ${w.means_text}`), personal: b.personal.map(w => `${w.phrase} = ${w.means_text}`) } : r.status();
 const team = ['imran', 'sam', 'ravi'].includes(who);
 if (team) check(b?.company?.some(w => w.phrase === 'the tower' && w.means_text === 'Marina Exchange'), `${who} sees company word the tower`);
 else check(!b || b.company.length === 0, `${who} sees no company words`);
 if (who === 'ravi') check(b?.personal?.some(w => w.phrase === 'the annex'), 'ravi has his own word the annex');
 if (who !== 'ravi') check(!b || !b.personal.some(w => w.phrase === 'the annex'), `${who} does not see Ravi's word`); }
await s.as('imran'); { const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: 'anything late at the tower?' }] }, timeout: 60000 }); const b = await r.json().catch(() => ({}));
 res.quick = { status: r.status(), quick: b.quick, reply: b.reply }; check(r.status() === 200 && b.quick === true && b.reply, 'quick answer for the tower');
 check(!/Pine Terrace|Harbor Annex|Northgate/.test(b.reply ?? ''), 'quick answer only about the tower'); }
await s.as('ravi'); { const r = await s.api.post(`${A}/words`, { data: { phrase: 'live check word', means_kind: 'other', means_text: 'live check', scope: 'company' } }); res.raviCompany = r.status(); check(r.status() === 403, 'Ravi cannot add company words'); }
await s.as('pranav'); { const r = await s.api.post(`${A}/words`, { data: { phrase: 'live check word', means_kind: 'other', means_text: 'live check', scope: 'company' } }); res.pranavCompany = r.status(); check(r.status() === 403, 'Pranav cannot add company words'); }
const br = await chromium.launch(); const ctxFor = async w => { const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
 await ctx.route('**/api/i18n/translate', r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {} return r.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); }); return ctx; };
for (const who of ['imran', 'ravi', 'pranav']) { await s.as(who); const pref = await (await s.api.get('/api/me/preferences')).json().catch(() => ({}));
 for (const lang of ['en-IN', 'ar-AE']) { await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
  for (const w of [360, 390]) { const ctx = await ctxFor(w); const p = await ctx.newPage(); await p.goto(`${B}/settings/agent/log`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(1500);
   const means = p.locator('#word-means'); check(await means.count() === 1, `${who} ${lang} ${w} Words form`); if (await means.count()) await means.scrollIntoViewIfNeeded();
   const html = await p.content(); if (who === 'pranav') check(!html.includes('Marina Exchange'), `${who} ${lang} ${w} no company word`); else check(html.includes('the tower'), `${who} ${lang} ${w} shows the tower`);
   const side = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); check(!side, `${who} ${lang} ${w} sideways`);
   const small = await p.evaluate(() => [...document.querySelectorAll('section button, section input')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 44; }).length); res[`small_${who}_${lang}_${w}`] = small; check(small === 0, `${who} ${lang} ${w} targets under 44px: ${small}`);
   await p.screenshot({ path: `${OUT}/${who}-${lang}-${w}-words.png` }); await ctx.close(); } }
 await s.api.patch('/api/me/preferences', { data: { language: pref.language ?? 'en-IN' } }).catch(() => {}); }
// Ravi adds a word with the form at 390 and removes it again.
await s.as('ravi'); const rp = await (await s.api.get('/api/me/preferences')).json().catch(() => ({})); res.raviLanguage = rp.language; await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' }, timeout: 45000 }); { const ctx = await ctxFor(390); const p = await ctx.newPage(); await p.goto(`${B}/settings/agent/log`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(1200);
 await p.getByLabel('Word', { exact: true }).fill('the yard'); await p.getByLabel('Something else', { exact: true }).fill('back service area');
 await p.getByRole('button', { name: 'Add word' }).click(); await p.waitForTimeout(2500); const added = await p.getByText('Word added.').count(); check(added === 1, 'Word added feedback'); check(await p.getByText('the yard').count() >= 1, 'new word listed');
 await p.screenshot({ path: `${OUT}/ravi-390-added.png` });
 const row = p.locator('li', { hasText: 'the yard' }); await row.getByRole('button', { name: 'Delete' }).click(); await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/ravi-390-confirm.png` });
 await p.getByRole('dialog').getByRole('button', { name: 'Delete' }).click(); await p.waitForTimeout(2500); check(await p.getByText('Word removed.').count() === 1, 'Word removed feedback'); check(await p.locator('li', { hasText: 'the yard' }).count() === 0, 'word gone');
 await p.screenshot({ path: `${OUT}/ravi-390-removed.png` }); await ctx.close(); } await s.api.patch('/api/me/preferences', { data: { language: rp.language ?? 'en-IN' } }).catch(() => {});
await br.close(); res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'LEARN11_FAIL' : 'LEARN11_OK'); process.exit(fail.length ? 1 : 0);
