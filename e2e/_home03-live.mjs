// HOME03 live check on the fixed sandbox (no AI call: intake answers before the model). Faisal reports a problem, answers the taps, skips the photo, sees the card with his words, taps Yes.
import { sandbox } from './sandbox.mjs';
const s = await sandbox('imran'); await s.as('faisal'); const A = `/api/workspaces/${s.ws}`; const res = { steps: [] };
const say = async (content, extra = {}) => { const r = await s.api.post(`${A}/assistant`, { data: { messages: [{ role: 'user', content }], ...extra } }); const b = await r.json(); res.steps.push({ said: content, status: r.status(), reply: b.reply, choices: b.choices, photo: b.household_photo, card: b.pending_action?.summary }); return b; };
let b = await say('my AC is not cooling');
if (b.reply === 'Which home is this for?') b = await say(b.choices[0]);
if (/Where/.test(b.reply ?? '')) b = await say('Bedroom');
if (/Since/.test(b.reply ?? '')) b = await say('Today');
b = await say('Skip photo');
res.cardHasWords = !!b.pending_action?.summary?.includes('my AC is not cooling');
res.noGuess = !/compressor|refrigerant|gas|AED/i.test(JSON.stringify(res.steps));
if (b.pending_action) { const c = await s.api.post(`${A}/assistant`, { data: { messages: [], confirm_action_id: b.pending_action.id } }); res.confirm = (await c.json()).reply; }
await s.as('imran'); console.log(JSON.stringify(res, null, 1));
