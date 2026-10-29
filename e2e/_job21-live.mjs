if (process.env.RUN_ASSISTANT_QA !== '1') { console.log('Skipping live assistant QA during the build freeze'); process.exit(0); }
// JOB21 live check on the fixed sandbox (no AI call: the emergency path answers before the model). Household reports gas; Imran sees the urgent alert.
import { sandbox } from './sandbox.mjs';
const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`; const res = {};
await s.as(process.env.WHO || 'pranav');
const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: 'I smell gas in the kitchen' }] } });
const b = await r.json(); res.status = r.status(); res.reply = b.reply; res.emergency = b.emergency; res.request = !!(b.request || b.job); res.kind = b.kind;
const r2 = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: 'I smell gas in the kitchen' }] } }); res.secondDuplicate = (await r2.json()).duplicate ?? null;
await s.as('imran');
const n = await (await s.api.get(`${A}/notifications`)).json(); const e = (n.data ?? []).filter(x => x.kind === 'emergency');
res.imranAlerts = e.length; res.alert = e[0]?.message; res.priority = e[0]?.priority;
console.log(JSON.stringify(res, null, 1));
