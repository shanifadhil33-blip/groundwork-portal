import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { setAuthResolverForTests } from '../lib/auth';
import { closePools, withSystem, withUser } from '../lib/db';
import { ids } from '../scripts/seed';
import { createWorkspace, deleteWorkspace } from '../lib/services/workspaces';
import { createClient, createSite } from '../lib/services/clients';
import { acceptInvite, createInvite, listInvites } from '../lib/services/invites';
import { hash } from '../lib/services/shared';
import { clientInviteShareText, clientInviteWhatsApp } from '../lib/ui/client-invites';
import { POST } from '../app/api/workspaces/[ws]/invites/route';
let ws:string,client:string,other:string,site:string,otherSite:string;
let actor=ids.imran as string;
const users:string[]=[];
const name='SIGN11 test company';
async function newUser(){
 const id=randomUUID(),email=`${id}@example.test`;users.push(id);
 await withSystem(db=>db.query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)',[id,'Invite recipient',email]));
 return {id,email};
}
beforeAll(async()=>{
 setAuthResolverForTests(async()=>actor);
 ws=(await createWorkspace(ids.imran,{name})).id;
 client=(await createClient(ids.imran,ws,{name:'First client'})).id;
 other=(await createClient(ids.imran,ws,{name:'Other client'})).id;
 site=(await createSite(ids.imran,ws,client,{name:'First site',address:'Road'})).id;
 otherSite=(await createSite(ids.imran,ws,other,{name:'Other site',address:'Road'})).id;
 await withSystem(async db=>{
  await db.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'technician')",[ws,ids.ravi]);
  await db.query("INSERT INTO members(workspace_id,user_id,role,client_id) VALUES($1,$2,'client',$3)",[ws,ids.pranav,client]);
 });
});
afterAll(async()=>{
 setAuthResolverForTests();
 if(ws){await deleteWorkspace(ids.imran,ws,{confirm_name:name});await withSystem(db=>db.query('DELETE FROM audit_log WHERE workspace_id=$1',[ws]));}
 await withSystem(db=>db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]));
 await closePools();
});
it('admin invites a household; acceptance preserves the client and existing request privacy',async()=>{
 const recipient=await newUser();
 actor=ids.imran;
 const response=await POST(new Request('http://localhost/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:recipient.email,role:'client',client_id:client,client_kind:'household'})}),{params:Promise.resolve({ws})});
 expect(response.status).toBe(201);
 const invite=await response.json();
 expect(invite.client_kind).toBe('household');
 expect(await listInvites(ids.imran,ws)).toContainEqual(expect.objectContaining({id:invite.id,client_name:'First client'}));
 await expect(acceptInvite(recipient.id,{token:invite.token})).resolves.toMatchObject({status:'accepted'});
 expect(await withUser(recipient.id,async db=>(await db.query('SELECT role,client_id,client_kind FROM members WHERE workspace_id=$1 AND user_id=$2',[ws,recipient.id])).rows)).toEqual([{role:'client',client_id:client,client_kind:'household'}]);
 // Give the recipient requests under both clients to prove both RLS restrictions independently.
 const mine=randomUUID(),foreign=randomUUID(),someoneElse=randomUUID();
 await withSystem(async db=>{
  for(const [id,c,s,creator] of [[mine,client,site,recipient.id],[foreign,other,otherSite,recipient.id],[someoneElse,client,site,ids.imran]]){
   await db.query('INSERT INTO work_orders(id,workspace_id,client_id,site_id,title,created_by) VALUES($1,$2,$3,$4,$5,$6)',[id,ws,c,s,'Invite privacy',creator]);
  }
 });
 expect(await withUser(recipient.id,async db=>(await db.query('SELECT id FROM work_orders WHERE workspace_id=$1',[ws])).rows)).toEqual([{id:mine}]);
});
it('technicians, clients and supervisors cannot create client invites',async()=>{
 await withSystem(db=>db.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'staff')",[ws,ids.sam]));
 for(const user of [ids.ravi,ids.pranav,ids.sam]){
  actor=user;
  const response=await POST(new Request('http://localhost/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'denied@example.test',role:'client',client_id:client,client_kind:'household'})}),{params:Promise.resolve({ws})});
  expect(response.status).toBe(403);
 }
});
it('an old invite without a kind accepts as manager',async()=>{
 const recipient=await newUser(),token=randomUUID()+randomUUID();
 await withSystem(db=>db.query("INSERT INTO invites(workspace_id,email,role,client_id,token_hash,expires_at) VALUES($1,$2,'client',$3,$4,now()+interval '1 day')",[ws,recipient.email,client,hash(token)]));
 await acceptInvite(recipient.id,{token});
 expect(await withUser(recipient.id,async db=>(await db.query('SELECT client_kind FROM members WHERE workspace_id=$1 AND user_id=$2',[ws,recipient.id])).rows[0].client_kind)).toBe('manager');
});
it('onboarding acceptance also preserves facility staff',async()=>{
 const recipient=await newUser();
 const invite=await createInvite(ids.imran,ws,{email:recipient.email,role:'client',client_id:client,client_kind:'office'});
 await withUser(recipient.id,db=>db.query('SELECT onboarding_accept_invite($1,false)',[hash(invite.token)]));
 expect(await withUser(recipient.id,async db=>(await db.query('SELECT client_kind FROM members WHERE workspace_id=$1 AND user_id=$2',[ws,recipient.id])).rows[0].client_kind)).toBe('office');
});
it('WhatsApp uses only phone digits and encoded text, with or without a phone',()=>{
 const link='https://example.test/invites/accept?token=a&b=c';
 const text=`Test Company invites you to Groundwork to raise and follow your requests: ${link}`;
 expect(clientInviteShareText('Test Company',link)).toBe(text);
 expect(clientInviteWhatsApp('+971 (50) 123 4567','Test Company',link)).toBe(`https://wa.me/971501234567?text=${encodeURIComponent(text)}`);
 expect(clientInviteWhatsApp('','Test Company',link)).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`);
});

it('migration rolls back and reapplies in a local transaction',async()=>{
 await withSystem(async db=>{
  await db.query('SAVEPOINT sign11_rollback');
  try {
   await db.query(readFileSync('db/rollbacks/rollback-0062_client_invite_kind.sql','utf8'));
   expect((await db.query("SELECT 1 FROM information_schema.columns WHERE table_name='invites' AND column_name='client_kind'")).rowCount).toBe(0);
   await db.query(readFileSync('db/migrations/0062_client_invite_kind.sql','utf8'));
   expect((await db.query("SELECT 1 FROM information_schema.columns WHERE table_name='invites' AND column_name='client_kind'")).rowCount).toBe(1);
  }finally{await db.query('ROLLBACK TO SAVEPOINT sign11_rollback');}
 });
});
