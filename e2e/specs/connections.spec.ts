import { test, expect } from '@playwright/test';
import { Demo, stamp, list } from './helpers';
// Every connection, checked from both sides on the live site: act as one demo person, then read as the receiver.
let d: Demo;
const hasNote = (ns: any[], re: RegExp) => ns.some(n => re.test(JSON.stringify(n)));
test.beforeAll(async () => { d = await Demo.start('imran'); });
test.afterAll(async () => { await d?.reset(); });

async function firstSite(role: 'ravi' | 'pranav' | 'faisal' | 'imran') {
  await d.as(role);
  let s = list((await d.get('/request-sites')).body)[0];
  if (!s) s = list((await d.get('/suggestion-sites')).body)[0];
  if (!s && role === 'imran') { const c = list((await d.get('/clients')).body)[0]; s = list((await d.get(`/clients/${c.id}/sites`)).body)[0]; }
  expect(s, 'a site to use').toBeTruthy(); return s;
}
async function job(title: string, extra: Record<string, unknown> = {}) {
  const site = await firstSite('imran');
  const r = await d.post('/work-orders', { title, site_id: site.id, ...extra }); expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body;
}
async function patch(id: string, data: Record<string, unknown>) {
  const cur = (await d.get(`/work-orders/${id}`)).body; return d.patch(`/work-orders/${id}`, { ...data, updated_at: cur.updated_at });
}
const raviId = async () => { await d.as('imran'); const m = list((await d.get('/members')).body); return (m.find((x: any) => /ravi/i.test(x.name ?? x.user?.name ?? ''))?.user_id ?? m.find((x: any) => x.role === 'technician')?.user_id) as string; };

test.describe('Suggested jobs', () => {
  test('technician suggests, admin sees it, approves, technician is told', async () => {
    const title = stamp() + ' leaking tap';
    const site = await firstSite('ravi');
    const made = await d.post('/suggestions', { title, problem: 'Tap drips in the pantry', client_id: site.client_id, site_id: site.id });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    await d.as('imran');
    const s = list((await d.get('/suggestions')).body).find((x: any) => x.title === title);
    expect(s?.status).toBe('pending'); expect(s?.source).toBe('technician');
    expect(hasNote(await d.notifications(), /suggest/i)).toBeTruthy();
    const ok = await d.post(`/suggestions/${s.id}`, { decision: 'approved' }); expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const wo = list((await d.get(`/work-orders?q=${encodeURIComponent(title)}`)).body)[0]; expect(wo, 'work order created').toBeTruthy();
    await d.as('ravi');
    const mine = list((await d.get('/suggestions')).body).find((x: any) => x.title === title); expect(mine?.status).toBe('approved');
    expect(hasNote(await d.notifications(), new RegExp(title.slice(0, 12)))).toBeTruthy();
  });
  test('client request becomes a suggestion; decline reaches the client with the reason', async () => {
    const title = stamp() + ' broken door';
    const site = await firstSite('pranav');
    const r = await d.post('/work-orders', { title, site_id: site.id }); expect([200, 201]).toContain(r.status);
    await d.as('sam');
    const s = list((await d.get('/suggestions')).body).find((x: any) => x.title === title); expect(s?.status).toBe('pending');
    expect((await d.post(`/suggestions/${s.id}`, { decision: 'declined', reason: 'Already fixed last week' })).status).toBe(200);
    await d.as('pranav');
    const mine = list((await d.get('/suggestions')).body).find((x: any) => x.title === title);
    expect(mine?.status).toBe('declined'); expect(mine?.decline_reason).toContain('Already fixed');
  });
  test('technician can not approve; client sees only his own', async () => {
    await d.as('ravi'); const any = list((await d.get('/suggestions')).body)[0];
    if (any) expect((await d.post(`/suggestions/${any.id}`, { decision: 'approved' })).status).toBeGreaterThanOrEqual(400);
    await d.as('omar'); const theirs = list((await d.get('/suggestions')).body);
    expect(theirs.every((x: any) => !/broken door/.test(x.title))).toBeTruthy();
  });
  test('household request keeps the visit time for the supervisor', async () => {
    const title = stamp() + ' AC noise';
    const site = await firstSite('faisal');
    expect([200, 201]).toContain((await d.post('/work-orders', { title, site_id: site.id, preferred_window: 'Saturday after 4 PM' })).status);
    await d.as('sam'); const s = list((await d.get('/suggestions')).body).find((x: any) => x.title === title);
    expect(s?.preferred_window).toContain('Saturday');
  });
  test('WhatsApp demo message lands as a suggestion', async () => {
    await d.as('imran'); const r = await d.post('/suggestions/simulate', {}); expect([200, 201]).toContain(r.status);
    expect(list((await d.get('/suggestions')).body).some((x: any) => x.source === 'whatsapp')).toBeTruthy();
  });
});

