import { explicitClientComment } from '../ui/comments';
import { z } from 'zod';
import { actionSummary,actionResult,plainAssistantReply,audienceStatusReply,recordResult,recordSummary,recordTools } from '../ui/assistant-replies';
import { asAgent } from '../db';
import { assistantTurn,type AssistantMessage } from '../ai';
import { ApiError,missing } from '../http';
import { inWorkspace,uuid } from './shared';
import { getWorkOrder } from './work-orders';
import { tools,callTool,type AgentContext } from '../agent/tools';
import { jobSnapshot,recordSnapshot,whyNote } from './agent-log';
import { contractNote,contractUse } from './payments';
/** The client or site a record write touches: its name for the card, and the current values to show what changes. */
/** The record a client or site tool acts on, with the country its labels and formats follow. */
const teamTools=['assign_work_order','set_job_trade','set_worker_skills','add_worker'];
/** The person a team action is about, by name, for the confirmation card. */
async function personLabel(x:{db:{query:(q:string,v:unknown[])=>Promise<{rows:any[]}>}},ws:string,tool:string,args:any):Promise<string|undefined>{
 if(tool==='add_worker')return String(args.name??'');
 const id=tool==='assign_work_order'?args.assignee_id:tool==='set_worker_skills'?args.user_id:null;
 if(!id)return tool==='assign_work_order'?'nobody':undefined;
 return (await x.db.query('SELECT u.name FROM members m LEFT JOIN LATERAL visible_user(m.user_id) u ON true WHERE m.workspace_id=$1 AND m.user_id=$2',[ws,id])).rows[0]?.name??'Team member';
}
async function recordTarget(x:{db:{query:(q:string,v:unknown[])=>Promise<{rows:any[]}>}},ws:string,tool:string,args:any){
 const home=(await x.db.query('SELECT country FROM workspaces WHERE id=$1',[ws])).rows[0]?.country as string;
 if(tool==='create_client')return {label:args.name as string,record:null,country:(args.country as string)||home};
 if(tool==='update_client'){const r=(await x.db.query('SELECT * FROM clients WHERE workspace_id=$1 AND id=$2',[ws,args.id])).rows[0];if(!r)throw missing();return {label:r.name as string,record:r,country:(args.country===undefined?r.country:args.country)||home};}
 if(tool==='create_site'){const r=(await x.db.query('SELECT name,country FROM clients WHERE workspace_id=$1 AND id=$2',[ws,args.client_id])).rows[0];if(!r)throw missing();return {label:r.name as string,record:null,country:r.country||home};}
 const r=(await x.db.query('SELECT s.*,c.name AS client_name,c.country AS client_country FROM sites s JOIN clients c ON c.id=s.client_id AND c.workspace_id=s.workspace_id WHERE s.workspace_id=$1 AND s.id=$2',[ws,args.id])).rows[0];if(!r)throw missing();return {label:`${r.name} (${r.client_name})`,record:r,country:r.client_country||home};
}
export const assistantUnavailable={available:false,message:'I can’t answer that right now. Please try again in a minute. Everything else in Groundwork works as normal.'};
const schema=z.object({messages:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().min(1).max(20000)}).strict()).max(30),confirm_action_id:uuid.optional()}).strict();
export async function assistant(user:string,ws:string,body:unknown) {
 const d=schema.parse(body),c:AgentContext={user,ws,scope:'write',kind:'assistant'};
 if(d.confirm_action_id)return asAgent({kind:'assistant'},()=>inWorkspace(user,ws,async x=>{
  const a=(await x.db.query('SELECT * FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND id=$3 FOR UPDATE',[ws,user,d.confirm_action_id])).rows[0];
  if(!a)throw missing();
  if(a.consumed_at)throw new ApiError(409,'consumed','This action has already been confirmed.');
  if(new Date(a.expires_at)<=new Date())throw new ApiError(409,'expired','This action has expired. Ask the assistant again.');
  // Shared services reuse this same app-role transaction: write and consume commit together.
  const previous=['update_work_order_status','update_work_order_dates','set_priority','add_comment','assign_work_order','set_job_trade','set_job_payment'].includes(a.tool)?await getWorkOrder(user,ws,a.args.id??a.args.work_order_id):null;
  const queueTarget=['approve_queue_row','reject_queue_row'].includes(a.tool)?(await x.db.query('SELECT row_number,data FROM import_rows WHERE workspace_id=$1 AND id=$2',[ws,a.args.row_id])).rows[0]:null;
  const record=recordTools.includes(a.tool)?await recordTarget(x,ws,a.tool,a.args):null;
  const person=teamTools.includes(a.tool)?await personLabel(x,ws,a.tool,a.args):undefined;
  const result=await callTool(c,a.tool,a.args);
  const value=result.structuredContent as {result?:any};
  const order=result.isError?null:previous??(['create_request','approve_queue_row'].includes(a.tool)?value.result:null);
  // Decision log: outcome, and for a new job its id so Undo can cancel it.
  const created=a.tool==='create_request'&&!result.isError?{id:value?.result?.id}:null;
  await x.db.query('UPDATE assistant_actions SET consumed_at=now(), outcome=$2, before=coalesce($3::jsonb,before) WHERE id=$1',[a.id,result.isError?'failed':'done',created?JSON.stringify(created):null]);
  const first=String((await x.db.query('SELECT name FROM visible_user($1)',[user])).rows[0]?.name??'').trim().split(/\s+/)[0];
  const done=(t:string)=>result.isError?t:`Done${first?`, ${first}`:''}. ${t.replace(/^Done[.,!]?\s*/i,'')}`;
  return {available:true,reply:result.isError?plainAssistantReply(result.content[0].text,x.role==='client'):record?done(recordResult(a.tool,a.args,record)):done(audienceStatusReply(actionResult(a.tool,a.args,order,person??(queueTarget?`row ${queueTarget.row_number}: ${queueTarget.data.title}`:undefined)),x.role==='client')),result,logged:!result.isError};
 }));
 const {role,first,extra}=await inWorkspace(user,ws,async c=>({role:c.role,extra:((await c.db.query('SELECT extra_roles FROM members WHERE workspace_id=$1 AND user_id=$2',[ws,user])).rows[0]?.extra_roles??[]) as string[],first:String((await c.db.query('SELECT name FROM visible_user($1)',[user])).rows[0]?.name??'').trim().split(/\s+/)[0]}));
 const declarations=Object.entries(tools).map(([name,t])=>({name,description:t.description,parameters:z.toJSONSchema(t.schema,{io:'input'})}));
 const history:AssistantMessage[]=[...d.messages];
 if(!history.length)history.push({role:'user',content:'Help me with my workspace.'});
 let saved=false;
 for(let i=0;i<10;i++){
  const turn=await assistantTurn(history,declarations,`The person you are helping is ${first||'a team member'} (${[role,...extra].map(r=>r==='staff'?'supervisor':r).join(', ')}).${extra.includes('technician')?' They also do jobs themselves: my_day gives their own jobs today, and they can be assigned jobs.':''} Use the first name in a greeting now and then, not in every reply.`);if(!turn)return assistantUnavailable;
  if(!turn.calls.length){const text=plainAssistantReply(turn.text??'How can I help?',role==='client');return {available:true,reply:!saved&&/please confirm|confirm this (?:action|change)|action completed|(?:I(?:’|')ve|I have|successfully) (?:changed|moved|updated|added|created|approved|rejected)/i.test(text)?'No changes have been made. Ask me to make the change so you can review and confirm it.':text};}
  history.push(...turn.calls.map(call=>({role:'call' as const,...call,raw:turn.raw})));
  for(const [index,call] of turn.calls.entries()){
   const t=Object.hasOwn(tools,call.name)?tools[call.name]:undefined;
   if(index>=8){history.push({role:'result',name:call.name,result:{isError:true,content:[{type:'text',text:'Tool limit reached for this turn.'}]},id:call.id});continue;}
   const candidate=call.name==='add_comment'&&role!=='client'&&!explicitClientComment(d.messages.filter(m=>m.role==='user').at(-1)?.content??'')?{...(call.args as Record<string,unknown>),visibility:'internal'}:call.args;
   const parsed=t?.schema.safeParse(candidate);
   if(!t||!parsed?.success){
    history.push({role:'result',name:call.name,result:{isError:true,content:[{type:'text',text:!t?'Unknown tool.':'Invalid tool arguments. Please check the tool schema.'}]},id:call.id});
    continue;
   }
   // A short question with tap answers, instead of guessing. The answer comes back as the next message.
   if(call.name==='ask_choice'&&t){const q=parsed.data as {question:string;options:string[]};return {available:true,reply:plainAssistantReply(q.question,role==='client'),choices:q.options.map(o=>plainAssistantReply(o,role==='client'))};}
   if(t.write){
    const args=parsed.data;
    // A job or site the model named that does not exist (or this person can not see) goes back to the model, never a 404 page.
    let order:any=null;
    try{order=['update_work_order_status','update_work_order_dates','set_priority','assign_work_order','set_job_trade','set_job_payment'].includes(call.name)||call.name==='add_comment'?await getWorkOrder(user,ws,(args as any).id??(args as any).work_order_id):null;}
    catch(e){if(e instanceof ApiError&&[403,404,422].includes(e.status)){history.push({role:'result',name:call.name,result:{isError:true,content:[{type:'text',text:'That job was not found. Look it up first, or ask the person which job they mean with ask_choice.'}]},id:call.id});continue;}throw e;}
    let target:{label?:string;timezone?:string}|undefined;
    try{target=await inWorkspace(user,ws,async x=>{
     if(call.name==='create_request'){const site=(await x.db.query('SELECT s.name,c.name AS client,w.timezone FROM sites s JOIN clients c ON c.id=s.client_id AND c.workspace_id=s.workspace_id JOIN workspaces w ON w.id=s.workspace_id WHERE s.workspace_id=$1 AND s.id=$2',[ws,(args as any).site_id])).rows[0];if(!site)throw missing();return {label:`${site.client} · ${site.name}`,timezone:site.timezone};}
     if(['approve_queue_row','reject_queue_row'].includes(call.name)){const row=(await x.db.query('SELECT row_number,data FROM import_rows WHERE workspace_id=$1 AND id=$2',[ws,(args as any).row_id])).rows[0];if(!row)throw missing();return {label:`row ${row.row_number}: ${row.data.title}`,timezone:undefined};}
     if(teamTools.includes(call.name))return {label:await personLabel(x,ws,call.name,args),timezone:undefined};
     return undefined;
    });}catch(e){if(e instanceof ApiError&&[403,404,422].includes(e.status)){history.push({role:'result',name:call.name,result:{isError:true,content:[{type:'text',text:'That was not found. Look it up first, or ask the person which one they mean with ask_choice.'}]},id:call.id});continue;}throw e;}
    // Technicians change only the status of their own jobs and add notes; refuse anything else before a confirmation.
    if(role==='technician'&&!['update_work_order_status','add_comment'].includes(call.name)){history.push({role:'result',name:call.name,result:{isError:true,content:[{type:'text',text:'Technicians can update the status of their own jobs and add notes. Ask a supervisor for other changes.'}]},id:call.id});continue;}
    if(teamTools.includes(call.name)&&!['admin','staff'].includes(role)){history.push({role:'result',name:call.name,result:{isError:true,content:[{type:'text',text:'Only admins and supervisors can assign jobs or change the team.'}]},id:call.id});continue;}
    // Record writes are admin only; a role that cannot make them gets the refusal now, not after a confirmation.
    if(call.name==='set_job_payment'&&role!=='admin'){history.push({role:'result',name:call.name,result:{isError:true,content:[{type:'text',text:'Only an admin can change how a job is paid. Tell the person to ask the admin, and add a note on the job if they want.'}]},id:call.id});continue;}
    if(recordTools.includes(call.name)&&role!=='admin'){history.push({role:'result',name:call.name,result:{isError:true,content:[{type:'text',text:'Only workspace admins can add or change clients and sites.'}]},id:call.id});continue;}
    const record=recordTools.includes(call.name)?await inWorkspace(user,ws,x=>recordTarget(x,ws,call.name,args)):null;
    const summary=record?recordSummary(call.name,args as Record<string,any>,record):audienceStatusReply(actionSummary(call.name,args,order,target?.label,target?.timezone),role==='client');
    // Logging a team note is not consequential: do it straight away (still logged), no confirmation card.
    if(call.name==='add_comment'&&(args as any).visibility==='internal'&&['admin','staff','technician'].includes(role)){
     if(saved){history.push({role:'result',name:call.name,result:{content:[{type:'text',text:'The note is already saved. Tell the person it is done.'}]},id:call.id});continue;}
     const result=await callTool(c,call.name,args);
     const note=(result.structuredContent as any)?.result;
     const ask=d.messages.filter(m=>m.role==='user').at(-1)?.content??'';
     await inWorkspace(user,ws,x=>x.db.query('INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why,before,consumed_at,outcome) VALUES($1,$2,$3,$4,$5,$6,$7,now(),$8)',[ws,user,call.name,JSON.stringify(args),summary.slice(0,600),whyNote(ask,['The note is saved on the job for the team only.']),JSON.stringify({id:(args as any).work_order_id,comment_id:note?.id??null}),result.isError?'failed':'done']));
     if(result.isError){history.push({role:'result',name:call.name,result,id:call.id});continue;}
     // The done reply is a server template with the person's name, never model text.
     return {available:true,reply:`Done${first?`, ${first}`:''}. ${audienceStatusReply(actionResult(call.name,args,order),false)}`,logged:true};
    }
    // Contract facts go on the card so the admin decides; the agent never decides an over limit or ended contract.
    const contract=call.name==='set_job_payment'&&(args as any).payment_status==='contract'&&order?await inWorkspace(user,ws,async x=>contractNote(await contractUse(x,(order as any).client_id))):'';
    const pay=(args as any).payment_status;
    const knock=call.name==='set_job_payment'?(pay==='contract'?['It leaves the to bill list, so no invoice is made.','It shows as Covered by contract in the history.',contract].filter(Boolean):pay==='paid'?['It leaves the to bill list.','It shows as Paid in the history.']:['It goes back on the to bill list.']).map(l=>`• ${l}`).join('\n'):'';
    const card=knock?`${summary}\n${knock}`:summary;
    const lastAsk=d.messages.filter(m=>m.role==='user').at(-1)?.content??'';
    // Why: the person's own request plus what the change does, built here so it is always meaningful.
    const rest=card.split('\n').slice(1).map(l=>l.replace(/^•\s*/,'').trim()).filter(Boolean),effects=rest.length?rest:[card.split('\n')[0]];
    const why=whyNote(lastAsk,effects);
    const before=record?recordSnapshot(call.name,args as Record<string,any>,record.record):jobSnapshot(order as any);
    const id=await inWorkspace(user,ws,async x=>(await x.db.query('INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why,before) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[ws,user,call.name,JSON.stringify(args),card.slice(0,600),why,JSON.stringify(before)])).rows[0].id);
    return {available:true,pending_action:{id,tool:call.name,args,summary:card,why}};
   }
   const result=await callTool(c,call.name,call.args);
   history.push({role:'result',name:call.name,result,id:call.id});
  }
 }
 return {available:true,reply:'I reached the limit for workspace actions. Please ask a more specific question.'};
}
