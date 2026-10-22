import { afterAll, beforeAll, expect, it, vi } from 'vitest';
const ai = vi.hoisted(() => vi.fn());
vi.mock('../lib/ai', () => ({ assistantTurn: ai }));
import { closePools, withSystem } from '../lib/db';
import { startDemo, resetDemo } from '../lib/services/demo';
import { addFieldWorker, newFieldLink, redeemFieldLink } from '../lib/services/field-signin';
import { acceptInvite, createInvite, listInvites, revokeInvite } from '../lib/services/invites';
import { assistant } from '../lib/services/assistant';
import { PRACTICE_CODE, PRACTICE_NOTICE, PRACTICE_TOKEN, practiceJoinUrl } from '../lib/identity-rehearsal';
import { ids } from '../lib/fixture';

let ws: string, second: string;
let people: Record<string, string>;
beforeAll(async () => {
  ws = (await startDemo({persona:'imran'}, 'identity-test')).body.workspace_id;
  second = (await startDemo({persona:'imran'}, 'identity-second')).body.workspace_id;
  people = await withSystem(async db => Object.fromEntries((await db.query('SELECT id,demo_persona FROM users WHERE demo_workspace_id=$1',[ws])).rows.map(r => [r.demo_persona,r.id])));
});
afterAll(async () => { await withSystem(async db => { for(const id of [ws,second]) if(id) await db.query('SELECT delete_demo_workspace($1)',[id]); }); await closePools(); });
async function identityCounts() {
  return withSystem(async db => (await db.query(`SELECT (SELECT count(*) FROM users)::int AS users,
    (SELECT count(*) FROM members)::int AS members,(SELECT count(*) FROM login_links)::int AS links,
    (SELECT count(*) FROM invites)::int AS invites,(SELECT count(*) FROM accounts)::int AS accounts,
    (SELECT count(*) FROM sessions)::int AS sessions`)).rows[0]);
}
it('admin and supervisor get nonredeemable worker and new sign in previews without adding identities or credentials', async () => {
  const before = await identityCounts();
  for(const user of [people.imran,people.sam]) {
    const result = await addFieldWorker(user,ws,{name:'Yusuf'});
    expect(result).toMatchObject({simulated:true,name:'Yusuf',token:PRACTICE_TOKEN,code:PRACTICE_CODE,notice:PRACTICE_NOTICE});
    expect(result).not.toHaveProperty('user_id');
    expect(await newFieldLink(user,ws,people.ravi)).toMatchObject({simulated:true,token:PRACTICE_TOKEN});
  }
  await expect(redeemFieldLink({token:PRACTICE_TOKEN},'preview')).rejects.toThrow();
  await expect(redeemFieldLink({code:PRACTICE_CODE},'preview')).rejects.toThrow();
  await expect(acceptInvite(ids.imran,{token:PRACTICE_TOKEN})).rejects.toThrow();
  expect(await identityCounts()).toEqual(before);
});
it('preserves team permissions and tenant boundaries for previews', async () => {
  for(const user of [people.nabil,people.ravi,people.pranav,people.faisal]) {
    await expect(addFieldWorker(user,ws,{name:'Yusuf'})).rejects.toMatchObject({status:403});
    await expect(newFieldLink(user,ws,people.ravi)).rejects.toMatchObject({status:403});
  }
  await expect(addFieldWorker(people.sam,ws,{name:'Yusuf',role:'staff'})).rejects.toMatchObject({status:403});
  await expect(addFieldWorker(people.imran,second,{name:'Yusuf'})).rejects.toMatchObject({status:404});
  await expect(newFieldLink(people.imran,ws,ids.ravi)).rejects.toMatchObject({status:404});
  await expect(newFieldLink(people.imran,ws,people.pranav)).rejects.toMatchObject({status:403});
  await expect(addFieldWorker(people.imran,ws,{name:'Yusuf',phone:'not a phone'})).rejects.toThrow();
});
it('seeds fictional invites and supports validated create, reload, replay and revoke without issuing invitations', async () => {
  const before = await identityCounts();
  const seeded = await listInvites(people.imran,ws);
  expect(seeded).toHaveLength(1);
  expect(seeded[0]).toMatchObject({simulated:true,email:'yusuf@harbor.example',role:'client',client_kind:'manager',status:'pending'});
  const body = {email:'yusuf@practice.example',role:'client',client_id:seeded[0].client_id,client_kind:'household'};
  const created = await createInvite(people.imran,ws,body,'identity-replay');
  expect(created).toMatchObject({...body,simulated:true,token:PRACTICE_TOKEN});
  expect(await createInvite(people.imran,ws,body,'identity-replay')).toEqual(created);
  expect(await listInvites(people.imran,ws)).toHaveLength(2);
  await revokeInvite(people.imran,ws,created.id);
  expect(await listInvites(people.imran,ws)).toContainEqual(expect.objectContaining({id:created.id,status:'revoked'}));
  await expect(createInvite(people.imran,ws,{email:'real@example.com',role:'staff'})).rejects.toMatchObject({status:422});
  await expect(createInvite(people.imran,ws,{...body,client_id:ids.harbor})).rejects.toMatchObject({status:404});
  for(const user of [people.sam,people.nabil,people.ravi,people.pranav]) {
    await expect(createInvite(user,ws,body)).rejects.toMatchObject({status:403});
    await expect(revokeInvite(user,ws,created.id)).rejects.toMatchObject({status:403});
  }
  await expect(revokeInvite(people.imran,second,created.id)).rejects.toMatchObject({status:404});
  expect(await identityCounts()).toEqual(before);
});
it.each(['imran','sam'])('the mocked AI add worker request for %s confirms to the Team practice result once', async persona => {
  ai.mockReset();
  ai.mockResolvedValueOnce({calls:[{id:'add-worker',name:'add_worker',args:{name:'Yusuf'}}]});
  const user=people[persona];
  const before=await identityCounts();
  const proposed=await assistant(user,ws,{messages:[{role:'user',content:'Add a worker called Yusuf'}]});
  expect(proposed).toMatchObject({available:true,pending_action:{tool:'add_worker',args:{name:'Yusuf',role:'technician'},summary:expect.stringContaining('Yusuf'),why:expect.stringContaining('Add a worker called Yusuf')}});
  expect(await identityCounts()).toEqual(before);
  const id=(proposed as any).pending_action.id;
  const team=await addFieldWorker(user,ws,{name:'Yusuf'});
  const result=await assistant(user,ws,{messages:[],confirm_action_id:id});
  expect(result).toMatchObject({logged:true,result:{structuredContent:{result:team}}});
  expect((result as any).reply).toBe(`${PRACTICE_NOTICE}\n\n${PRACTICE_CODE}\n\n[Sign in preview](${practiceJoinUrl})`);
  await expect(assistant(user,ws,{messages:[],confirm_action_id:id})).rejects.toMatchObject({status:409});
  expect(ai).toHaveBeenCalledTimes(1);
  expect(await identityCounts()).toEqual(before);
});
it('reset restores only the fixture preview in the replacement sandbox', async () => {
  const result=await resetDemo(people.imran,{confirm:true});
  const next=result.body.workspace_id;
  const admin=await withSystem(async db=>(await db.query("SELECT id FROM users WHERE demo_workspace_id=$1 AND demo_persona='imran'",[next])).rows[0].id);
  const invites=await listInvites(admin,next);
  expect(invites).toHaveLength(1);
  expect(invites[0]).toMatchObject({email:'yusuf@harbor.example',status:'pending',simulated:true});
  ws=next;
});
