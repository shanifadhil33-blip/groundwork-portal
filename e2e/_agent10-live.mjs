// AGENT10 live check (no AI call: the fast path answers before the model). Ravi says "dark mode", sees the receipt with Undo, presses Undo.
import { sandbox } from './sandbox.mjs';
const s = await sandbox('imran'); await s.as('ravi'); const A = `/api/workspaces/${s.ws}`; const res = {};
const before = (await (await s.api.get('/api/me/preferences')).json()).theme;
const r1 = await (await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: 'dark mode' }] } })).json(); res.reply = r1.reply; res.choices = r1.choices;
res.saved = (await (await s.api.get('/api/me/preferences')).json()).theme;
const r2 = await (await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content: 'dark mode' }, { role: 'assistant', content: r1.reply }, { role: 'user', content: 'Undo' }] } })).json(); res.undo = r2.reply;
res.after = (await (await s.api.get('/api/me/preferences')).json()).theme; res.restored = res.after === before;
await s.as('imran'); console.log(JSON.stringify(res, null, 1));
