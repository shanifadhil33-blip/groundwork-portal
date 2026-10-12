import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { setAuthResolverForTests } from '../lib/auth';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import * as teamRoute from '../app/api/workspaces/[ws]/team/route';
import { tools } from '../lib/agent/tools';
let user: string | null = ids.imran;
beforeEach(() => { user = ids.imran; setAuthResolverForTests(async () => user); });
afterAll(async () => { setAuthResolverForTests(); await closePools(); });
async function get(ws = ids.ridgeline) { const r = await teamRoute.GET(new Request('http://localhost/api'), { params: Promise.resolve({ ws }) }); return { status: r.status, body: await r.json() }; }
describe('Team section', () => {
  it('admin sees workers only, never clients, with today, late and open counts', async () => {
    const r = await get(); expect(r.status).toBe(200);
    const roles = r.body.map((p: { role: string }) => p.role);
    expect(roles).not.toContain('client'); expect(roles).toEqual(expect.arrayContaining(['admin', 'staff', 'technician']));
    expect(roles[0]).toBe('technician');
    const ravi = r.body.find((p: { user_id: string }) => p.user_id === ids.ravi);
    const want = await withSystem(async db => (await db.query("SELECT count(*)::int n FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 AND status NOT IN ('done','cancelled')", [ids.ridgeline, ids.ravi])).rows[0].n);
    expect(ravi.open).toBe(want); expect(typeof ravi.today).toBe('number'); expect(typeof ravi.late).toBe('number');
    expect(ravi.signs_in_with).toBe('google');
  });
  it('a supervisor can see the team', async () => { user = ids.sam; expect((await get()).status).toBe(200); });
  it('technicians and clients cannot', async () => {
    for (const u of [ids.ravi, ids.pranav]) { user = u; expect((await get()).status).toBe(403); }
  });
  it('no phones leak from another workspace', async () => { const r = await get(); for (const p of r.body) expect(p.user_id).not.toBe(ids.summitAdmin); });
  it('the assistant can read the team and add a worker only with a confirmation', () => {
    expect(tools.list_team.write).toBe(false); expect(tools.add_worker.write).toBe(true);
    expect(tools.add_worker.schema.safeParse({ name: 'Faisal' }).success).toBe(true);
    expect(tools.add_worker.schema.safeParse({ name: 'Faisal', role: 'admin' }).success).toBe(false);
  });
});
import * as listRoute from '../app/api/workspaces/[ws]/work-orders/route';
describe('Team numbers open the same jobs', () => {
  it('Open on a card equals the active jobs list for that person', async () => {
    const team = (await get()).body as { user_id: string; open: number }[];
    for (const p of team) {
      const r = await listRoute.GET(new Request(`http://localhost/api?assignee_id=${p.user_id}&active=true&pageSize=100`), { params: Promise.resolve({ ws: ids.ridgeline }) });
      const body = await r.json(); expect(body.total ?? body.data.length).toBe(p.open);
    }
  });
});
