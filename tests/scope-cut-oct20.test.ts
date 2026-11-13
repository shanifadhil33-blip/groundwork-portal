// Scope cut approved by Adhil, Oct 20 2026: arrival windows, urgent reshuffle, sick auto move, gate passes, heat rules,
// contract response times, phone change by code, the WhatsApp channel, Nov 23 archives, the Cobalt simulator and
// Connect AI for normal users are removed or hidden. Hidden means not in the UI, not offered by the agent, refused by the server; data kept.
import { afterAll, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { closePools, withSystem } from '../lib/db';
import { ids, siteId } from '../lib/fixture';
import { postDayPlan } from '../lib/services/day-plan';
import { dashboard } from '../lib/services/workspaces';
import { ownerOverview } from '../lib/services/owner-overview';
import { patchClient } from '../lib/services/clients';
import { callTool } from '../lib/agent/tools';
import { addTimeOff } from '../lib/services/time-off';
import { assertKeyMaker } from '../lib/services/tokens';
import { planFromWords } from '../lib/services/planned';
import * as channel from '../app/api/workspaces/[ws]/channel/route';
import * as contract from '../app/api/workspaces/[ws]/clients/[id]/contract/route';
import * as doc from '../app/api/workspaces/[ws]/documents/[docId]/route';

const ws = ids.ridgeline;
const made: string[] = [];
afterAll(async () => {
  await withSystem(async db => {
    await db.query('DELETE FROM notifications WHERE entity_id=ANY($1::uuid[])', [made]);
    await db.query('DELETE FROM work_order_events WHERE work_order_id=ANY($1::uuid[])', [made]);
    await db.query('DELETE FROM work_orders WHERE id=ANY($1::uuid[])', [made]);
    await db.query("DELETE FROM time_off WHERE workspace_id=$1 AND note='scope cut test'", [ws]);
  });
  await closePools();
});

it('the day plan server refuses gate, urgent and sick actions with 410', async () => {
  for (const body of [{ action: 'confirm_gate', job_id: '00000000-0000-4000-8000-000000000001' }, { action: 'skip_gate', job_id: '00000000-0000-4000-8000-000000000001' }, { action: 'preview', kind: 'urgent', job_id: '00000000-0000-4000-8000-000000000001' }, { action: 'preview', kind: 'sick', person_id: ids.ravi }])
    await expect(postDayPlan(ids.imran, ws, body)).rejects.toMatchObject({ status: 410 });
});

it('contract response times are gone from the dashboard, the overview, the client form and the agent', async () => {
  expect((await dashboard(ids.imran, ws)).contract_watch).toEqual([]);
  expect((await ownerOverview(ids.imran, ws)).contract_watch).toEqual([]);
  await expect(patchClient(ids.imran, ws, ids.harbor, { contract_response_hours: 4 })).rejects.toBeTruthy();
  expect((await callTool({ user: ids.imran, ws, scope: 'read', kind: 'assistant' }, 'contract_watch', {})).isError).toBe(true);
  expect(readFileSync('components/app/clients.tsx', 'utf8')).not.toContain('Reach the site within');
});

it('marking a technician sick puts his booked visits back to Open with no one on them', async () => {
  const id = (await withSystem(async db => {
    const day = (await db.query("SELECT ((now() AT TIME ZONE timezone)::date + 3)::text AS d FROM workspaces WHERE id=$1", [ws])).rows[0].d as string;
    return (await db.query(`INSERT INTO work_orders(workspace_id,client_id,site_id,title,status,assignee_id,scheduled_for,created_by)
      VALUES($1,$2,$3,'Scope cut sick test','scheduled',$4,($5::date + time '10:00') AT TIME ZONE 'Asia/Dubai',$6) RETURNING id, $5::text AS day`, [ws, ids.harbor, siteId(1), ids.ravi, day, ids.imran])).rows[0];
  })) as { id: string; day: string };
  made.push(id.id);
  const saved = await addTimeOff(ids.imran, ws, { user_id: ids.ravi, kind: 'sick', starts_on: id.day, note: 'scope cut test' }) as { reopened: number };
  expect(saved.reopened).toBe(1);
  const row = (await withSystem(db => db.query('SELECT status, assignee_id FROM work_orders WHERE id=$1', [id.id]))).rows[0];
  expect(row).toEqual({ status: 'open', assignee_id: null });
});

it('Connect AI keys are only for an admin of a real company', async () => {
  await expect(assertKeyMaker(ids.sam, ws)).rejects.toMatchObject({ status: 403 });
  await expect(assertKeyMaker(ids.imran, ws)).resolves.toBeUndefined();
  expect(readFileSync('app/api/workspaces/[ws]/tokens/route.ts', 'utf8')).toContain('await assertKeyMaker(user,params.ws)');
  // Settings > Agent shows the keys card only to an admin of a real company.
  const settings = readFileSync('components/app/settings-groups.tsx', 'utf8');
  expect(settings).toContain('{admin && !workspace?.is_demo && <Card><AgentAccess');
  expect(readFileSync('components/app/dashboard.tsx', 'utf8')).not.toContain('Connect your AI agent');
});

it('the agent never offers a phone change by code', async () => {
  const said = await planFromWords(ids.ravi, ws, 'change my phone number');
  expect(said?.reply ?? '').toMatch(/Ask the office/);
  expect(JSON.stringify(said)).not.toContain('pending_action');
});

it('the WhatsApp channel, contract finish and document archive routes answer 410', async () => {
  for (const response of [await channel.POST(), await contract.POST(), await doc.POST()]) {
    expect(response.status).toBe(410);
    expect((await response.json()).error.code).toBe('removed');
  }
});

it('removed screens and rules are gone from the code', () => {
  for (const gone of ['lib/heat.ts', 'components/app/arrival-window.tsx', 'components/app/window-text.tsx', 'components/app/record-keep.tsx']) expect(existsSync(gone), gone).toBe(false);
  const ui = ['components/app/my-day.tsx', 'components/app/client-home.tsx', 'components/app/schedule.tsx', 'components/app/work-order-detail.tsx', 'components/app/dashboard.tsx', 'components/app/day-plan-card.tsx', 'components/app/shell.tsx', 'components/app/documents.tsx', 'components/app/supplier.tsx']
    .map(f => readFileSync(f, 'utf8')).join('\n');
  for (const word of ['Arrival window', 'ArrivalWindow', 'WindowText', 'heat', 'gate pass', 'Urgent call', 'Off sick', 'PartsKeep', 'ContractFinish', "href: '/supplier'", 'Parts & supplier']) expect(ui, word).not.toContain(word);
  expect(readFileSync('app/(app)/supplier/page.tsx', 'utf8')).toContain("redirect('/work-orders')");
});

it('the name lead keeps a capital I and acronyms, and lowers only a normal first word', async () => {
  const { warmLead } = await import('../lib/warm-reply');
  expect(warmLead('Ravi', 'I cannot change your phone number here.')).toBe('Ravi, I cannot change your phone number here.');
  expect(warmLead('Ravi', "I'm on it.")).toBe("Ravi, I'm on it.");
  expect(warmLead('Ravi', 'Job #12 is done.')).toBe('Ravi, job #12 is done.');
  expect(warmLead('Ravi', 'The job is done.')).toBe('Ravi, the job is done.');
});

it('asked in Arabic, the phone answer is Gulf Arabic and marked localized', async () => {
  const said = await planFromWords(ids.ravi, ws, 'غير رقمي') as { reply: string; localized?: boolean };
  expect(said.reply).toMatch(/المكتب/);
  expect(said.reply).not.toMatch(/cannot|office/);
  expect(said.localized).toBe(true);
});

it('Simulate WhatsApp is hidden and the Cobalt nightly sync is off', () => {
  expect(readFileSync('components/app/suggestions.tsx', 'utf8')).not.toContain('Simulate WhatsApp');
  expect(readFileSync('app/api/workspaces/[ws]/suggestions/simulate/route.ts', 'utf8')).toContain('status: 410');
  expect(readFileSync('vercel.json', 'utf8')).not.toContain('supplier-sync');
});
