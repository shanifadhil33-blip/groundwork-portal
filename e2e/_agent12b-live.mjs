// AGENT12 count words live (no AI call): clients get the fixed refusal in English and Gulf Arabic; Imran in Gulf Arabic gets
// Ravi's counts in Arabic with the right counted noun, marked localized, and the Agent panel at 360 and 390 shows it as written.
// Fails on any missing piece. Restores each language it changes.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/agent12b-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = {}; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`;
const ask = async q => { const t = Date.now(); const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: q }] }, timeout: 60000 }); return { status: r.status(), ms: Date.now() - t, ...(await r.json().catch(() => ({}))) }; };
const setLang = async lang => { const before = await (await s.api.get('/api/me/preferences')).json().catch(() => ({})); await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 }); return before.language ?? before.data?.language ?? 'en-IN'; };
const arJobs = n => n === 1 ? 'عملًا واحدًا' : n === 2 ? 'عملين' : (n % 100 >= 3 && n % 100 <= 10) ? `${n} أعمال` : n % 100 >= 11 ? `${n} عملًا` : `${n} عمل`;
const team = await (await s.api.get(`${A}/team`)).json(); const people = team.data ?? team.members ?? team;
const ravi = people.find(p => /^Ravi\b/.test(p.name ?? '')); check(!!ravi, 'Ravi on the team');
const rec = await (await s.api.get(`${A}/members/${ravi?.user_id}/record`)).json().catch(() => ({})); res.raviRecord = rec;
const EN_REFUSE = 'Job counts are only for the company team. I can show your own requests instead.', AR_REFUSE = 'عدد الأعمال لفريق الشركة فقط. أقدر أعرض لك طلباتك.';
for (const who of ['pranav', 'faisal']) { await s.as(who);
 for (const q of ['How many jobs has Ravi completed this month?', 'How many jobs did your technicians finish this month?']) { const b = await ask(q); res[`${who}_${q.slice(16, 30)}`] = { status: b.status, quick: b.quick, ms: b.ms, reply: b.reply };
  check(b.status === 200 && b.quick === true && b.reply === EN_REFUSE, `${who} fixed refusal: ${q}`); }
 const before = await setLang('ar-AE'); try { const b = await ask('How many jobs has Ravi completed this month?'); res[`${who}_ar`] = { quick: b.quick, localized: b.localized, reply: b.reply };
  check(b.reply === AR_REFUSE && b.localized === true, `${who} Arabic refusal`); } finally { await setLang(before); } }
await s.as('imran'); const wantAr = rec.month === 0 ? `لم ينجز Ravi أي عمل هذا الشهر، ومجموع أعماله ${rec.total}.` : `أنجز Ravi ${arJobs(rec.month)} هذا الشهر، ومجموع أعماله ${rec.total}.`;
const before = await setLang('ar-AE');
try {
 const b = await ask('How many jobs has Ravi completed this month, and in total?'); res.imran_ar = { quick: b.quick, localized: b.localized, ms: b.ms, reply: b.reply, want: wantAr };
 check(b.quick === true && b.localized === true && b.reply === wantAr, 'Imran Arabic counts');
 const br = await chromium.launch();
 for (const w of [360, 390]) { const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  const p = await ctx.newPage(); await p.goto(`${B}/work-orders`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(1500);
  const opener = p.locator('.phone-assistant'); if (!check(await opener.count() > 0, `${w} Agent button`)) { await ctx.close(); continue; }
  await opener.first().click(); const input = p.locator('#assistant-input'); await input.waitFor({ timeout: 10000 }); const panel = p.locator('[role="dialog"]').last();
  const n = await panel.locator('.assistant-message.assistant').count(); await input.fill('How many jobs has Ravi completed this month, and in total?'); await p.locator('.assistant-send').first().click();
  await panel.locator('.assistant-message.assistant').nth(n).waitFor({ timeout: 30000 }).catch(() => {}); await p.waitForTimeout(2500);
  const text = (await panel.locator('.assistant-message.assistant').nth(n).innerText().catch(() => '')).trim(); res[`ui_${w}`] = text;
  check(text === wantAr, `${w} Arabic answer shown as written`);
  check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${w} sideways`);
  await p.screenshot({ path: `${OUT}/imran-ar-${w}-agent-count.png` }); await ctx.close(); }
 await br.close();
} finally { await setLang(before); }
res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'AGENT12B_FAIL' : 'AGENT12B_OK'); process.exit(fail.length ? 1 : 0);
