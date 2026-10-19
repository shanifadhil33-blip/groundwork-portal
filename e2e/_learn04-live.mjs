// LEARN04 live check (no AI call: the length request is answered before the model). Ravi says "shorter", sees the receipt with Undo, presses Undo.
import { sandbox } from './sandbox.mjs';
const s = await sandbox('imran'); await s.as('ravi'); const A = `/api/workspaces/${s.ws}`; const res = {};
const r1 = await (await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: 'shorter' }] } })).json(); res.reply = r1.reply; res.choices = r1.choices;
const p1 = await (await s.api.get('/api/me/preferences')).json().catch(() => ({})); res.saved = p1.reply_length ?? p1.data?.reply_length;
const r2 = await (await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: 'shorter' }, { role: 'assistant', content: r1.reply }, { role: 'user', content: 'Undo' }] } })).json(); res.undo = r2.reply;
const p2 = await (await s.api.get('/api/me/preferences')).json().catch(() => ({})); res.after = p2.reply_length ?? p2.data?.reply_length;
await s.as('imran'); console.log(JSON.stringify(res, null, 1));
