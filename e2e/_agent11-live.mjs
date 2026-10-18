// AGENT11 live check on the fixed sandbox: Ravi (technician) asks for changes he may not make; the reply carries an offer to ask a named person, and tapping it creates a question that person sees.
import { sandbox } from './sandbox.mjs'; import fs from 'node:fs';
const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`; const res = { tries: [] };
const ask = async content => { const t = Date.now(); const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content }] }, timeout: 90000 }); return { st: r.status(), ms: Date.now() - t, body: await r.json().catch(() => ({})) }; };
await s.as('ravi'); const jobs = (await (await s.api.get(`${A}/work-orders?pageSize=20`)).json()).data ?? []; const j = jobs.find(o => !['done', 'cancelled'].includes(o.status));
let offer;
for (const q of [`Give WO ${j.order_number} to Arjun`, `Change the priority of WO ${j.order_number} to urgent`, `Mark WO ${j.order_number} as paid`]) {
  const a = await ask(q); res.tries.push({ q, st: a.st, ms: a.ms, reply: (a.body.reply ?? '').slice(0, 220), offers: a.body.offers, provider: a.body.provider });
  if (a.body.offers?.length) { offer = a.body.offers[0]; break; }
}
if (offer) {
  const p = await s.api.post(`${A}/agent-questions`, { data: { question: offer.question, proposed: offer.proposed, ...(offer.work_order_id ? { work_order_id: offer.work_order_id } : {}) } }); res.post = { st: p.status(), body: await p.json().catch(() => ({})) };
  const who = offer.to_name === 'Imran' ? 'imran' : 'sam'; await s.as(who);
  const list = await (await s.api.get(`${A}/agent-questions`)).json(); const rows = list.data ?? list.questions ?? list;
  res.seenBy = { who, found: (Array.isArray(rows) ? rows : []).some(q => q.question === offer.question) };
}
fs.mkdirSync('/workspace/qa/agent11-live', { recursive: true }); fs.writeFileSync('/workspace/qa/agent11-live/report.json', JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1));
await s.as('imran');
