import { createClient,createSite } from '../lib/services/clients';
import { randomUUID } from 'node:crypto';
import { afterAll,expect,it,vi } from 'vitest';
vi.mock('../lib/ai',()=>({assistantTurn:vi.fn(),withFallback:vi.fn().mockResolvedValue(null),aiCallsToday:async()=>0}));
import { withUser,withSystem,closePools } from '../lib/db';
import { ids } from '../scripts/seed';
import { listContactNames,saveContactName } from '../lib/services/contact-names';
import { listMessages,sendMessage } from '../lib/services/messages';
import { createWorkOrder,listWorkOrders } from '../lib/services/work-orders';
import { getOnboarding,saveOnboarding,onboardingInvite } from '../lib/services/onboarding';
import { createWorkspace,patchWorkspace,me } from '../lib/services/workspaces';
import { setMemberRoles } from '../lib/services/members';
import { createInvite } from '../lib/services/invites';
import { addMoney,ownerOverview } from '../lib/services/owner-overview';
import { onboardingAssistant } from '../lib/services/onboarding-assistant';
import { assistant } from '../lib/services/assistant';
import { assistantTurn } from '../lib/ai';
import { callTool } from '../lib/agent/tools';
const ws=ids.ridgeline;
afterAll(closePools);
it('saved contact names work both ways and remain private to each viewer',async()=>{
 await saveContactName(ids.imran,ws,ids.pranav,{nickname:'Pranav at Harbor'});
 await saveContactName(ids.pranav,ws,ids.imran,{nickname:'Imran from Ridgeline'});
 expect((await listContactNames(ids.imran,ws)).find(p=>p.user_id===ids.pranav)).toMatchObject({name:'Pranav at Harbor',real_name:'Pranav'});
 expect((await listContactNames(ids.sam,ws)).find(p=>p.user_id===ids.pranav)).toMatchObject({name:'Pranav',nickname:null});
 expect((await listContactNames(ids.pranav,ws)).find(p=>p.user_id===ids.imran)?.name).toBe('Imran from Ridgeline');
 const sent=await sendMessage(ids.pranav,ws,{recipient_id:ids.imran,body:'Please check reception'});
 expect((await listMessages(ids.imran,ws,{conversation_id:sent.conversation_id})).data.at(-1)?.sender_name).toBe('Pranav at Harbor');
 await saveContactName(ids.imran,ws,ids.ravi,{nickname:'Ravi on site'});
 const jobs=await listWorkOrders(ids.imran,ws,new URLSearchParams(`assignee_id=${ids.ravi}`));expect(jobs.data.some(j=>j.assignee_name==='Ravi on site')).toBe(true);
 await saveContactName(ids.imran,ws,ids.pranav,{nickname:null});expect((await listContactNames(ids.imran,ws)).find(p=>p.user_id===ids.pranav)?.name).toBe('Pranav');
});
it('rejects empty or overlong saved names and people outside the company',async()=>{
 await expect(saveContactName(ids.imran,ws,ids.pranav,{nickname:' '})).rejects.toBeTruthy();await expect(saveContactName(ids.imran,ws,ids.pranav,{nickname:'a'.repeat(61)})).rejects.toBeTruthy();await expect(saveContactName(ids.imran,ws,ids.summitAdmin,{nickname:'Bilal'})).rejects.toMatchObject({status:404});
});
it('agent name suggestions save only after confirmation and reject a direct unconfirmed tool call',async()=>{
 vi.mocked(assistantTurn).mockResolvedValue({calls:[{name:'suggest_contact_name',args:{target_user_id:ids.pranav,nickname:'Pranav at Harbor'},id:'call'}]} as any);
 const proposed:any=await assistant(ids.imran,ws,{messages:[{role:'user',content:'I call Pranav Pranav at Harbor'}]});expect(proposed.pending_action.summary).toContain('Pranav at Harbor');expect((await listContactNames(ids.imran,ws)).find(p=>p.user_id===ids.pranav)?.name).toBe('Pranav');
 const raw=await callTool({user:ids.imran,ws,scope:'write',kind:'assistant'},'suggest_contact_name',{target_user_id:ids.pranav,nickname:'Pranav at Harbor'});expect(raw.isError).toBe(true);
 await expect(assistant(ids.sam,ws,{messages:[],confirm_action_id:proposed.pending_action.id})).rejects.toMatchObject({status:404});
 await assistant(ids.imran,ws,{messages:[],confirm_action_id:proposed.pending_action.id});expect((await listContactNames(ids.imran,ws)).find(p=>p.user_id===ids.pranav)?.name).toBe('Pranav at Harbor');
});
it('small company owners hold all working rights, two owners work, and size changes keep manual roles and jobs',async()=>{
 const company=await createWorkspace(ids.imran,{name:'Bilal Service Works',country:'AE',company_size:'small'});
 const client=await createClient(ids.imran,company.id,{name:'Bilal Office'}),site=await createSite(ids.imran,company.id,client.id,{name:'Reception',address:'Dubai'});const job=await createWorkOrder(ids.imran,company.id,{title:'Check tap',site_id:site.id,assignee_id:ids.imran});
 const membership=await withUser(ids.imran,async db=>(await db.query('SELECT * FROM members WHERE workspace_id=$1',[company.id])).rows[0]);expect(membership).toMatchObject({role:'admin',is_owner:true,extra_roles:['staff','technician']});
 await withSystem(db=>db.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'staff')",[company.id,ids.sam]));
 await setMemberRoles(ids.imran,company.id,ids.sam,{roles:['owner','technician']});expect((await me(ids.sam)).memberships.find(m=>m.workspace_id===company.id)?.is_owner).toBe(true);
 await patchWorkspace(ids.imran,company.id,{company_size:'big'});
 const owners=await withUser(ids.imran,async db=>(await db.query('SELECT user_id,extra_roles FROM members WHERE workspace_id=$1 ORDER BY user_id',[company.id])).rows);expect(owners.find(m=>m.user_id===ids.imran)?.extra_roles).toEqual([]);expect(owners.find(m=>m.user_id===ids.sam)?.extra_roles).toEqual(['technician']);
 await patchWorkspace(ids.imran,company.id,{company_size:'small'});expect((await me(ids.imran)).memberships.find(m=>m.workspace_id===company.id)?.extra_roles).toContain('technician');expect((await listWorkOrders(ids.imran,company.id,new URLSearchParams())).data).toEqual(expect.arrayContaining([expect.objectContaining({id:job.id,assignee_id:ids.imran})]));
 await expect(createWorkspace(ids.imran,{name:' bilal service works ',country:'AE'})).rejects.toMatchObject({status:409,code:'company_exists'});
});
it('company overview records money with the workspace currency and refuses non admins',async()=>{
 const before=await ownerOverview(ids.imran,ws);
 await addMoney(ids.imran,ws,{direction:'in',amount:850});await addMoney(ids.imran,ws,{direction:'out',amount:120});
 expect(await ownerOverview(ids.imran,ws)).toMatchObject({currency:'AED',money_in:(Number(before.money_in)+850).toFixed(2),money_out:(Number(before.money_out)+120).toFixed(2)});await expect(ownerOverview(ids.sam,ws)).rejects.toMatchObject({status:403});
});
it('setup saves each answer and resumes the next question without making a company early',async()=>{
 expect((await getOnboarding(ids.imran)).step).toBe('language');await saveOnboarding(ids.imran,{answers:{language:'en-IN'},advance:true});
 expect((await getOnboarding(ids.imran)).step).toBe('identity');await saveOnboarding(ids.imran,{answers:{identity:'new'},advance:true});
 await expect(saveOnboarding(ids.imran,{answers:{name:'Imran'},advance:true})).rejects.toMatchObject({status:422});await saveOnboarding(ids.imran,{answers:{name:'Imran',phone:'+971501234567'},advance:true});
 expect((await getOnboarding(ids.imran)).step).toBe('company');const before=(await me(ids.imran)).memberships.length;
 await saveOnboarding(ids.imran,{answers:{company_name:'Imran New Service'},advance:true});await saveOnboarding(ids.imran,{answers:{country:'AE'},advance:true});await saveOnboarding(ids.imran,{answers:{region:'Dubai'},advance:true});await saveOnboarding(ids.imran,{answers:{currency:'AED'},advance:true});await saveOnboarding(ids.imran,{answers:{company_size:'small'},advance:true});await saveOnboarding(ids.imran,{answers:{trades:['ac']},advance:true});await saveOnboarding(ids.imran,{answers:{working_days:[1,2,3,4,5]},advance:true});await saveOnboarding(ids.imran,{answers:{working_hours:{start:'08:00',end:'17:00'}},advance:true});expect((await me(ids.imran)).memberships.length).toBe(before);
 const done=await saveOnboarding(ids.imran,{answers:{},advance:true});expect(done.step).toBe('done');expect(done.completed_at).toBeTruthy();expect((await me(ids.imran)).memberships.length).toBe(before+1);
});
it('join handles a different invited email explicitly and keeps multiple companies',async()=>{
 const invitation=await createInvite(ids.imran,ws,{email:'bilal@example.test',role:'technician'});expect(await onboardingInvite(ids.summitAdmin,invitation.token)).toMatchObject({email:'bilal@example.test',mismatch:true});
 await saveOnboarding(ids.summitAdmin,{answers:{language:'en-IN'},advance:true});await saveOnboarding(ids.summitAdmin,{answers:{identity:'team'},advance:true});await saveOnboarding(ids.summitAdmin,{answers:{name:'Bilal',phone:'+971501234568'},advance:true});
 await expect(saveOnboarding(ids.summitAdmin,{answers:{invite_token:invitation.token},advance:true})).rejects.toMatchObject({code:'email_mismatch'});
 const accepted=await saveOnboarding(ids.summitAdmin,{answers:{invite_token:invitation.token,allow_different_email:true},advance:true});expect(accepted.answers.workspace_id).toBe(ws);expect((await me(ids.summitAdmin)).memberships.length).toBe(2);
});
it('setup Agent proposes answers without saving and confirmation is owned and single use',async()=>{
 vi.mocked(assistantTurn).mockResolvedValue({calls:[{name:'fill_onboarding',args:{answers:{company_name:'Imran Workshop'}},id:'call'}]} as any);
 const before=await getOnboarding(ids.sam),proposed:any=await onboardingAssistant(ids.sam,{message:'My company is Imran Workshop'});expect((await getOnboarding(ids.sam)).answers).toEqual(before.answers);expect(proposed.pending_action.summary).toContain('Imran Workshop');
 await expect(onboardingAssistant(ids.imran,{confirm_action_id:proposed.pending_action.id})).rejects.toMatchObject({status:404});await onboardingAssistant(ids.sam,{confirm_action_id:proposed.pending_action.id});expect((await getOnboarding(ids.sam)).answers.company_name).toBe('Imran Workshop');await expect(onboardingAssistant(ids.sam,{confirm_action_id:proposed.pending_action.id})).rejects.toMatchObject({status:409});
});