test.describe('Jobs between the company and the client', () => {
  test('assigning a job tells the technician', async () => {
    const t = stamp() + ' light out'; const wo = await job(t); const ravi = await raviId();
    expect((await patch(wo.id, { assignee_id: ravi })).status).toBe(200);
    await d.as('ravi'); expect(hasNote(await d.notifications(), new RegExp(`${wo.order_number}|${t}`))).toBeTruthy();
  });
  test('status change reaches the client', async () => {
    const site = await firstSite('pranav'); await d.as('imran');
    const wo = (await d.post('/work-orders', { title: stamp() + ' status', site_id: site.id })).body;
    expect((await patch(wo.id, { status: 'scheduled' })).status).toBe(200);
    await d.as('pranav'); const seen = (await d.get(`/work-orders/${wo.id}`)).body; expect(seen?.status).toBe('scheduled');
  });
  test('client comment reaches the company; internal note never reaches the client', async () => {
    const site = await firstSite('pranav'); await d.as('imran');
    const wo = (await d.post('/work-orders', { title: stamp() + ' comments', site_id: site.id })).body;
    await d.post(`/work-orders/${wo.id}/comments`, { body: 'Team only note', visibility: 'internal' });
    await d.post(`/work-orders/${wo.id}/comments`, { body: 'We come tomorrow', visibility: 'client' });
    await d.as('pranav'); const txt = JSON.stringify((await d.get(`/work-orders/${wo.id}`)).body);
    expect(txt).toContain('We come tomorrow'); expect(txt).not.toContain('Team only note');
    expect((await d.post(`/work-orders/${wo.id}/comments`, { body: 'Thanks', visibility: 'client' })).status).toBe(201);
    await d.as('imran'); expect(JSON.stringify((await d.get(`/work-orders/${wo.id}`)).body)).toContain('Thanks');
  });
  test('price sent to the facility manager; his answer comes back; office staff can not answer', async () => {
    const site = await firstSite('pranav'); await d.as('imran');
    const wo = (await d.post('/work-orders', { title: stamp() + ' quote', site_id: site.id })).body;
    expect((await d.post(`/work-orders/${wo.id}/quote`, { amount: 850 })).status).toBe(200);
    await d.as('kevin'); expect((await d.post(`/work-orders/${wo.id}/quote/decision`, { decision: 'approved' })).status).toBeGreaterThanOrEqual(400);
    await d.as('pranav'); expect((await d.post(`/work-orders/${wo.id}/quote/decision`, { decision: 'approved' })).status).toBe(200);
    await d.as('imran'); expect((await d.get(`/work-orders/${wo.id}`)).body?.quote_status).toBe('approved');
  });
});

test.describe('Leave', () => {
  test('technician asks for a day off, supervisor decides, technician sees the answer', async () => {
    await d.as('ravi'); const day = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
    const r = await d.post('/time-off/request', { kind: 'off', starts_on: day }); expect(r.status, JSON.stringify(r.body)).toBe(201);
    await d.as('sam'); const all = (await d.get('/time-off/request')).body; const w = JSON.stringify(all);
    expect(w).toContain(day); const id = (list(all?.requests ?? all).find((x: any) => x.starts_on?.startsWith(day)))?.id;
    expect(id).toBeTruthy(); expect((await d.api.put(d.url(`/time-off/${id}/decision`), { data: { decision: 'approved' } })).status()).toBe(200);
    await d.as('ravi'); expect(JSON.stringify((await d.get('/time-off/request')).body)).toMatch(/approved/);
  });
});

test.describe('Messages between people', () => {
  test.beforeEach(async () => { await d.as('imran'); test.skip(!(await d.exists('/messages')), 'Messaging not live yet'); });
  for (const [from, to] of [['ravi', 'imran'], ['imran', 'ravi'], ['ravi', 'sam'], ['sam', 'ravi'], ['pranav', 'imran'], ['imran', 'pranav'], ['pranav', 'sam'], ['sam', 'pranav'], ['imran', 'sam'], ['pranav', 'kevin'], ['nabil', 'ravi']] as const) {
    test(`${from} messages ${to} and ${to} reads it`, async () => {
      await d.as(to); const meId = (await d.api.get('/api/me').then(r => r.json())).user.id;
      await d.as(from); const body = `${stamp()} hello from ${from}`;
      const r = await d.post('/messages', { recipient_id: meId, body }); expect([200, 201], JSON.stringify(r.body)).toContain(r.status);
      await d.as(to); expect(JSON.stringify((await d.get('/messages')).body) + JSON.stringify(await d.notifications())).toContain(from === 'imran' ? 'Imran' : from[0].toUpperCase() + from.slice(1));
    });
  }
  test('client can not message a technician who is not on his jobs; phone numbers stay hidden', async () => {
    await d.as('pranav'); const pid = (await d.api.get('/api/me').then(r => r.json())).user.id;
    await d.as('omar'); expect((await d.post('/messages', { recipient_id: pid, body: 'other company' })).status, 'client of another company is refused').toBeGreaterThanOrEqual(400);
    const r = await d.get('/messages'); expect(JSON.stringify(r.body)).not.toMatch(/\+?971\s?5\d/);
  });
});

test.describe('Team space', () => {
  test.beforeEach(async () => { await d.as('imran'); test.skip(!(await d.exists('/team-space')), 'Team space not live yet'); });
  test('technician posts, admin and office staff read it, clients can not', async () => {
    const body = `${stamp()} team hello`;
    await d.as('ravi'); expect([200, 201]).toContain((await d.post('/team-space', { body })).status);
    for (const p of ['imran', 'nabil', 'sam'] as const) { await d.as(p); const space = (await d.get('/team-space')).body; expect(JSON.stringify((await d.get(`/messages?conversation_id=${space.id}`)).body)).toContain(body); }
    for (const p of ['pranav', 'faisal'] as const) { await d.as(p); expect((await d.get('/team-space')).status).toBeGreaterThanOrEqual(400); }
  });
});

test.describe('Personal agents', () => {
  test('renaming my agent changes only mine', async () => {
    await d.as('ravi'); const name = 'Buddy' + Date.now().toString(36).slice(-3);
    const r = await d.api.patch('/api/me/preferences', { data: { agent_name: name } }); expect(r.status()).toBe(200);
    await d.as('imran'); const mine = await (await d.api.get('/api/me/preferences')).json();
    expect(JSON.stringify(mine)).not.toContain(name);
  });
  test('admin can not read a technician\'s agent log', async () => {
    await d.as('imran'); const log = JSON.stringify((await d.get('/assistant/log')).body ?? {});
    expect(log).not.toMatch(/"user_name":"Ravi/);
  });
});
