if (process.env.RUN_ASSISTANT_QA !== '1') { console.log('Skipping live assistant QA during the build freeze'); process.exit(0); }
// Live check: top clients question answers fast with no AI call.
import { sandbox } from './sandbox.mjs';
const { api, ws } = await sandbox('imran');
for (const q of ['Which of our clients had the most jobs this month, and why might that be?', 'Which clients had the most jobs this month']) {
  const t = Date.now(); const r = await api.post(`/api/workspaces/${ws}/assistant`, { data: { messages: [{ role: 'user', content: q }] } });
  const j = await r.json(); console.log(r.status(), (Date.now() - t) + 'ms', 'quick=' + j.quick, JSON.stringify(j.reply).slice(0, 300));
}
