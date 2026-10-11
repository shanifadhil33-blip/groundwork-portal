import { z } from 'zod';
import { formatDate } from '../dates';
import { statusLabels } from '../ui/work-orders';
import { asAgent } from '../db';
import { assistantTurn,type AssistantMessage } from '../ai';
import { ApiError,missing } from '../http';
import { inWorkspace,uuid } from './shared';
import { getWorkOrder } from './work-orders';
import { tools,callTool,type AgentContext } from '../agent/tools';
export const assistantUnavailable={available:false,message:'The assistant is unavailable right now. Everything else works as normal.'};
const schema=z.object({messages:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().min(1).max(20000)}).strict()).max(30),confirm_action_id:uuid.optional()}).strict();
export async function assistant(user:string,ws:string,body:unknown) {
 const d=schema.parse(body),c:AgentContext={user,ws,scope:'write',kind:'assistant'};
 if(d.confirm_action_id)return asAgent({kind:'assistant'},()=>inWorkspace(user,ws,async x=>{
  const a=(await x.db.query('SELECT * FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND id=$3 FOR UPDATE',[ws,user,d.confirm_action_id])).rows[0];
  if(!a)throw missing();
  if(a.consumed_at)throw new ApiError(409,'consumed','This action has already been confirmed.');
  if(new Date(a.expires_at)<=new Date())throw new ApiError(409,'expired','This action has expired. Ask the assistant again.');
  // Shared services reuse this same app-role transaction: write and consume commit together.
  const result=await callTool(c,a.tool,a.args);
  await x.db.query('UPDATE assistant_actions SET consumed_at=now() WHERE id=$1',[a.id]);
  return {available:true,reply:result.isError?result.content[0].text:'Action completed.',result};
 }));
 await inWorkspace(user,ws,async()=>{});
 const declarations=Object.entries(tools).map(([name,t])=>({name,description:t.description,parameters:z.toJSONSchema(t.schema)}));
 const history:AssistantMessage[]=[...d.messages];
 if(!history.length)history.push({role:'user',content:'Help me with my workspace.'});
 for(let i=0;i<10;i++){
  const turn=await assistantTurn(history,declarations);if(!turn)return assistantUnavailable;
  if(!turn.calls.length)return {available:true,reply:turn.text??'How can I help?'};
  history.push(...turn.calls.map(call=>({role:'call' as const,...call,raw:turn.raw})));
  for(const [index,call] of turn.calls.entries()){
   const t=Object.hasOwn(tools,call.name)?tools[call.name]:undefined;
   if(index>=8){history.push({role:'result',name:call.name,result:{isError:true,content:[{type:'text',text:'Tool limit reached for this turn.'}]},id:call.id});continue;}
   const parsed=t?.schema.safeParse(call.args);
   if(!t||!parsed?.success){
    history.push({role:'result',name:call.name,result:{isError:true,content:[{type:'text',text:!t?'Unknown tool.':'Invalid tool arguments. Please check the tool schema.'}]},id:call.id});
    continue;
   }
   if(t.write){
    const args=parsed.data;
    const order=['update_work_order_status','update_work_order_dates'].includes(call.name)||call.name==='add_comment'?await getWorkOrder(user,ws,(args as any).id??(args as any).work_order_id):null;
    const summary=call.name==='create_request'?`Create request '${(args as any).title}'`:call.name==='update_work_order_status'?`Change status of '${order.title}' to ${statusLabels[(args as any).status]}`:call.name==='update_work_order_dates'?`Change dates for '${order.title}': ${['due_on','scheduled_for'].filter(key=>key in args).map(key=>`${key==='due_on'?'Due':'Visit'} ${(args as any)[key]?formatDate((args as any)[key],order.timezone):'cleared'}`).join('; ')}`:call.name==='add_comment'?`Add ${(args as any).visibility==='internal'?'an internal':'a client-visible'} comment to '${order.title}'`:call.name==='approve_queue_row'?'Approve the selected import row':'Reject the selected import row';
    const id=await inWorkspace(user,ws,async x=>(await x.db.query('INSERT INTO assistant_actions(workspace_id,user_id,tool,args) VALUES($1,$2,$3,$4) RETURNING id',[ws,user,call.name,JSON.stringify(args)])).rows[0].id);
    return {available:true,reply:'Please confirm this action before I make the change.',pending_action:{id,tool:call.name,args,summary}};
   }
   const result=await callTool(c,call.name,call.args);
   history.push({role:'result',name:call.name,result,id:call.id});
  }
 }
 return {available:true,reply:'I reached the tool limit. Please ask a more specific question.'};
}
