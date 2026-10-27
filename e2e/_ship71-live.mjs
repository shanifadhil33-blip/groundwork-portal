if (process.env.RUN_ASSISTANT_QA !== '1') { console.log('Skipping live assistant QA during the build freeze'); process.exit(0); }
// Ship 71 live check (Oct 20 2026). Fails on empty. LEARN12: a supervisor's company lesson waits for the admin; the admin says yes
// or no with real clicks, English and Gulf Arabic, 390 wide, viewport screenshots. LEARN13: a technician and another company see nothing.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/ship71-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = { api: {}, agent: [], pages: [] }; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const s = await sandbox('imran'); await s.reset(); const s2 = await sandbox('imran'); const A = `/api/workspaces/${s2.ws}`;
const ar = await (await s2.api.get(`${B}/i18n/ar-AE.json`)).json();
// Sam proposes through the agent (the "Should I remember this?" card answered Yes).
async function propose(rule) { await s2.as('sam'); const r = await s2.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: rule }] }, timeout: 90000 }); const b = await r.json().catch(() => ({}));
  const id = b.pending_action?.id; res.agent.push({ rule, status: r.status(), reply: String(b.reply ?? '').slice(0, 200), card: b.pending_action?.summary });
  if (!check(id, `agent offered to remember: ${rule}`)) return;
  const c = await s2.api.post(`${A}/assistant`, { data: { messages: [], confirm_action_id: id }, timeout: 90000 }); const cb = await c.json().catch(() => ({})); res.agent.push({ confirm: c.status(), reply: cb.reply });
  check(c.status() === 200 && /admin for a yes/.test(cb.reply ?? ''), `the lesson waits for the admin: ${cb.reply}`); }
await propose('From now on send Bilal to the Marina Exchange plumbing jobs for the company');
await propose('From now on lock the pump room after every visit for the company');
const rulesBefore = await (await s2.api.get(`${A}/assistant/learning`)).json().catch(() => ({})); res.api.sam_lessons = await (await s2.api.get(`${A}/lessons`)).json();
check(res.api.sam_lessons.can_decide === false && res.api.sam_lessons.data?.length === 2, 'Sam sees his two waiting lessons and cannot decide');
for (const who of ['ravi', 'pranav']) { await s2.as(who); const r = await s2.api.get(`${A}/lessons`); const b = await r.json().catch(() => ({})); res.api[`lessons_${who}`] = { status: r.status(), n: b.data?.length };
  check(r.status() === 403 || (r.status() === 200 && b.data?.length === 0 && b.can_decide === false), `${who} sees no one else's lessons`); }
await s2.as('ravi'); const ids = res.api.sam_lessons.data.map(l => l.id); const rd = (await s2.api.post(`${A}/lessons/${ids[0]}`, { data: { yes: true } })).status(); check(rd === 403, `technician cannot decide (${rd})`);
// Another company (a fresh sandbox) cannot read or decide.
const o = await sandbox('imran'); if (o.ws !== s2.ws) { const r = await o.api.get(`/api/workspaces/${s2.ws}/lessons`); res.api.other_read = r.status(); check(r.status() === 404 || r.status() === 403, `other company refused (${r.status()})`); }
const br = await chromium.launch();
try { for (const [lang, yes] of [['en-IN', true], ['ar-AE', false]]) {
  await s2.as('imran'); await s2.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s2.api.storageState()).cookies);
  await ctx.route('**/api/i18n/translate', q => { let b = {}; try { b = JSON.parse(q.request().postData() || '{}'); } catch {} return q.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); });
  const p = await ctx.newPage(); await p.goto(`${B}/dashboard`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(lang === 'en-IN' ? 1500 : 3500);
  const card = p.locator('.lessons-waiting'); if (!check(await card.count(), `${lang} lessons card shown`)) { await p.screenshot({ path: `${OUT}/imran-dashboard-${lang}.png` }); await ctx.close(); continue; }
  await card.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/imran-lessons-${lang}-before.png` });
  const t = k => lang === 'en-IN' ? k : ar[k]; const text = await card.innerText(); res.pages.push({ lang, text });
  for (const k of ['Lessons waiting for your yes', 'For the whole company', yes ? 'Yes, use it' : 'No']) check(text.includes(t(k)), `${lang} card shows ${t(k)}`);
  check(text.includes('Sam'), `${lang} card names Sam`);
  const btn = card.getByRole('button', { name: t(yes ? 'Yes, use it' : 'No'), exact: true }).first();
  await btn.evaluate(e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300); const box = await btn.boundingBox(); const hit = box && await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.closest('button')?.innerText ?? e?.tagName; }, [box.x + box.width / 2, box.y + box.height / 2]);
  check(hit === t(yes ? 'Yes, use it' : 'No'), `${lang} nothing covers the button (${hit})`);
  await btn.click(); await p.waitForTimeout(2500); const after = await p.evaluate(() => document.body.innerText);
  check(after.includes(t(yes ? 'Saved. The agent will use this lesson.' : 'Declined. Nothing was saved.')), `${lang} decision reply shown`);
  await p.screenshot({ path: `${OUT}/imran-lessons-${lang}-after.png` }); await ctx.close(); }
} finally { await s2.as('imran'); await s2.api.patch('/api/me/preferences', { data: { language: 'en-IN' } }).catch(() => {}); await br.close(); }
await s2.as('imran'); const left = await (await s2.api.get(`${A}/lessons`)).json(); res.api.left = left.data?.length; check(left.data?.length === 0, 'both lessons decided');
const learning = await (await s2.api.get(`${A}/assistant/learning`)).json().catch(() => ({})); res.api.rules = JSON.stringify(learning).slice(0, 600);
const body = JSON.stringify(learning); check(/Marina Exchange plumbing/.test(body) !== /lock the pump room/.test(body), 'exactly one lesson became a company rule');
res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'SHIP71_FAIL' : 'SHIP71_OK'); process.exit(fail.length ? 1 : 0);
