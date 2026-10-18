// AGENT07 live check on the fixed sandbox: a technician and a client say a plain note; it lands on the right job with the server done reply.
import { sandbox } from './sandbox.mjs'; import fs from 'node:fs';
const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`; const res = {};
const ask = async content => { const t = Date.now(); const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content }] }, timeout: 90000 }); return { st: r.status(), ms: Date.now() - t, body: await r.json().catch(() => ({})) }; };
for (const who of ['ravi', 'faisal']) {
  await s.as(who); const jobs = (await (await s.api.get(`${A}/work-orders?pageSize=20`)).json()).data ?? []; const me = await (await s.api.get('/api/me')).json().catch(() => ({})); const myId = me.user?.id ?? me.id; const mine = who === 'faisal' ? jobs.filter(o => o.created_by === myId) : jobs; const j = mine.find(o => !['done', 'cancelled'].includes(o.status)) ?? mine[0];
  if (!j) { res[who] = { error: 'no job' }; continue; }
  const words = who === 'ravi' ? `log this work on WO ${j.order_number}: checked the wiring and cleaned the fitting` : `Add a note on WO ${j.order_number}: the gate code is 4411`;
  const a = await ask(words);
  const comments = await (await s.api.get(`${A}/work-orders/${j.id}/comments`)).json().catch(() => null);
  const list = comments?.data ?? comments ?? [];
  res[who] = { wo: j.order_number, st: a.st, ms: a.ms, reply: a.body.reply, choices: a.body.choices, pending: a.body.pending_action?.tool, provider: a.body.provider,
    saved: Array.isArray(list) ? list.filter(c => /wiring|gate code/i.test(c.body ?? '')).map(c => ({ body: c.body, visibility: c.visibility })) : 'unknown' };
}
fs.mkdirSync('/workspace/qa/agent07-live', { recursive: true }); fs.writeFileSync('/workspace/qa/agent07-live/report.json', JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1));
await s.as('imran');
