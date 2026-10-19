import { afterAll, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';
import { callTool, tools, type AgentContext } from '../lib/agent/tools';
import { allowedTool } from '../lib/agent/role-tools';
import { closePools } from '../lib/db';
import { inWorkspace } from '../lib/services/shared';
import { ids } from '../scripts/seed';

// Independent policy inventory: adding a tool requires an explicit review of its roles.
const common = `set_my_setting get_onboarding fill_onboarding list_contacts suggest_contact_name list_messages send_message
list_suggestions needs_attention list_work_orders get_work_order_by_number get_work_order my_memory
remember_about_me forget_about_me set_call_me add_comment list_sites ask_choice list_job_photos notification_status whoami`.split(/\s+/);
const clientOnly = ['free_visit_slots','previous_technician','reschedule_visit','cancel_visit'];
const client = `withdraw_request create_request`.split(' ');
const clientAnswers = `waiting_prices answer_quote confirm_visit`.split(' ');
const technician = `list_team_messages send_team_message suggest_job ask_supervisor update_work_order_status
save_job_report request_time_off list_leave_requests my_day get_schedule list_documents`.split(/\s+/);
const office = `update_work_order_dates set_priority list_approval_queue approve_queue_row reject_queue_row
get_dashboard list_clients list_team suggest_worker assign_work_order set_job_trade send_quote update_document remove_document`.split(/\s+/);
const supervisor = `approve_suggestion decline_suggestion add_worker set_worker_skills decide_time_off`.split(' ');
const admin = `create_client update_client create_site update_site set_approval_mode set_member_roles rename_role set_job_payment`.split(' ');
const inventory = [...common, ...clientOnly, ...client, ...clientAnswers, ...technician, ...office, ...supervisor, ...admin, 'fix_history'];
const actors = [
 { role: 'admin', user: ids.imran, grant: inventory.filter(n => !clientOnly.includes(n)) },
 { role: 'staff', user: ids.sam, grant: inventory.filter(n => !admin.includes(n) && !clientOnly.includes(n)) },
 { role: 'office', user: ids.nabil, grant: inventory.filter(n => !admin.includes(n) && !supervisor.includes(n) && !clientOnly.includes(n)) },
 { role: 'technician', user: ids.ravi, grant: [...common.filter(n => n !== 'list_sites'), ...technician] },
 { role: 'client:manager', user: ids.pranav, grant: [...common, ...clientOnly, ...client, ...clientAnswers, 'fix_history'] },
 { role: 'client:office', user: ids.kevin, grant: [...common, ...clientOnly, ...client] },
 { role: 'client:household', user: ids.faisal, grant: [...common, ...clientOnly, ...client, ...clientAnswers] },
];
afterAll(closePools);
it('every exported tool has an explicit role rule', () => {
 expect(new Set(inventory).size).toBe(inventory.length);
 expect(Object.keys(tools).sort()).toEqual([...inventory].sort());
});
for (const actor of actors) describe(actor.role, () => {
 it('uses the real seeded membership', async () => {
  const role = await inWorkspace(actor.user, ids.ridgeline, async c => c.role === 'client' ? `client:${c.client_kind ?? 'manager'}` : c.staff_kind === 'office' ? 'office' : c.role);
  expect(role).toBe(actor.role);
 });
 for (const kind of ['assistant', 'agent'] as const) it.each(Object.keys(tools))(`${kind}: %s checks the role before args or writes`, async name => {
  const permitted = actor.grant.includes(name);
  expect(allowedTool(actor.role, name)).toBe(permitted);
  const parse = vi.spyOn(tools[name].schema, 'parse');
  const run = vi.spyOn(tools[name], 'run');
  const queries = vi.spyOn(Client.prototype, 'query');
  try {
   const c: AgentContext = { user: actor.user, ws: ids.ridgeline, scope: 'write', kind };
   // null fails even empty object schemas. Allowed calls must reach validation;
   // denied calls must fail before validation, execution or an approval queue write.
   const result = await callTool(c, name, null);
   expect(result.isError).toBe(true);
   expect(result.structuredContent).toMatchObject({ error: { code: permitted ? 'validation' : 'forbidden' } });
   expect(parse).toHaveBeenCalledTimes(permitted ? 1 : 0);
   expect(run).not.toHaveBeenCalled();
   const sql = queries.mock.calls.map(([q]) => typeof q === 'string' ? q : (q as { text?: string }).text ?? '');
   expect(sql.length).toBeGreaterThan(0);
   expect(sql.every(q => /^(?:BEGIN|COMMIT|ROLLBACK|SELECT)\b/i.test(q.trim())), sql.join('\n')).toBe(true);
  } finally { queries.mockRestore(); run.mockRestore(); parse.mockRestore(); }
 });
});
