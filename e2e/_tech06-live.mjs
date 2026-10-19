// TECH06 live: Ravi's My record. The summary equals his record numbers, cards show, search narrows, Today links to it,
// the Agent answers "Show my fixes this month" from app data (English and Gulf Arabic), Imran gets no access to the page,
// Pranav gets the fixed refusal. Phone 360 and 390, en-IN and ar-AE, no sideways scroll. Fails on any missing piece.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/tech06-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = {}; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`;
const ask = async q => { const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: q }] }, timeout: 60000 }); return { status: r.status(), ...(await r.json().catch(() => ({}))) }; };
const team = await (await s.api.get(`${A}/team`)).json(); const people = team.data ?? team.members ?? team; const ravi = people.find(p => /^Ravi\b/.test(p.name ?? ''));
const rec = await (await s.api.get(`${A}/members/${ravi?.user_id}/record`)).json().catch(() => ({})); res.rec = rec;
const ofRavi = await (await s.api.get(`${A}/my-fixes?of=${ravi?.user_id}`)).json().catch(() => ({})); res.imran_reads_ravi = ofRavi.summary;
check(ofRavi.summary?.month === rec.month && ofRavi.summary?.total === rec.total, 'office reads Ravi summary equal to record');
await s.as('pranav'); { const r = await s.api.get(`${A}/my-fixes`); res.pranav_api = r.status(); check(r.status() === 403, 'Pranav refused'); const b = await ask('Show my fixes this month'); res.pranav_agent = b.reply; check(b.quick === true && /only for the company team/.test(b.reply ?? ''), 'Pranav fixed refusal'); }
await s.as('ravi');
const mine = await (await s.api.get(`${A}/my-fixes`)).json(); res.ravi_summary = mine.summary; res.ravi_rows = mine.data?.length;
check(mine.summary?.month === rec.month && mine.summary?.total === rec.total, 'Ravi summary equal to record');
check((mine.data?.length ?? 0) > 0, 'Ravi has fix cards');
const word = (mine.data?.[0]?.title ?? '').split(/\s+/)[0] ?? ''; const narrowed = await (await s.api.get(`${A}/my-fixes?month=all&q=${encodeURIComponent(word)}`)).json(); const all = await (await s.api.get(`${A}/my-fixes?month=all`)).json();
res.search = { word, narrowed: narrowed.total, all: all.total }; check(narrowed.total >= 1 && narrowed.total <= all.total && narrowed.data.every(j => JSON.stringify(j).toLowerCase().includes(word.toLowerCase())), 'search narrows');
{ const b = await ask('Show my fixes this month'); res.agent_en = b.reply; check(b.quick === true && (b.reply ?? '').startsWith(`${rec.month} ${rec.month === 1 ? 'job' : 'jobs'} this month`) && /See all in My record\.$/.test(b.reply ?? ''), 'Agent English fixes answer'); }
const before = await (await s.api.get('/api/me/preferences')).json().catch(() => ({})); const was = before.language ?? before.data?.language ?? 'en-IN';
const br = await chromium.launch();
try { for (const lang of ['en-IN', 'ar-AE']) { await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
 if (lang === 'ar-AE') { const b = await ask('Show my fixes this month'); res.agent_ar = b.reply; check(b.quick === true && b.localized === true && /هالشهر/.test(b.reply ?? '') && /شوف الكل في سجلي\.$/.test(b.reply ?? ''), 'Agent Arabic fixes answer'); }
 for (const w of [360, 390]) { const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  const p = await ctx.newPage(); await p.goto(`${B}/today`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(1200);
  const link = p.locator('a[href="/my-record"]'); if (check(await link.count() > 0, `${lang} ${w} Today links to My record`)) { await link.first().click(); await p.waitForURL(/my-record/, { timeout: 20000 }).catch(() => {}); }
  else await p.goto(`${B}/my-record`, { waitUntil: 'networkidle' });
  await p.locator('.record-card').first().waitFor({ timeout: 20000 }).catch(() => {}); await p.waitForTimeout(lang === 'en-IN' ? 800 : 2500);
  const cards = await p.locator('.record-card').count(); res[`cards_${lang}_${w}`] = cards; check(cards > 0, `${lang} ${w} cards`);
  const summary = await p.locator('.my-record section p').first().innerText().catch(() => ''); res[`summary_${lang}_${w}`] = summary;
  check(lang === 'en-IN' ? summary.startsWith(`${rec.month} ${rec.month === 1 ? 'job' : 'jobs'} this month`) : /هالشهر/.test(summary), `${lang} ${w} summary`);
  const small = await p.evaluate(() => [...document.querySelectorAll('.my-record a, .my-record button, .my-record input')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 43.5; }).length); check(small === 0, `${lang} ${w} small targets ${small}`);
  check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${lang} ${w} sideways`);
  await p.screenshot({ path: `${OUT}/ravi-${lang}-${w}-my-record.png` });
  if (lang === 'en-IN' && w === 390) { await p.locator('.my-record input[type="search"]').fill(word); await p.waitForTimeout(2500); const n = await p.locator('.record-card').count(); res.ui_search = n; check(n >= 1, 'search shows cards'); await p.screenshot({ path: `${OUT}/ravi-search-390.png` }); }
  await ctx.close(); } } }
finally { await s.api.patch('/api/me/preferences', { data: { language: was } }).catch(() => {}); }
await s.as('imran'); { const ctx = await br.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies); const p = await ctx.newPage(); await p.goto(`${B}/my-record`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200); const cards = await p.locator('.record-card').count(); res.imran_page_cards = cards; check(cards === 0, 'Imran page shows no record'); await p.screenshot({ path: `${OUT}/imran-390-my-record.png` }); await ctx.close(); }
await br.close(); res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'TECH06_FAIL' : 'TECH06_OK'); process.exit(fail.length ? 1 : 0);
