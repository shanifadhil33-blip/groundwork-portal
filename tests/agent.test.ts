import { decideSuggestion } from '../lib/services/suggestions';
import { approvedClientRequest } from './request-fixtures';
import './fixtures';
import { afterAll,afterEach,beforeEach,expect,it,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closePools,withSystem,withUser } from '../lib/db';
import { setAuthResolverForTests } from '../lib/auth';
import { ids,orderId,siteId } from '../scripts/seed';
import { hash } from '../lib/services/shared';
import { createToken } from '../lib/services/tokens';
import { startDemo,cleanupDemo } from '../lib/services/demo';
import { getWorkOrder,createWorkOrder,createComment } from '../lib/services/work-orders';
import { tools } from '../lib/agent/tools';
import { assistantUnavailable } from '../lib/services/assistant';
import { resetCooldowns } from '../lib/ai';
import { listAudit,getAudit } from '../lib/services/audit';
import * as tokenRoute from '../app/api/workspaces/[ws]/tokens/route';
import * as revokeRoute from '../app/api/workspaces/[ws]/tokens/[id]/revoke/route';
import * as mcp from '../app/api/mcp/route';
import * as assistantRoute from '../app/api/workspaces/[ws]/assistant/route';
let user:string=ids.sam;
beforeEach(()=>{user=ids.sam;setAuthResolverForTests(async()=>user);vi.stubEnv('GEMINI_API_KEY','fictional-key');vi.stubEnv('GROQ_API_KEY','fictional-backup');vi.stubEnv('AI_GEMINI_MODELS','gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash-lite');vi.stubEnv('AI_GROQ_MODELS','openai/gpt-oss-120b');resetCooldowns();});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();setAuthResolverForTests();});
afterAll(closePools);
async function route(handler:any,body?:unknown,params:Record<string,string>={},method='POST',suffix=''){
 const r=await handler(new Request('http://localhost/api'+suffix,{method,...(body===undefined?{}:{body:JSON.stringify(body)})}),{params:Promise.resolve({ws:ids.ridgeline,...params})});return {status:r.status,body:await r.json()};
}
async function rpc(token:string|undefined,method:string,params:unknown={},verb='POST'){
 const r=await mcp[verb as 'POST'](new Request('http://localhost/api/mcp',{method:verb,headers:{Accept:'application/json, text/event-stream','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(verb==='POST'?{body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}:{})}));
 const text=await r.text();return {status:r.status,headers:r.headers,body:text?JSON.parse(text):null};
}
async function mint(who:string=ids.sam,scope:'read'|'write'='write'){return createToken(who,ids.ridgeline,{name:'Agent test',scope});}
async function tool(token:string,name:string,args:unknown={}){const r=await rpc(token,'tools/call',{name,arguments:args});expect(r.status).toBe(200);return r.body.result;}
const gemini=(parts:unknown[])=>Response.json({candidates:[{content:{parts}}]});
function writeMock(name:string,args:unknown){vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>gemini([{functionCall:{name,args}}])));}
async function pending(name='create_request',args:unknown={title:'Assistant request',site_id:siteId(1)}){writeMock(name,args);const r=await route(assistantRoute.POST,{messages:[{role:'user',content:'Make the change'}]});expect(r.status).toBe(200);return r.body.pending_action;}
async function confirm(id:string){return route(assistantRoute.POST,{messages:[],confirm_action_id:id});}
const count=()=>withUser(ids.sam,async db=>(await db.query('SELECT count(*)::int AS n FROM work_orders WHERE workspace_id=$1',[ids.ridgeline])).rows[0].n);
it('token creation returns plaintext once, hash-only DB storage, and safe own/admin lists',async()=>{
 const r=await route(tokenRoute.POST,{name:'Once only',scope:'write'});expect(r.status).toBe(201);expect(r.body.token).toMatch(/^gw_[\w-]{43}$/);expect(r.body.token_hash).toBeUndefined();
 const stored=await withUser(user,async db=>(await db.query('SELECT * FROM api_tokens WHERE id=$1',[r.body.id])).rows[0]);expect(stored.token_hash).toBe(hash(r.body.token));expect(JSON.stringify(stored)).not.toContain(r.body.token);
 const own=await route(tokenRoute.GET,undefined,{},'GET');expect(JSON.stringify(own.body)).not.toMatch(/token_hash|gw_[\w-]{43}/);expect(own.body.every((t:any)=>t.user_id===user)).toBe(true);
 user=ids.pranav;expect((await route(tokenRoute.GET,undefined,{},'GET','?all=true')).body.some((t:any)=>t.id===r.body.id)).toBe(false);
 user=ids.imran;expect((await route(tokenRoute.GET,undefined,{},'GET','?all=true')).body.some((t:any)=>t.id===r.body.id)).toBe(true);
});
it('tokens cannot mint tokens without a session',async()=>{const t=await mint();setAuthResolverForTests();const r=await tokenRoute.POST(new Request('http://localhost',{method:'POST',headers:{Authorization:'Bearer '+t.token},body:JSON.stringify({name:'No',scope:'write'})}),{params:Promise.resolve({ws:ids.ridgeline})});expect(r.status).toBe(401);});
it('revocation owner/admin only and idempotent; revoked MCP auth is plain 401',async()=>{
 const t=await mint();user=ids.pranav;expect((await route(revokeRoute.POST,undefined,{id:t.id})).status).toBe(404);
 user=ids.imran;const a=await route(revokeRoute.POST,undefined,{id:t.id}),b=await route(revokeRoute.POST,undefined,{id:t.id});expect(a.status).toBe(200);expect(b.body.revoked_at).toBe(a.body.revoked_at);
 const r=await rpc(t.token,'tools/list');expect(r.status).toBe(401);expect(r.headers.get('www-authenticate')).toBe('Bearer');expect(r.body.error.message).toBe('Invalid or expired token.');
});
it.each(['missing','bad','expired','removed'])('MCP rejects %s tokens',async kind=>{
 let token:string|undefined;
 if(kind==='bad')token='gw_'+'x'.repeat(43);
 if(kind==='expired'){const t=await mint();token=t.token;await withSystem(db=>db.query("UPDATE api_tokens SET expires_at=now()-interval '1 second' WHERE id=$1",[t.id]));}
 if(kind==='removed'){
  const uid=randomUUID();await withSystem(async db=>{await db.query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)',[uid,'Temporary','temporary-agent@example.test']);await db.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'staff')",[ids.ridgeline,uid]);});
  const t=await mint(uid);token=t.token;await withSystem(db=>db.query('DELETE FROM members WHERE user_id=$1',[uid]));
 }
 expect((await rpc(token,'initialize')).status).toBe(401);
});
it('demo tokens cap to deadline and cleanup removes tokens and actions',async()=>{
 const demo=await startDemo({persona:'sam'},'agent-test');const ws=demo.body.workspace_id;
 const uid=await withSystem(async db=>(await db.query("SELECT id FROM users WHERE demo_workspace_id=$1 AND demo_persona='sam'",[ws])).rows[0].id);
 const t=await createToken(uid,ws,{name:'Demo',scope:'write',expires_in_days:365});expect(new Date(t.expires_at).getTime()).toBeLessThanOrEqual(new Date(demo.body.expires_at).getTime());expect(new Date(t.expires_at).getTime()).toBeLessThanOrEqual(Date.now()+86400000);
 await withUser(uid,db=>db.query("INSERT INTO assistant_actions(workspace_id,user_id,tool,args) VALUES($1,$2,'create_request','{}')",[ws,uid]));
 await withSystem(db=>db.query("UPDATE workspaces SET demo_expires_at=now()-interval '1 second' WHERE id=$1",[ws]));expect((await rpc(t.token,'tools/list')).status).toBe(401);await cleanupDemo();
 expect(await withSystem(async db=>(await db.query('SELECT id FROM api_tokens WHERE id=$1',[t.id])).rows)).toHaveLength(0);
});
it('real HTTP MCP initialize and tool discovery use official stateless transport',async()=>{
 const t=await mint();const r=await rpc(t.token,'initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}});expect(r.body.result.serverInfo).toEqual({name:'groundwork',version:'0.1.0'});expect(r.headers.get('mcp-session-id')).toBeNull();
 const list=await rpc(t.token,'tools/list');expect(list.body.result.tools.map((t:any)=>t.name).sort()).toEqual(Object.keys(tools).sort());
 expect((await rpc(t.token,'',{},'GET')).status).toBe(200);expect((await rpc(t.token,'',{},'DELETE')).status).toBe(200);
});
it('Pranav MCP cannot see Northgate/Summit/internal comments or approval queue and cannot change status',async()=>{
 const t=await mint(ids.pranav);const r=await tool(t.token,'list_work_orders',{pageSize:100});expect(r.structuredContent.result.data.every((o:any)=>o.client_id===ids.harbor)).toBe(true);
 const orders=r.structuredContent.result.data;const own=orders[0];const detail=await tool(t.token,'get_work_order',{id:own.id});expect(detail.structuredContent.result.comments.every((c:any)=>c.visibility==='client')).toBe(true);
 const hidden=await withUser(ids.sam,async db=>(await db.query('SELECT id FROM work_orders WHERE client_id=$1 LIMIT 1',[ids.northgate])).rows[0].id);
 for(const id of [hidden,orderId(61)])expect((await tool(t.token,'get_work_order',{id})).isError).toBe(true);
 expect((await tool(t.token,'list_approval_queue')).isError).toBe(true);
 expect((await tool(t.token,'update_work_order_status',{id:own.id,status:'scheduled',updated_at:own.updated_at})).content[0].text).toBe("You can raise and follow your own requests here. Ask your service company for anything else.");
 expect((await tool(t.token,'list_sites')).structuredContent.result.every((s:any)=>s.client_id===ids.harbor)).toBe(true);
});
it.each(Object.entries(tools).filter(([,t])=>t.write).map(([name])=>name))('read token rejects %s before mutation',async name=>{
 const t=await mint(ids.sam,'read');const before=await count();const r=await tool(t.token,name,{});expect(r.isError).toBe(true);expect(r.content[0].text).toBe('This token allows viewing only.');expect(await count()).toBe(before);
});
it('staff write tools work, preserve optimistic concurrency, and expose agent audit id/name',async()=>{
 const t=await mint();const created=await tool(t.token,'create_request',{title:'MCP creation',site_id:siteId(1)});const o=created.structuredContent.result;expect(o.id).toBeTruthy();
 const changed=await tool(t.token,'update_work_order_status',{id:o.id,status:'scheduled',updated_at:o.updated_at});expect(changed.structuredContent.result.status).toBe('scheduled');expect((await tool(t.token,'update_work_order_status',{id:o.id,status:'scheduled',updated_at:o.updated_at})).isError).toBe(true);
 expect((await tool(t.token,'add_comment',{work_order_id:o.id,body:'Agent note',visibility:'internal'})).isError).toBeUndefined();
 const audit=await listAudit(ids.sam,ids.ridgeline,new URLSearchParams({entity_id:o.id}));expect(audit.data.every(a=>a.actor_kind==='agent'&&a.via_token_id===t.id&&a.via_token_name===t.name)).toBe(true);expect((await getAudit(ids.sam,ids.ridgeline,audit.data[0].id)).actor_kind).toBe('agent');
 const session=await createWorkOrder(ids.sam,ids.ridgeline,{title:'Session creation',site_id:siteId(1)});expect((await listAudit(ids.sam,ids.ridgeline,new URLSearchParams({entity_id:session.id}))).data[0].actor_kind).toBe('user');
});
it('staff approve and reject tools use existing queue services and audit agent attribution',async()=>{
 const t=await mint();const rows=await withSystem(async db=>{const imp=(await db.query("INSERT INTO imports(workspace_id,filename,row_count,created_by) VALUES($1,'agent.csv',2,$2) RETURNING id",[ids.ridgeline,ids.sam])).rows[0];const out=[];for(let i=1;i<=2;i++)out.push((await db.query("INSERT INTO import_rows(workspace_id,import_id,row_number,data,queued) VALUES($1,$2,$3,$4,true) RETURNING id",[ids.ridgeline,imp.id,i,JSON.stringify({title:'Agent queue '+i,site:'Marina',client:'Harbor & Pine Coworking',priority:'normal'})])).rows[0]);return out;});
 const site=await withUser(ids.sam,async db=>(await db.query('SELECT name FROM sites WHERE id=$1',[siteId(1)])).rows[0].name);
 const approve=await tool(t.token,'approve_queue_row',{row_id:rows[0].id,edits:{site}});expect(approve.isError).toBeUndefined();
 const reject=await tool(t.token,'reject_queue_row',{row_id:rows[1].id,reason:'Duplicate'});expect(reject.structuredContent.result.decision).toBe('rejected');
 for(const r of rows)expect((await listAudit(ids.sam,ids.ridgeline,new URLSearchParams({entity_id:r.id}))).data.some(a=>a.actor_kind==='agent'&&a.via_token_id===t.id)).toBe(true);
});
it('token follows a changed membership role and client immediately',async()=>{const t=await mint(ids.omar);await withSystem(db=>db.query("UPDATE members SET client_id=$2 WHERE user_id=$1",[ids.omar,ids.harbor]));const r=await tool(t.token,'list_work_orders');expect(r.structuredContent.result.data.every((o:any)=>o.client_id===ids.harbor)).toBe(true);await withSystem(db=>db.query('UPDATE members SET client_id=$2 WHERE user_id=$1',[ids.omar,ids.northgate]));});
it('assistant runs a read function then returns mocked Gemini reply',async()=>{const mock=vi.fn().mockImplementationOnce(async()=>gemini([{functionCall:{name:'get_dashboard',args:{}}}])).mockImplementationOnce(async()=>gemini([{text:'Your dashboard is ready.'}]));vi.stubGlobal('fetch',mock);const r=await route(assistantRoute.POST,{messages:[{role:'user',content:'Show my dashboard'}]});expect(r.body.reply).toBe('Your dashboard is ready.');expect(mock).toHaveBeenCalledTimes(2);expect(JSON.parse(mock.mock.calls[1][1].body).contents.some((c:any)=>JSON.stringify(c).includes('by_status'))).toBe(true);});
it('assistant write proposal changes nothing; provider-free confirm writes once and audits assistant',async()=>{const before=await count(),p=await pending();expect(await count()).toBe(before);expect(p.tool).toBe('create_request');vi.stubEnv('GEMINI_API_KEY','');vi.stubEnv('GROQ_API_KEY','');const r=await confirm(p.id);expect(r.status).toBe(200);expect(await count()).toBe(before+1);const o=r.body.result.structuredContent.result;expect((await listAudit(ids.sam,ids.ridgeline,new URLSearchParams({entity_id:o.id}))).data[0].actor_kind).toBe('assistant');expect((await confirm(p.id)).status).toBe(409);expect(await count()).toBe(before+1);});
it('concurrent assistant confirms execute exactly once',async()=>{const before=await count(),p=await pending('create_request',{title:'Concurrent assistant',site_id:siteId(1)});const results=await Promise.all([confirm(p.id),confirm(p.id)]);expect(results.map(r=>r.status).sort()).toEqual([200,409]);expect(await count()).toBe(before+1);});
it('other-user, other-workspace, and expired pending actions fail plainly',async()=>{const p=await pending();user=ids.imran;expect((await confirm(p.id)).status).toBe(404);user=ids.sam;expect((await route(assistantRoute.POST,{messages:[],confirm_action_id:p.id},{ws:ids.summit})).status).toBe(404);await withSystem(db=>db.query("UPDATE assistant_actions SET expires_at=now()-interval '1 second' WHERE id=$1",[p.id]));expect((await confirm(p.id)).status).toBe(409);});
it('client assistant staff-only status call is forbidden on confirm',async()=>{user=ids.pranav;const o=await approvedClientRequest(user,ids.ridgeline,{title:'Client assistant',site_id:siteId(1)});const p=await pending('update_work_order_status',{id:o.id,status:'scheduled',updated_at:o.updated_at.toISOString()});const r=await confirm(p.id);expect(r.body.result.isError).toBe(true);expect(r.body.reply).toBe("You can raise and follow your own requests here. Ask your service company for anything else.");expect((await getWorkOrder(user,ids.ridgeline,o.id)).status).toBe('open');});
it('Gemini failures fall through to Groq function calling',async()=>{const mock=vi.fn().mockImplementation(async(url:string)=>url.includes('googleapis')?new Response('PRIVATE',{status:429}):Response.json({choices:[{message:{tool_calls:[{id:'1',function:{name:'create_request',arguments:JSON.stringify({title:'Groq request',site_id:siteId(1)})}}]}}]}));vi.stubGlobal('fetch',mock);const r=await route(assistantRoute.POST,{messages:[{role:'user',content:'Create'}]});expect(r.body.pending_action.tool).toBe('create_request');expect(mock).toHaveBeenCalledTimes(2);});
it.each(['no keys','all fail'])('assistant gracefully unavailable: %s',async mode=>{if(mode==='no keys'){vi.stubEnv('GEMINI_API_KEY','');vi.stubEnv('GROQ_API_KEY','');}vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>new Response('PRIVATE PROVIDER TEXT',{status:503})));const r=await route(assistantRoute.POST,{messages:[{role:'user',content:'Help'}]});expect(r.status).toBe(200);expect(r.body).toEqual(assistantUnavailable);});
it('assistant bounds repeated read tool calls',async()=>{writeMock('whoami',{});const r=await route(assistantRoute.POST,{messages:[{role:'user',content:'Help'}]});expect(r.body.reply).toContain('limit for workspace actions');expect(fetch).toHaveBeenCalledTimes(10);});
it('assistant accepts a real demo session and confirms a proposal in its sandbox',async()=>{
 const demo=await startDemo({persona:'sam'},'assistant-demo');setAuthResolverForTests();
 const ws=demo.body.workspace_id,site=await withSystem(async db=>(await db.query('SELECT id FROM sites WHERE workspace_id=$1 LIMIT 1',[ws])).rows[0].id);
 writeMock('create_request',{title:'Demo assistant',site_id:site});
 const invoke=async(body:unknown)=>{const r=await assistantRoute.POST(new Request('http://localhost/api',{method:'POST',headers:{cookie:demo.cookie},body:JSON.stringify(body)}),{params:Promise.resolve({ws})});expect(r.status).toBe(200);return r.json();};
 const p=await invoke({messages:[{role:'user',content:'Create a request'}]});expect(p.pending_action).toBeTruthy();
 const result=await invoke({messages:[],confirm_action_id:p.pending_action.id});expect(result.result.structuredContent.result.workspace_id).toBe(ws);
});
it('token audit storage and output contain no plaintext or token hashes',async()=>{
 const t=await mint();const stored=await withSystem(async db=>(await db.query('SELECT "before","after" FROM audit_log WHERE entity_id=$1',[t.id])).rows);
 expect(JSON.stringify(stored)).not.toContain(t.token);expect(JSON.stringify(stored)).not.toContain(hash(t.token));
 const audit=await listAudit(ids.sam,ids.ridgeline,new URLSearchParams({entity_id:t.id}));expect(JSON.stringify(audit)).not.toContain(hash(t.token));
});
it('tool validation and unknown tool errors are plain API messages',async()=>{const t=await mint();const r=await tool(t.token,'create_request',{});expect(r.isError).toBe(true);expect(r.content[0].text).toBe('Check the highlighted fields and try again.');const unknown=await tool(t.token,'not_a_tool');expect(unknown.content[0].text).toBe('Unknown tool.');});
it('client write token creates only own requests and client-visible comments',async()=>{
 const t=await mint(ids.pranav);const r=await tool(t.token,'create_request',{title:'Pranav agent request',site_id:siteId(1)});expect(r.structuredContent.result.client_id).toBe(ids.harbor);expect(r.structuredContent.result.source).toBe('client');
 const accepted=await decideSuggestion(ids.sam,ids.ridgeline,r.structuredContent.result.id,{decision:'approved'});const id=accepted.work_order_id;expect((await tool(t.token,'add_comment',{work_order_id:id,body:'Client agent comment',visibility:'client'})).isError).toBeUndefined();expect((await tool(t.token,'add_comment',{work_order_id:id,body:'Hidden',visibility:'internal'})).isError).toBe(true);
 const site=await withUser(ids.sam,async db=>(await db.query('SELECT id FROM sites WHERE client_id=$1 LIMIT 1',[ids.northgate])).rows[0].id);expect((await tool(t.token,'create_request',{title:'No access',site_id:site})).isError).toBe(true);
});
it('pending action RLS hides other owners and cross-workspace actions',async()=>{
 const p=await pending();expect(await withUser(ids.pranav,async db=>(await db.query('SELECT id FROM assistant_actions WHERE id=$1',[p.id])).rows)).toHaveLength(0);
 expect(await withUser(ids.summitAdmin,async db=>(await db.query('SELECT id FROM assistant_actions WHERE id=$1',[p.id])).rows)).toHaveLength(0);
});
it('token expiry/name/scope validation returns 422 without issuing capabilities',async()=>{
 for(const body of [{name:'',scope:'read'},{name:'x'.repeat(81),scope:'write'},{name:'Bad',scope:'admin'},{name:'Bad',scope:'write',expires_in_days:0}])expect((await route(tokenRoute.POST,body)).status).toBe(422);
});
it('authentication bookkeeping carries token attribution and restores caller transaction context',async()=>{
 const t=await mint();await withUser(ids.imran,async db=>{
  await db.query('SELECT * FROM verify_api_token($1)',[hash(t.token)]);
  const setting=(await db.query("SELECT app_user_id() AS user_id,current_setting('app.actor_kind',true) AS kind,current_setting('app.via_token',true) AS token")).rows[0];expect(setting).toEqual({user_id:ids.imran,kind:'user',token:''});
 });
 const audit=await listAudit(ids.sam,ids.ridgeline,new URLSearchParams({entity_id:t.id}));expect(audit.data.some(a=>a.action==='update'&&a.actor_kind==='agent'&&a.actor?.id===ids.sam&&a.via_token_id===t.id)).toBe(true);
 const before=audit.total;await rpc(t.token,'tools/list');expect((await listAudit(ids.sam,ids.ridgeline,new URLSearchParams({entity_id:t.id}))).total).toBe(before);
});

it('number lookup leads directly to a saved team note, logged in the decision log, with no card',async()=>{
 const mock=vi.fn().mockImplementationOnce(async()=>gemini([{functionCall:{name:'get_work_order_by_number',args:{number:55}}}])).mockImplementationOnce(async()=>gemini([{functionCall:{name:'add_comment',args:{work_order_id:orderId(55),body:'Technician confirmed',visibility:'client'}}}])).mockImplementationOnce(async()=>gemini([{text:'Done, Sam. I saved the note on WO-55.'}]));
 vi.stubGlobal('fetch',mock);
 const before=await withUser(ids.sam,async db=>(await db.query("SELECT count(*)::int AS n FROM comments WHERE work_order_id=$1 AND visibility='internal'",[orderId(55)])).rows[0].n);
 const r=await route(assistantRoute.POST,{messages:[{role:'user',content:"add a comment 'Technician confirmed' to work order 55"}]});
 expect(r.body.pending_action).toBeUndefined();expect(r.body.reply).toMatch(/^Done, Sam\. /);expect(r.body.logged).toBe(true);expect(mock).toHaveBeenCalledTimes(2);
 expect(await withUser(ids.sam,async db=>(await db.query("SELECT count(*)::int AS n FROM comments WHERE work_order_id=$1 AND visibility='internal'",[orderId(55)])).rows[0].n)).toBe(before+1);
 expect(await withSystem(async db=>(await db.query("SELECT count(*)::int AS n FROM assistant_actions WHERE tool='add_comment' AND outcome='done' AND args->>'work_order_id'=$1",[orderId(55)])).rows[0].n)).toBeGreaterThan(0);
});
it('number lookup respects client and workspace isolation',async()=>{
 const token=await mint(ids.pranav);
 expect((await tool(token.token,'get_work_order_by_number',{number:1})).structuredContent.result.id).toBe(orderId(1));
 expect((await tool(token.token,'get_work_order_by_number',{number:1})).structuredContent.result.id).not.toBe(orderId(61));
 for(const number of [4,88888,99999])expect((await tool(token.token,'get_work_order_by_number',{number})).isError).toBe(true);
});
it('staff client-visible replies notify the client requester once on replay, internal notes do not',async()=>{
 const order=await approvedClientRequest(ids.pranav,ids.ridgeline,{title:'Requester notification',site_id:siteId(1)});
 await createComment(ids.sam,ids.ridgeline,order.id,{body:'Internal',visibility:'internal'});
 const body={body:'Technician confirmed',visibility:'client'};
 await createComment(ids.sam,ids.ridgeline,order.id,body,'comment-replay');
 await createComment(ids.sam,ids.ridgeline,order.id,body,'comment-replay');
 const rows=await withUser(ids.pranav,async db=>(await db.query("SELECT kind FROM notifications WHERE entity_id=$1 AND kind='comment_added'",[order.id])).rows);
 expect(rows).toEqual([{kind:'comment_added'}]);
});
it('priority changes respect staff permissions, client restrictions and stale versions',async()=>{
 const t=await mint(ids.sam,'write'),order=await getWorkOrder(ids.sam,ids.ridgeline,orderId(58));
 const changed=await tool(t.token,'set_priority',{id:order.id,priority:'urgent',updated_at:order.updated_at.toISOString()});expect(changed.isError).toBeUndefined();expect(changed.structuredContent.result.priority).toBe('urgent');
 expect((await tool(t.token,'set_priority',{id:order.id,priority:'low',updated_at:order.updated_at.toISOString()})).isError).toBe(true);
 const client=await mint(ids.pranav,'write'),own=await getWorkOrder(ids.pranav,ids.ridgeline,orderId(1));expect((await tool(client.token,'set_priority',{id:own.id,priority:'urgent',updated_at:own.updated_at.toISOString()})).isError).toBe(true);
});

it('approval mode every queues Connect AI key writes for an admin', async () => {
 const { listKeyApprovals, decideKeyApproval } = await import('../lib/services/key-approvals');
 await withSystem(db=>db.query("UPDATE workspaces SET approval_mode='every' WHERE id=$1",[ids.ridgeline]));
 try {
  const t=await mint();const before=await count();
  const r=await tool(t.token,'create_request',{title:'Key asks first',site_id:siteId(1)});
  expect(r.structuredContent.result.status).toBe('waiting_for_approval');expect(await count()).toBe(before);
  const id=r.structuredContent.result.approval_id;
  await expect(listKeyApprovals(ids.sam,ids.ridgeline)).rejects.toThrow();
  await expect(decideKeyApproval(ids.sam,ids.ridgeline,id,{approve:true})).rejects.toThrow();
  expect((await listKeyApprovals(ids.imran,ids.ridgeline)).some((a:any)=>a.id===id)).toBe(true);
  expect(await decideKeyApproval(ids.imran,ids.ridgeline,id,{approve:true})).toEqual({done:true});
  expect(await count()).toBe(before+1);
  await expect(decideKeyApproval(ids.imran,ids.ridgeline,id,{approve:true})).rejects.toThrow(/already/);
  const r2=await tool(t.token,'create_request',{title:'Key declined',site_id:siteId(1)});
  expect(await decideKeyApproval(ids.imran,ids.ridgeline,r2.structuredContent.result.approval_id,{approve:false})).toEqual({declined:true});
  expect(await count()).toBe(before+1);
 } finally { await withSystem(db=>db.query("UPDATE workspaces SET approval_mode='important' WHERE id=$1",[ids.ridgeline])); }
});
