if (process.env.RUN_ASSISTANT_QA !== '1') { console.log('Skipping live assistant QA during the build freeze'); process.exit(0); }
// AGENT05 live check on the fixed sandbox: Imran confirms a change (log shows what moved, then Undo), Sam taps Change (said no, card dead), Ravi asks for a change a technician may not make (not allowed, with the reason).
import { sandbox } from './sandbox.mjs'; import fs from 'node:fs';
const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`; const res = {};
const ask = async content => { const t = Date.now(); const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content }] }, timeout: 90000 }); return { st: r.status(), ms: Date.now() - t, body: await r.json().catch(() => ({})) }; };
const log = async () => (await (await s.api.get(`${A}/assistant/log?limit=100`)).json());
const jobs = async () => (await (await s.api.get(`${A}/work-orders?pageSize=20`)).json()).data ?? [];
// Imran: confirm, then the log shows the change, then Undo.
await s.as('imran'); let j = (await jobs()).find(o => !['done', 'cancelled'].includes(o.status) && o.priority !== 'urgent');
let a = await ask(process.env.IMRAN_ASK ? process.env.IMRAN_ASK.replace("N", j.order_number) : `Set WO ${j.order_number} to urgent priority`); res.imranCard = !!a.body.pending_action; res.imranMs = a.ms; res.imranReply = (a.body.reply ?? '').slice(0, 200);
if (a.body.pending_action) { const c = await s.api.post(`${A}/assistant`, { data: { messages: [], confirm_action_id: a.body.pending_action.id }, timeout: 90000 }); res.imranConfirm = c.status();
  const row = (await log()).find(d => d.id === a.body.pending_action.id); res.imranRow = row && { outcome: row.outcome, changes: row.changes, can_undo: row.can_undo };
  if (row?.can_undo) res.imranUndo = (await s.api.post(`${A}/assistant/log/${row.id}/undo`, { data: {} })).status(); }
// Sam: Change on the card.
await s.as('sam'); j = (await jobs()).find(o => !['done', 'cancelled'].includes(o.status) && o.priority !== 'high');
a = await ask(`Set WO ${j.order_number} to high priority`); res.samCard = !!a.body.pending_action; res.samMs = a.ms;
if (a.body.pending_action) { res.samDecline = (await s.api.post(`${A}/assistant/log/${a.body.pending_action.id}/decline`, { data: {} })).status();
  const row = (await log()).find(d => d.id === a.body.pending_action.id); res.samRow = row && { outcome: row.outcome, reason: row.reason };
  res.samConfirmAfter = (await s.api.post(`${A}/assistant`, { data: { messages: [], confirm_action_id: a.body.pending_action.id }, timeout: 90000 })).status(); }
// Ravi: a technician may not change priority.
await s.as('ravi'); j = (await jobs()).find(o => !['done', 'cancelled'].includes(o.status));
a = await ask(`Change the priority of WO ${j?.order_number} to urgent`); res.raviReply = (a.body.reply ?? '').slice(0, 200); res.raviCard = !!a.body.pending_action;
const refused = (await log()).filter(d => d.outcome === 'refused'); res.raviRefused = refused.slice(0, 2).map(d => ({ tool: d.tool, reason: d.reason, summary: d.summary }));
fs.mkdirSync('/workspace/qa/agent05-live', { recursive: true }); fs.writeFileSync('/workspace/qa/agent05-live/report.json', JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1));
await s.as('imran');
