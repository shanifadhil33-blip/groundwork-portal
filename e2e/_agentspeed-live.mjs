// Agent speed check on the fixed sandbox: 4 common questions per role (technician, supervisor, admin), time to the first useful content.
// The answer arrives in one response, so time to first content = time to the full reply. Up to 9 AI calls per run (lesson 48: shared quota).
import { sandbox } from './sandbox.mjs'; import fs from 'node:fs';
const OUT = process.env.OUT || '/workspace/qa/agent-panel-fix/speed-before.json'; // after: OUT=.../speed-after.json
const QS = { ravi: ['What is my next job?', 'Show jobs waiting on parts', 'Which jobs are late?', 'What needs attention?'],
  sam: ['Which jobs are late?', 'Who is free tomorrow?', 'Show jobs waiting on parts', 'What needs attention?'],
  imran: ['Which jobs are late?', 'Show jobs waiting on parts', 'Who is free tomorrow?', 'What needs attention?'] };
const s = await sandbox('imran'); const A = `/api/workspaces/${s.ws}`; const res = [];
for (const [who, qs] of Object.entries(QS)) {
  await s.as(who);
  for (const q of qs) {
    const t = Date.now(); const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: q }] }, timeout: 120000 }).catch(e => null);
    const ms = Date.now() - t; const body = r ? await r.json().catch(() => ({})) : {};
    res.push({ who, q, status: r?.status() ?? 0, ms, reply: String(body.reply ?? body.message ?? '').slice(0, 240) }); console.log(who, q, r?.status(), ms);
  }
}
await s.as('imran');
const med = a => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
const out = { at: new Date().toISOString(), median_ms: med(res.map(r => r.ms)), rows: res }; fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
