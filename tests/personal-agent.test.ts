import { afterAll,expect,it,vi } from 'vitest';
import { closePools,withUser } from '../lib/db';
import { ids } from '../scripts/seed';
import { getPreferences,patchPreferences } from '../lib/services/settings';
import { listDecisions,undoDecision } from '../lib/services/agent-log';
import { listAgentLearning,savePersonalLearning,saveCompanyRule } from '../lib/services/agent-learning';
import { assistant } from '../lib/services/assistant';
import { assistantTurn } from '../lib/ai';
import { callTool } from '../lib/agent/tools';
import { createToken } from '../lib/services/tokens';
import { listKeyApprovals,decideKeyApproval } from '../lib/services/key-approvals';
import { listThreads,listMessages } from '../lib/services/messages';
vi.mock('../lib/ai',async original=>({...await original<typeof import('../lib/ai')>(),assistantTurn:vi.fn()}));
afterAll(closePools);
const ws=ids.ridgeline;
it('renaming one Agent changes only that user name voice and language',async()=>{
 const admin=await getPreferences(ids.imran);await patchPreferences(ids.ravi,{agent_name:'Farid',voice_enabled:false,language:'hi'});
 expect(await getPreferences(ids.ravi)).toMatchObject({agent_name:'Farid',voice_enabled:false,language:'hi'});
 expect(await getPreferences(ids.imran)).toMatchObject({agent_name:admin.agent_name,voice_enabled:admin.voice_enabled,language:admin.language});
 expect((await withUser(ids.imran,db=>db.query('SELECT agent_name FROM user_preferences WHERE user_id=$1',[ids.ravi]))).rowCount).toBe(0);
});
it('no other user including an admin can read a technician private Agent action or log',async()=>{
 const action=await withUser(ids.ravi,async db=>(await db.query("INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why,consumed_at,outcome) VALUES($1,$2,'add_comment',$3,'Private chat note','Personal reason',now(),'done') RETURNING id",[ws,ids.ravi,JSON.stringify({chat:'Only Ravi can read this conversation'})])).rows[0]);
 expect((await listDecisions(ids.ravi,ws)).some(a=>a.id===action.id)).toBe(true);
 for(const user of [ids.imran,ids.sam,ids.pranav]){
  expect((await withUser(user,db=>db.query('SELECT args FROM assistant_actions WHERE id=$1',[action.id]))).rowCount).toBe(0);
  expect((await listDecisions(user,ws)).some(a=>a.id===action.id)).toBe(false);
 }
 await expect(undoDecision(ids.imran,ws,action.id)).rejects.toMatchObject({status:404});
 const {setAuthResolverForTests}=await import('../lib/auth');const {GET}=await import('../app/api/workspaces/[ws]/assistant/log/route');setAuthResolverForTests(async()=>ids.imran);
 try{const response=await GET(new Request('http://local'),{params:Promise.resolve({ws})});expect(JSON.stringify(await response.json())).not.toContain('Private chat note');}finally{setAuthResolverForTests();}
});
it('personal learning is private and shared learning is labelled Company rule',async()=>{
 const personal=await savePersonalLearning(ids.ravi,ws,{body:'I prefer short answers'});await savePersonalLearning(ids.sam,ws,{body:'Sam private preference'});
 const rule=await saveCompanyRule(ids.imran,ws,{body:'Call reception before a visit'});
 const mine=await listAgentLearning(ids.ravi,ws);expect(mine.data.find(m=>m.id===rule.id)).toMatchObject({scope:'company_rule',label:'Company rule'});expect(mine.data.some(m=>m.id===personal.id)).toBe(true);expect(mine.data.some(m=>m.body==='Sam private preference')).toBe(false);
 expect((await listAgentLearning(ids.imran,ws)).data.some(m=>m.id===personal.id)).toBe(false);
 expect((await withUser(ids.imran,db=>db.query('SELECT body FROM personal_agent_learning WHERE user_id=$1',[ids.ravi]))).rowCount).toBe(0);
 await expect(saveCompanyRule(ids.ravi,ws,{body:'Wrong permission'})).rejects.toMatchObject({status:403});
 expect((await listAgentLearning(ids.pranav,ws)).data.some(m=>m.scope==='company_rule')).toBe(false);
});
it('Agent prompt contains only this person learning and labelled company rules',async()=>{
 vi.mocked(assistantTurn).mockResolvedValue({calls:[],text:'Hello Ravi'} as any);
 await assistant(ids.ravi,ws,{messages:[{role:'user',content:'Hello'}]});const context=vi.mocked(assistantTurn).mock.calls.at(-1)![2];
 expect(context).toContain('Farid');expect(context).toContain('I prefer short answers');expect(context).toContain('Company rule');expect(context).not.toContain('Sam private preference');
});
it('company approval proposals stay separate from private logs and hide private message text',async()=>{
 await withUser(ids.imran,db=>db.query("UPDATE workspaces SET approval_mode='every' WHERE id=$1",[ws]));
 try{const key=await createToken(ids.sam,ws,{name:'Sam test key',scope:'write'});
 const proposed=await callTool({user:ids.sam,ws,scope:'write',kind:'agent',tokenId:key.id},'send_message',{recipient_id:ids.pranav,body:'Private message for Pranav'});const id=(proposed.structuredContent as any).result.approval_id;
 expect(id).toBeTruthy();const approvals=await listKeyApprovals(ids.imran,ws);expect(approvals.find(a=>a.id===id)?.summary).toBe('Send a private message');
 await expect(withUser(ids.imran,db=>db.query('SELECT args FROM company_action_approvals WHERE id=$1',[id]))).rejects.toMatchObject({code:'42501'});
 await decideKeyApproval(ids.imran,ws,id,{approve:true});
 expect((await listDecisions(ids.imran,ws)).some(a=>a.id===id)).toBe(false);expect((await listDecisions(ids.sam,ws)).some(a=>a.id===id)).toBe(true);
 const thread=(await listThreads(ids.pranav,ws)).data.find(t=>t.kind==='direct');expect((await listMessages(ids.pranav,ws,{conversation_id:thread.id})).data.some(m=>m.body==='Private message for Pranav')).toBe(true);
 }finally{await withUser(ids.imran,db=>db.query("UPDATE workspaces SET approval_mode='important' WHERE id=$1",[ws]));}
});