it('customer setup joins the invited customer company and never asks company creation questions',async()=>{
 const user=randomUUID();await withSystem(db=>db.query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)',[user,'Bilal','bilal.customer@example.test']));
 const client=await withUser(ids.imran,async db=>(await db.query('SELECT id FROM clients WHERE workspace_id=$1 LIMIT 1',[ws])).rows[0]);
 const invitation=await createInvite(ids.imran,ws,{email:'bilal.customer@example.test',role:'client',client_id:client.id});
 await saveOnboarding(user,{answers:{language:'en-IN'},advance:true});await saveOnboarding(user,{answers:{identity:'customer'},advance:true});const profile=await saveOnboarding(user,{answers:{name:'Bilal',phone:'+971501234569'},advance:true});expect(profile.step).toBe('invite');
 const done=await saveOnboarding(user,{answers:{invite_token:invitation.token},advance:true});expect(done.step).toBe('done');expect((await me(user)).memberships[0]).toMatchObject({role:'client',client_id:client.id});
});
it('a technician keeps both company memberships when another company invites him',async()=>{
 const company=await createWorkspace(ids.imran,{name:'Imran Workshop Two',country:'AE',company_size:'big'});await withSystem(db=>db.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'technician')",[company.id,ids.ravi]));
 expect((await me(ids.ravi)).memberships.filter(m=>m.role==='technician')).toHaveLength(2);
});
