// HOME07 live check on the fixed sandbox (no AI call): after a reset (new fixture), Pranav asks for free slots on his own scheduled job, prepares a move (a card, nothing changes), and another client's job is not found.
import { sandbox } from './sandbox.mjs';
const s = await sandbox('imran'); await s.reset(); const s2 = await sandbox('imran'); const A = `/api/workspaces/${s2.ws}`; const res = {};
await s2.as('pranav');
const list = await (await s2.api.get(`${A}/work-orders?pageSize=50`)).json();
const mine = (list.data ?? []).filter(o => o.status === 'scheduled'); res.scheduledVisible = mine.length;
for (const o of mine) { const r = await s2.api.get(`${A}/work-orders/${o.id}/visit-change`); if (r.status() === 200) { const b = await r.json(); res.job = o.order_number; res.slots = b.slots; res.tz = b.timezone;
  const before = o.scheduled_for; const p = await s2.api.post(`${A}/work-orders/${o.id}/visit-change`, { data: { tool: 'reschedule_visit', updated_at: b.updated_at, scheduled_for: b.slots[0] } });
  res.prepareStatus = p.status(); const pb = await p.json(); res.card = pb.pending_action?.summary ?? pb.summary ?? JSON.stringify(pb).slice(0, 200);
  const after = await (await s2.api.get(`${A}/work-orders/${o.id}`)).json(); res.unchangedBeforeYes = (after.scheduled_for ?? after.data?.scheduled_for) === before; break; } else res.lastStatus = r.status(); }
await s2.as('imran');
const all = await (await s2.api.get(`${A}/work-orders?pageSize=100`)).json(); const other = (all.data ?? []).find(o => o.status === 'scheduled' && o.client_id && !(res.job && o.order_number === res.job) && o.created_by !== '10000000-0000-4000-8000-000000000003');
await s2.as('pranav'); if (other) res.otherJob = (await s2.api.get(`${A}/work-orders/${other.id}/visit-change`)).status();
await s2.as('imran'); console.log(JSON.stringify(res, null, 1));
