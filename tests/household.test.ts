import { afterAll, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../lib/ai', () => ({ assistantTurn: vi.fn() }));
vi.mock('../lib/services/push', () => ({ sendPush: vi.fn(async () => 0) }));
import { assistantTurn } from '../lib/ai';
import { assistant } from '../lib/services/assistant';
import { householdFields } from '../lib/agent/household';
import { closePools, withSystem } from '../lib/db';
import { ids, siteId } from '../lib/fixture';
const ws = ids.ridgeline, user = ids.faisal;
afterAll(closePools);
beforeEach(async () => {
 vi.mocked(assistantTurn).mockReset();
 vi.mocked(assistantTurn).mockResolvedValue({ text: 'Probably the compressor. Low refrigerant. AED 900.', calls: [] });
 await withSystem(async db => {
  await db.query('DELETE FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2', [ws, user]);
  await db.query('UPDATE sites SET archived_at=NULL WHERE id=ANY($1::uuid[])', [[siteId(4), siteId(5)]]);
 });
});
const send = (content: string, extra = {}) => assistant(user, ws, { messages: [{ role: 'user', content }], ...extra }) as Promise<any>;
const saved = () => withSystem(async db => (await db.query('SELECT * FROM job_suggestions WHERE workspace_id=$1 AND sender_user_id=$2 ORDER BY created_at DESC', [ws, user])).rows);
async function oneSite() { await withSystem(db => db.query('UPDATE sites SET archived_at=now() WHERE id=$1', [siteId(5)])); }
async function chooseSite(r: any) { if (r.reply === 'Which home is this for?') return send(r.choices[0]); return r; }
async function confirm(r: any) { return assistant(user, ws, { messages: [], confirm_action_id: r.pending_action.id }) as Promise<any>; }
it('asks site then where then since once with a cap of three and saves only after the card', async () => {
 const before = (await saved()).length;
 const first = await send('my AC is not cooling');
 expect(first.reply).toBe('Which home is this for?');
 const second = await send(first.choices[0]);
 expect(second.reply).toBe('Where in your home is the problem?');
 const third = await send('Bedroom');
 expect(third).toMatchObject({ reply: 'Since when has this been happening?', choices: ['Today', 'A few days', 'Longer'] });
 const photo = await send('Today');
 expect(photo).toMatchObject({ household_photo: true, choices: ['Skip photo'] });
 const r = await send('Skip photo');
 expect(r.pending_action.summary).toContain('my AC is not cooling');
 expect(r.pending_action.summary).toContain('Where: Bedroom\nSince: Today\nPhoto: No');
 expect((await saved()).length).toBe(before);
 const draft = await withSystem(async db => (await db.query('SELECT args FROM assistant_actions WHERE id=$1', [r.pending_action.id])).rows[0].args);
 expect(draft.asked).toEqual(['site', 'where', 'since']);
 expect(await confirm(r)).toMatchObject({ reply: 'Your request was sent. The company will confirm a time.' });
 const row = (await saved())[0];
 expect(row).toMatchObject({ problem: 'my AC is not cooling\nWhere: Bedroom\nSince: Today', title: 'Home maintenance request', source: 'household', photo_ids: [] });
 expect(JSON.stringify(row)).not.toMatch(/compressor|refrigerant|900/);
 expect(assistantTurn).not.toHaveBeenCalled();
 await expect(confirm(r)).rejects.toMatchObject({status: 409});
});
it('one home skips site and facts already supplied skip their questions', async () => {
 await oneSite();
 const r = await send('water under the sink since yesterday');
 expect(r.household_photo).toBe(true);
 const card = await send('Skip photo');
 expect(card.pending_action.summary).toContain('Where: under the sink');
 expect(card.pending_action.summary).toContain('Since: since yesterday');
});
it('answers can supply later facts without asking them again', async () => {
 await oneSite();
 expect((await send('my AC is not cooling')).reply).toContain('Where');
 expect((await send('Bedroom since yesterday')).household_photo).toBe(true);
});
it.each(['  എന്റെ AC തണുപ്പിക്കുന്നില്ല  ', 'المكيف لا يبرد', 'my AC is not cooling'])('preserves original language and whitespace: %s', async words => {
 await oneSite();
 await send(words);
 await send('Kitchen');
 await send('A few days');
 const card = await send('Skip photo');
 expect(card.pending_action.summary).toContain(words);
 await confirm(card);
 expect((await saved())[0].problem).toBe(`${words}\nWhere: Kitchen\nSince: A few days`);
});
it('server allowlist discards generated causes parts faults and prices without changing his words', () => {
 const own = 'water under the sink';
 for (const guess of ['probably the compressor', 'low refrigerant', 'blocked drain', 'replace the valve', 'AED 900']) {
  expect(householdFields(own, 'Kitchen', 'Today', { title: guess, problem: own + guess })).toEqual({ title: 'Home maintenance request', problem: 'water under the sink\nWhere: Kitchen\nSince: Today' });
 }
 expect(householdFields('I think the compressor failed').problem).toBe('I think the compressor failed');
});
it('a model request with an invented fault is replaced with intake using only his words', async () => {
 await oneSite();
 vi.mocked(assistantTurn).mockResolvedValue({ text: 'Probably the compressor, AED 900.', calls: [{ id: 'guess', name: 'create_request', args: { title: 'Replace compressor', description: 'Low refrigerant', site_id: siteId(4), preferred_window: 'Today' } }] });
 const r = await send('The fan makes a strange sound');
 expect(assistantTurn).toHaveBeenCalledTimes(1);
 expect(r.reply).toContain('Where');
 await send('Bedroom'); await send('Longer');
 const card = await send('Skip photo');
 expect(card.pending_action.summary).not.toMatch(/compressor|refrigerant|900/);
 expect((await confirm(card)).reply).not.toMatch(/compressor|refrigerant|900/);
 expect((await saved())[0].problem).toBe('The fan makes a strange sound\nWhere: Bedroom\nSince: Longer');
});
it('optional photo uses the existing upload store and stays on the request', async () => {
 await oneSite();
 await send('water under the sink today');
 const photo = await withSystem(async db => (await db.query("INSERT INTO shared_photos(workspace_id,uploaded_by,mime,bytes,width,height) VALUES($1,$2,'image/jpeg',$3,1,1) RETURNING id", [ws, user, Buffer.alloc(100)])).rows[0].id);
 const card = await send('Continue with photo', { household_photo_ids: [photo] });
 expect(card.pending_action.summary).toContain('Photo: Yes');
 await confirm(card);
 expect((await saved())[0].photo_ids).toEqual([photo]);
 const attached = await withSystem(async db => (await db.query('SELECT suggestion_id FROM shared_photos WHERE id=$1', [photo])).rows[0]);
 expect(attached.suggestion_id).toBe((await saved())[0].id);
});
it('rejects a photo from another sender', async () => {
 await oneSite(); await send('water under the sink today');
 const photo = await withSystem(async db => (await db.query("INSERT INTO shared_photos(workspace_id,uploaded_by,mime,bytes,width,height) VALUES($1,$2,'image/jpeg',$3,1,1) RETURNING id", [ws, ids.sam, Buffer.alloc(100)])).rows[0].id);
 await expect(send('Continue with photo', { household_photo_ids: [photo] })).rejects.toMatchObject({status: 422});
});
it('emergency bypasses active household intake and sends through JOB21', async () => {
 await send('my AC is not cooling');
 const r = await send('I smell gas');
 expect(r).toMatchObject({emergency: true});
 expect(r.reply).toMatch(/^Safety first/);
 expect(r.household_photo).toBeUndefined();
 expect(r.choices).toBeUndefined();
 expect(assistantTurn).not.toHaveBeenCalled();
});

it('a named home and all details in his first message need no questions',async()=>{
 const first=await send('my AC is not cooling');
 await withSystem(db=>db.query('DELETE FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2',[ws,user]));
 const words=`${first.choices[0]} kitchen AC is not cooling today`;
 expect((await send(words)).household_photo).toBe(true);
 const card=await send('Skip photo');
 await confirm(card);
 expect((await saved())[0].problem).toBe(`${words}\nWhere: kitchen\nSince: today`);
});
it('an invalid site answer offers the same taps without asking the question twice',async()=>{
 await send('my AC is not cooling');
 const r=await send('I am not sure');
 expect(r.reply).toBe('Tap a home from the choices.');
 expect(r.reply).not.toContain('?');
 expect((await send(r.choices[0])).reply).toContain('Where');
});
it('the report shortcut asks for his actual words before starting intake',async()=>{
 expect(await send('Report a problem')).toMatchObject({reply:'Tell me what is happening in your home.'});
 expect((await send('my AC is not cooling')).reply).toBe('Which home is this for?');
 expect(assistantTurn).not.toHaveBeenCalled();
});

it('corrects a model diagnosis in a text reply for an unfamiliar symptom',async()=>{
 await oneSite();
 const r=await send('The fan makes a strange sound');
 expect(assistantTurn).toHaveBeenCalledTimes(1);
 expect(r.reply).toBe('Where in your home is the problem?');
 expect(r.reply).not.toMatch(/compressor|refrigerant|900/);
 await send('Bedroom');await send('Today');
 const card=await send('Skip photo');
 await confirm(card);
 expect((await saved())[0].problem).toBe('The fan makes a strange sound\nWhere: Bedroom\nSince: Today');
});

it('a status question about a leak or a fault never starts intake',async()=>{
 vi.mocked(assistantTurn).mockResolvedValue({ text: 'Your request is open.', calls: [] });
 for(const q of ['Is my leak fixed?','When is the technician coming for the AC not cooling','المكيف لا يبرد؟']){
  const r=await send(q);
  expect(r.household_photo).toBeUndefined();
  expect(r.reply).not.toBe('Which home is this for?');
 }
 const open=await withSystem(async db=>(await db.query("SELECT count(*)::int AS n FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND tool='household_intake'",[ws,user])).rows[0].n);
 expect(open).toBe(0);
});
it('a question in the middle of intake drops the draft and is answered normally',async()=>{
 await oneSite();
 vi.mocked(assistantTurn).mockResolvedValue({ text: 'Your request is open.', calls: [] });
 expect((await send('my AC is not cooling')).reply).toContain('Where');
 const r=await send('When is the technician coming?');
 expect(r.reply).not.toContain('Where');
 const left=await withSystem(async db=>(await db.query("SELECT count(*)::int AS n FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND tool='household_intake' AND declined_at IS NULL",[ws,user])).rows[0].n);
 expect(left).toBe(0);
});
it('each answer keeps the draft alive for another ten minutes',async()=>{
 await oneSite();
 await send('my AC is not cooling');
 await withSystem(db=>db.query("UPDATE assistant_actions SET expires_at=now()+interval '1 minute' WHERE workspace_id=$1 AND user_id=$2",[ws,user]));
 await send('Bedroom');
 const mins=await withSystem(async db=>(await db.query("SELECT extract(epoch FROM expires_at-now())/60 AS m FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND tool='household_intake'",[ws,user])).rows[0].m);
 expect(Number(mins)).toBeGreaterThan(9);
});
