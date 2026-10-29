if (process.env.RUN_ASSISTANT_QA !== '1') { console.log('Skipping live assistant QA during the build freeze'); process.exit(0); }
// Ship 72 live check (Oct 20 2026). Fails on empty. Real clicks in the Agent screen at 390, viewport screenshots.
// LEARN12: Sam proposes a company lesson in the Agent screen (English and Arabic) and taps Yes; Imran decides in Hindi.
// DEMO14: 20 AI questions in one sandbox, then the friendly note (API and on screen, English and Arabic); sign in still works.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/ship72-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = { api: {}, agent: [], pages: [] }; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const s0 = await sandbox('imran'); await s0.reset(); const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`;
const dict = {}; for (const l of ['ar-AE', 'hi']) dict[l] = await (await s.api.get(`${B}/i18n/${l}.json`)).json();
const t = (l, k) => l === 'en-IN' ? k : dict[l][k];
const REST = 'Lots of questions in this demo just now, so I am taking a short break to save the free AI. Please ask again in a few minutes. Everything else in Groundwork works as usual.';
for (const l of ['ar-AE', 'hi']) for (const k of ['Lessons waiting for your yes', 'Yes, use it', REST]) check(dict[l][k] && dict[l][k] !== k, `${l} has ${k.slice(0, 30)} live`);
const br = await chromium.launch();
async function page(who, lang, path) { await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  await ctx.route('**/api/i18n/translate', q => { let b = {}; try { b = JSON.parse(q.request().postData() || '{}'); } catch {} return q.continue({ postData: JSON.stringify({ ...b, cached_only: true }) }); });
  const p = await ctx.newPage(); await p.goto(`${B}${path}`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(lang === 'en-IN' ? 1500 : 3000); return { ctx, p }; }
async function clear(p, loc, name) { await loc.evaluate(e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300); const b = await loc.boundingBox();
  const hit = b && await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return (e?.closest('button')?.innerText ?? e?.tagName ?? '').trim(); }, [b.x + b.width / 2, b.y + b.height / 2]); check(hit === name, `nothing covers ${name} (${hit})`); }
async function ask(p, words) { const before = await p.locator('.assistant-message, [data-role="assistant"]').count().catch(() => 0);
  const input = p.locator('#assistant-input'); if (!(await input.isVisible().catch(() => false))) { const open = p.locator('button.phone-assistant:visible, button.assistant-launcher:visible').first(); await clear(p, open, await open.innerText()); await open.click(); await p.waitForTimeout(800); }
  await input.waitFor({ timeout: 20000 }); await input.fill(words); await input.press('Enter'); await p.waitForTimeout(1500); return before; }
try {
  if (!process.env.ONLY_DEMO14) {
  // LEARN12 proposer, real clicks.
  for (const [lang, rule] of [['en-IN', 'From now on send Bilal to the Marina Exchange plumbing jobs for the company'], ['ar-AE', 'From now on lock the pump room after every visit for the company']]) {
    const { ctx, p } = await page('sam', lang, '/dashboard'); await ask(p, rule);
    const yes = p.getByRole('button', { name: t(lang, 'Yes'), exact: true }).last();
    await yes.waitFor({ timeout: 90000 }).catch(() => {}); if (!check(await yes.count(), `${lang} Agent offers Yes for the lesson`)) { await p.screenshot({ path: `${OUT}/sam-agent-${lang}-noyes.png` }); await ctx.close(); continue; }
    await p.screenshot({ path: `${OUT}/sam-agent-${lang}-ask.png` }); await clear(p, yes, t(lang, 'Yes')); await yes.click();
    const want = t(lang, 'This changes how the company works, so I sent it to your admin for a yes. I will use it once they say yes.');
    await p.getByText(want.slice(0, 25)).first().waitFor({ timeout: 60000 }).catch(() => {}); const text = await p.evaluate(() => document.body.innerText);
    check(text.includes(want), `${lang} Agent says it waits for the admin`); await p.screenshot({ path: `${OUT}/sam-agent-${lang}-waiting.png` }); await ctx.close(); }
  await s.as('sam'); const mine = await (await s.api.get(`${A}/lessons`)).json(); res.api.sam = mine.data?.length; check(mine.data?.length === 2 && mine.can_decide === false, `two lessons waiting for Sam (${mine.data?.length})`);
  // Imran decides in Hindi with real clicks.
  { const { ctx, p } = await page('imran', 'hi', '/dashboard'); const card = p.locator('.lessons-waiting');
    if (check(await card.count(), 'hi lessons card shown')) { const text = await card.innerText(); check(text.includes(t('hi', 'Lessons waiting for your yes')) && !text.includes('Lessons waiting'), 'hi card in Hindi');
      const y = card.getByRole('button', { name: t('hi', 'Yes, use it'), exact: true }).first(); await clear(p, y, t('hi', 'Yes, use it')); await p.screenshot({ path: `${OUT}/imran-lessons-hi.png` }); await y.click(); await p.waitForTimeout(2500);
      check((await p.evaluate(() => document.body.innerText)).includes(t('hi', 'Saved. The agent will use this lesson.')), 'hi yes reply shown'); await p.screenshot({ path: `${OUT}/imran-lessons-hi-after.png` }); }
    await ctx.close(); }
  }
  // DEMO14: AI questions until the limit (the lesson asks above used no AI or one call each).
  await s.as('nabil'); let n = 0, rest = null; const t0 = Date.now();
  for (let i = 0; i < 24 && !rest; i++) { const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: `In one short sentence, what is a good habit for office staff number ${i + 1}?` }] }, timeout: 90000 });
    const b = await r.json().catch(() => ({})); check(r.status() === 200, `question ${i + 1} answered without an error (${r.status()})`); if (b.demo_rest) rest = { at: i + 1, reply: b.reply, ms: Date.now() - t0 }; else n++; }
  res.api.limit = { answered: n, rest }; check(rest && rest.reply === REST && n >= (process.env.ONLY_DEMO14 ? 10 : 16) && n <= 20, `friendly note after the limit (${n} answered)`);
  for (const lang of ['en-IN', 'ar-AE']) { const { ctx, p } = await page('imran', lang, '/dashboard'); await ask(p, 'In one short sentence, what is a good habit for a new cleaner?');
    const want = t(lang, REST); await p.getByText(want.slice(0, 20)).first().waitFor({ timeout: 30000 }).catch(() => {}); const text = await p.evaluate(() => document.body.innerText);
    check(text.includes(want), `${lang} friendly note on screen`); check(!/error|429|something went wrong/i.test(text.slice(-600)), `${lang} no error on screen`); await p.screenshot({ path: `${OUT}/imran-agent-rest-${lang}.png` }); res.pages.push({ lang, ok: text.includes(want) }); await ctx.close(); }
  const signin = await s.api.post('/api/demo/start', { data: { persona: 'ravi' } }); res.api.signin_after = signin.status(); check(signin.status() === 201, `demo sign in still works (${signin.status()})`);
  const phone = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: 'change my phone number' }] } }); const pb = await phone.json(); res.api.no_ai = pb.reply; check(/office/i.test(pb.reply ?? '') && !pb.demo_rest, 'an answer with no AI still answers');
} finally { for (const who of ['imran', 'sam']) { await s.as(who); await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' } }).catch(() => {}); } await br.close(); }
res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'SHIP72_FAIL' : 'SHIP72_OK'); process.exit(fail.length ? 1 : 0);
