import { z } from 'zod';
import { asAgent } from '../db';
import { assistantTurn,type AssistantMessage } from '../ai';
import { ApiError,missing } from '../http';
import { inWorkspace,uuid } from './shared';
import { getWorkOrder } from './work-orders';
import { tools,callTool,type AgentContext } from '../agent/tools';
export const assistantUnavailable={available:false,message:'The assistant is unavailable right now. You can still do everything from the app.'};
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
 for(let i=0;i<4;i++){
  const turn=await assistantTurn(history,declarations);if(!turn)return assistantUnavailable;
  if(!turn.calls.length)return {available:true,reply:turn.text??'How can I help?'};
  for(const call of turn.calls.slice(0,8)){
   const t=tools[call.name];
   if(t?.write){
    const args=t.schema.parse(call.args);
    const order=call.name==='update_work_order_status'||call.name==='add_comment'?await getWorkOrder(user,ws,(args as any).id??(args as any).work_order_id):null;
    const summary=call.name==='create_request'?`Create request '${(args as any).title}'`:call.name==='update_work_order_status'?`Change status of '${order.title}' to ${(args as any).status.replaceAll('_',' ')}`:call.name==='add_comment'?`Add a ${(args as any).visibility} comment to '${order.title}'`:call.name==='approve_queue_row'?`Approve queue row ${(args as any).row_id}`:`Reject queue row ${(args as any).row_id}`;
    const id=await inWorkspace(user,ws,async x=>(await x.db.query('INSERT INTO assistant_actions(workspace_id,user_id,tool,args) VALUES($1,$2,$3,$4) RETURNING id',[ws,user,call.name,JSON.stringify(args)])).rows[0].id);
    return {available:true,reply:'Please confirm this action before I make the change.',pending_action:{id,tool:call.name,args,summary}};
   }
   const result=await callTool(c,call.name,call.args);
   history.push({role:'call',name:call.name,args:call.args,id:call.id},{role:'result',name:call.name,result,id:call.id});
  }
 }
 return {available:true,reply:'I reached the tool limit. Please ask a more specific question.'};
}
