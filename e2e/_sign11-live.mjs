// SIGN11 live (demo sandbox): demo sessions are view only for invites, so this checks what a demo shows and refuses:
// the client page has the Invite links section with the view only line and no Invite to Groundwork button, the invite API refuses
// a client invite with client_kind, and the page holds at 360 and 390 in English and Gulf Arabic with no sideways scroll.
// The real create, WhatsApp and accept path is covered by tests/sign11-client-invites.test.ts. Fails on any missing piece.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/sign11-live'; fs.mkdirSync(OUT, { recursive: true });
const fail = [], res = {}; const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`;
const clients = await (await s.api.get(`${A}/clients`)).json(); const list = clients.data ?? clients; const client = list[0]; check(!!client?.id, 'a client exists');
const post = await s.api.post(`${A}/invites`, { data: { email: 'sign11.check@example.com', role: 'client', client_id: client?.id, client_kind: 'household' }, headers: { 'Idempotency-Key': crypto.randomUUID() } });
res.demo_post = post.status(); check(post.status() >= 400 && post.status() < 500, 'demo invite refused');
const inv = await s.api.get(`${A}/invites`); res.list_status = inv.status(); const rows = (await inv.json().catch(() => [])); res.has_client_name = Array.isArray(rows) ? rows.some(r => 'client_name' in r) || rows.length === 0 : null;
check(inv.status() === 200, 'invite list loads');
const before = await (await s.api.get('/api/me/preferences')).json().catch(() => ({})); const was = before.language ?? before.data?.language ?? 'en-IN';
const br = await chromium.launch();
try { for (const lang of ['en-IN', 'ar-AE']) { await s.api.patch('/api/me/preferences', { data: { language: lang }, timeout: 45000 });
 for (const w of [360, 390]) { const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies);
  const p = await ctx.newPage(); await p.goto(`${B}/clients/${client.id}`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(lang === 'en-IN' ? 1000 : 3000);
  const body = await p.locator('main').innerText().catch(() => '');
  if (lang === 'en-IN') { check(/Invite links/.test(body), `${w} Invite links section`); check(/view only in demo/.test(body), `${w} demo view only line`); }
  check(await p.getByRole('button', { name: /Invite to Groundwork|اعزم على Groundwork/ }).count() === 0, `${lang} ${w} no invite button in demo`);
  check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${lang} ${w} sideways`);
  await p.locator('h2', { hasText: /Invite links|روابط/ }).first().scrollIntoViewIfNeeded().catch(() => {});
  await p.screenshot({ path: `${OUT}/imran-${lang}-${w}-client-invites.png` }); await ctx.close(); } } }
finally { await s.api.patch('/api/me/preferences', { data: { language: was } }).catch(() => {}); await br.close(); }
res.fail = fail; fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? 'SIGN11_FAIL' : 'SIGN11_OK'); process.exit(fail.length ? 1 : 0);
