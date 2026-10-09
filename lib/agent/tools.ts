import { z } from 'zod';
import { asAgent } from '../db';
import { ApiError,errorResponse } from '../http';
import { inWorkspace,priority,status,uuid } from '../services/shared';
import { createWorkOrder,createComment,getWorkOrder,listWorkOrders,patchWorkOrder } from '../services/work-orders';
import { approveRow,rejectRow,listQueue } from '../services/imports';
import { dashboard } from '../services/workspaces';
export type AgentContext={user:string;ws:string;scope:'read'|'write';kind:'agent'|'assistant';tokenId?:string};
type Tool={description:string;write:boolean;schema:z.ZodObject;run:(c:AgentContext,a:any)=>Promise<unknown>};
function query(a:Record<string,unknown>) {const p=new URLSearchParams();for(const [k,v] of Object.entries(a))if(v!==undefined){if(Array.isArray(v))for(const value of v)p.append(k+'[]',String(value));else p.set(k,String(v));}return p;}
export const tools:Record<string,Tool>={
 list_work_orders:{description:'List visible work orders in your token workspace. Clients see their company only. Supports search, filters and pagination.',write:false,schema:z.object({q:z.string().max(500).optional(),status:z.array(status).optional(),priority:z.array(priority).optional(),client_id:uuid.optional(),sort:z.enum(['updated_at','created_at','scheduled_for','priority','title']).optional(),dir:z.enum(['asc','desc']).optional(),page:z.number().int().min(1).optional(),pageSize:z.number().int().min(1).max(100).optional()}).strict(),run:(c,a)=>listWorkOrders(c.user,c.ws,query(a))},
 get_work_order:{description:'Read one visible work order, including comments and timeline. Save updated_at for subsequent status updates. Internal comments are hidden from clients.',write:false,schema:z.object({id:uuid}).strict(),run:(c,a)=>getWorkOrder(c.user,c.ws,a.id)},
 create_request:{description:'Create an open maintenance request for a visible site. Clients are restricted to their own company.',write:true,schema:z.object({title:z.string().trim().min(1).max(200),description:z.string().max(20000).optional(),site_id:uuid,client_id:uuid.optional(),priority:priority.optional()}).strict(),run:(c,a)=>createWorkOrder(c.user,c.ws,a)},
 update_work_order_status:{description:'Staff/admin only: change status using updated_at from get_work_order. Stale versions fail; follow allowed workflow transitions.',write:true,schema:z.object({id:uuid,status,updated_at:z.iso.datetime({offset:true})}).strict(),run:(c,a)=>patchWorkOrder(c.user,c.ws,a.id,{status:a.status,updated_at:a.updated_at})},
 add_comment:{description:'Add a comment to visible work. Client users must choose visibility client; internal is staff/admin only.',write:true,schema:z.object({work_order_id:uuid,body:z.string().trim().min(1).max(20000),visibility:z.enum(['client','internal'])}).strict(),run:(c,a)=>createComment(c.user,c.ws,a.work_order_id,{body:a.body,visibility:a.visibility})},
 list_approval_queue:{description:'Staff/admin only: list pending spreadsheet approval rows with optional validation-status and decision filters.',write:false,schema:z.object({page:z.number().int().min(1).optional(),status:z.enum(['valid','warning','error']).optional(),decision:z.enum(['pending','approved','rejected']).optional()}).strict(),run:(c,a)=>listQueue(c.user,c.ws,query(a))},
 approve_queue_row:{description:'Staff/admin only: approve one pending row into a work order, optionally correcting mapped fields. No bulk approval.',write:true,schema:z.object({row_id:uuid,edits:z.object({title:z.string().max(500).optional(),description:z.string().max(20000).optional(),client:z.string().max(500).optional(),site:z.string().max(500).optional(),priority:z.string().max(500).optional(),scheduled_for:z.string().max(500).optional(),external_ref:z.string().max(500).optional()}).strict().optional()}).strict(),run:(c,a)=>approveRow(c.user,c.ws,a.row_id,{edits:a.edits})},
 reject_queue_row:{description:'Staff/admin only: reject one pending row with a plain English reason.',write:true,schema:z.object({row_id:uuid,reason:z.string().trim().min(1).max(2000)}).strict(),run:(c,a)=>rejectRow(c.user,c.ws,a.row_id,{reason:a.reason})},
 get_dashboard:{description:'Read status counts and dashboard metrics for visible work only.',write:false,schema:z.object({}).strict(),run:c=>dashboard(c.user,c.ws)},
 list_sites:{description:'List visible sites with IDs needed to create requests. Clients see only their own company sites.',write:false,schema:z.object({}).strict(),run:c=>inWorkspace(c.user,c.ws,async x=>(await x.db.query('SELECT * FROM sites WHERE workspace_id=$1 ORDER BY name,id',[c.ws])).rows)},
 whoami:{description:'Read current workspace membership and client scope. Roles are checked live for every tool.',write:false,schema:z.object({}).strict(),run:c=>inWorkspace(c.user,c.ws,async x=>({user_id:x.user,workspace_id:x.ws,role:x.role,client_id:x.client_id,scope:c.scope}))},
};
export async function callTool(c:AgentContext,name:string,args:unknown) {
 try {
  const t=tools[name];if(!t)throw new ApiError(404,'not_found','Unknown tool.');
  if(t.write&&c.scope==='read')throw new ApiError(403,'read_only','This token is read-only.');
  const a=t.schema.parse(args);
  const value=await asAgent({kind:c.kind,tokenId:c.tokenId},()=>t.run(c,a));
  const data=JSON.parse(JSON.stringify(value??null));
  return {content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:{result:data}};
 }catch(error){const response=errorResponse(error);const body=await response.json();return {isError:true,content:[{type:'text' as const,text:body.error.message}],structuredContent:{error:body.error}};}
}
