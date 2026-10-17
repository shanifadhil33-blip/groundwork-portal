import { z } from 'zod';
import { allow,inWorkspace } from './shared';
import { ApiError } from '../http';
const input=z.object({body:z.string().trim().min(1).max(2000)}).strict();
export async function listAgentLearning(user:string,ws:string){return inWorkspace(user,ws,async c=>{
 const personal=(await c.db.query('SELECT id,body,created_at FROM personal_agent_learning WHERE workspace_id=$1 AND user_id=$2 ORDER BY created_at DESC',[ws,user])).rows.map(r=>({...r,scope:'personal',label:'Personal'}));
 const rules=(await c.db.query('SELECT id,body,created_at FROM company_rules WHERE workspace_id=$1 ORDER BY created_at DESC',[ws])).rows.map(r=>({...r,scope:'company_rule',label:'Company rule'}));
 return {data:[...personal,...rules]};
});}
export async function savePersonalLearning(user:string,ws:string,body:unknown){const d=input.parse(body);return inWorkspace(user,ws,async c=>(await c.db.query('INSERT INTO personal_agent_learning(workspace_id,user_id,body) VALUES($1,$2,$3) RETURNING id,body',[ws,user,d.body])).rows[0]);}
export async function saveCompanyRule(user:string,ws:string,body:unknown){const d=input.parse(body);return inWorkspace(user,ws,async c=>{allow(c,['admin']);return (await c.db.query('INSERT INTO company_rules(workspace_id,created_by,body) VALUES($1,$2,$3) RETURNING id,body',[ws,user,d.body])).rows[0];});}

/** LEARN15 Memory: he edits or deletes his own lines; nobody else's. Reset clears every personal line. */
export async function updatePersonalLearning(user:string,ws:string,id:string,body:unknown){const d=input.parse(body);return inWorkspace(user,ws,async c=>{const r=(await c.db.query('UPDATE personal_agent_learning SET body=$4 WHERE id=$1 AND workspace_id=$2 AND user_id=$3 RETURNING id,body',[id,ws,user,d.body])).rows[0];if(!r)throw new ApiError(404,'not_found','That memory is gone.');return r;});}
export async function deletePersonalLearning(user:string,ws:string,id:string){return inWorkspace(user,ws,async c=>{const n=(await c.db.query('DELETE FROM personal_agent_learning WHERE id=$1 AND workspace_id=$2 AND user_id=$3',[id,ws,user])).rowCount;if(!n)throw new ApiError(404,'not_found','That memory is gone.');return {deleted:true};});}
export async function resetPersonalLearning(user:string,ws:string){return inWorkspace(user,ws,async c=>({deleted:(await c.db.query('DELETE FROM personal_agent_learning WHERE workspace_id=$1 AND user_id=$2',[ws,user])).rowCount}));}
