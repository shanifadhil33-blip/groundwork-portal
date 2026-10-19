// ROLE07 live check on the fixed sandbox, no AI call: Imran (owner) sees the Owner section; Sam made a plain admin for the check
// is refused on approval mode and Paid with the plain line, can after handover; everything restored at the end.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT = process.env.OUT || '/workspace/qa/role07-live'; fs.mkdirSync(OUT, { recursive: true });
let s = await sandbox('imran'); if (!process.env.NO_RESET) { await s.reset(); s = await sandbox('imran'); } await s.as('imran'); const ws = s.ws; const base = `/api/workspaces/${ws}`; const res = {};
const team = await (await s.api.get(`${base}/team`)).json(); const people = team.data ?? team.members ?? team;
const sam = people.find(p => /Sam/.test(p.name)); const samBefore = { roles: [sam.role === 'staff' ? (sam.staff_kind === 'office' ? 'office' : sam.is_manager ? 'manager' : 'staff') : sam.role, ...(sam.extra_roles ?? [])] };
res.imranOwner = !!people.find(p => /Imran/.test(p.name))?.is_owner;
const set = await s.api.put(`${base}/members/${sam.user_id}/roles`, { data: { roles: ['admin'] } }); res.samMadeAdmin = set.status();
const before = await (await s.api.get(`${base}/settings`)).json(); res.modeBefore = before.approval_mode;
const shot = async (who, name) => { const br = await chromium.launch(); for (const w of [360, 390]) { const ctx = await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await ctx.addCookies((await s.api.storageState()).cookies); const p = await ctx.newPage(); await p.goto(`${B}/settings?tab=company`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200); const owner = p.getByRole('heading', { name: 'Owner' }); res[`${who}${w}`] = { ownerSection: await owner.count(), onlyOwnerLine: await p.getByText('Only the owner can change this.').count(), closeAccount: await p.getByText('Close company account').count(), sideways: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1) }; if (await owner.count()) await owner.scrollIntoViewIfNeeded(); else await p.getByText('When the agent asks first').first().scrollIntoViewIfNeeded().catch(() => {}); await p.screenshot({ path: `${OUT}/${name}-${w}.png` }); await ctx.close(); } await br.close(); };
await shot('imran', 'imran-owner-settings');
await s.as('sam');
const r1 = await s.api.patch(`${base}/settings`, { data: { approval_mode: before.approval_mode === 'every' ? 'important' : 'every' } }); res.samModeChange = [r1.status(), (await r1.text()).slice(0, 120)];
const done = (await (await s.api.get(`${base}/work-orders?status=done`)).json()); const job = (done.data ?? done)[0];
const r2 = await s.api.post(`${base}/work-orders/${job.id}/payment`, { data: { payment_status: 'paid' } }); res.samPaid = [r2.status(), (await r2.text()).slice(0, 120)];
await shot('sam', 'sam-plain-admin-settings');
await s.as('imran'); res.handover = (await s.api.patch(`${base}/settings`, { data: { owner_handover: ['approval_mode'] } })).status();
await s.as('sam'); const r3 = await s.api.patch(`${base}/settings`, { data: { approval_mode: before.approval_mode === 'every' ? 'important' : 'every' } }); res.samModeAfterHandover = r3.status();
await s.as('imran'); await s.api.patch(`${base}/settings`, { data: { approval_mode: before.approval_mode, owner_handover: [] } });
res.samRestored = (await s.api.put(`${base}/members/${sam.user_id}/roles`, { data: samBefore })).status();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1));
