import fs from 'node:fs'; import { sandbox } from '/workspace/portal-hero/e2e/sandbox.mjs';
const s = await sandbox('pranav'); await s.as('pranav'); const A = `/api/workspaces/${s.ws}`; const out = [];
for (const q of ['What needs my attention?', 'Show me my open requests', 'Any prices waiting for me?', 'What did the technician fix last time at my site?', 'Is anything late?']) {
 const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: q }] }, timeout: 60000 }); const b = await r.json().catch(() => ({}));
 const reply = String(b.reply ?? ''); const raw = /^\s*[{\[]|"tool input"|```|<tool_call|<function=|"arguments"\s*:/i.test(reply);
 out.push({ q, status: r.status(), quick: b.quick ?? false, raw, reply: reply.slice(0, 160) }); }
fs.writeFileSync('/workspace/qa/pranav-rawcall-probe-ship52.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
const bad = out.filter(o => o.raw || o.status !== 200 || !o.reply); console.log(bad.length ? 'PROBE_FAIL' : 'PROBE_OK'); process.exit(bad.length ? 1 : 0);
