import { withSystem } from '../db';
import { callTool } from '../agent/tools';
import { ApiError } from '../http';
import { allow,inWorkspace,uuid } from './shared';
import { z } from 'zod';
/** Company proposals are separate from every person's private Agent log. */
export async function listKeyApprovals(user:string,ws:string){return inWorkspace(user,ws,async c=>{
 allow(c,['admin']);return (await c.db.query(`SELECT a.id,a.tool,a.summary,a.created_at,a.expires_at,u.name AS asked_by,t.name AS key_name
  FROM company_action_approvals a LEFT JOIN LATERAL visible_user(a.requested_by) u ON true LEFT JOIN api_tokens t ON t.id=a.token_id
  WHERE a.workspace_id=$1 AND a.consumed_at IS NULL AND a.declined_at IS NULL AND a.expires_at>now() ORDER BY a.created_at`,[ws])).rows;
});}
export async function decideKeyApproval(user:string,ws:string,id:string,body:unknown){uuid.parse(id);const {approve}=z.object({approve:z.boolean()}).strict().parse(body);
 await inWorkspace(user,ws,async c=>allow(c,['admin']));
 const a=await withSystem(async db=>{
  const proposal=(await db.query(`UPDATE company_action_approvals SET ${approve?'consumed_at':'declined_at'}=now(),decided_by=$3 WHERE id=$1 AND workspace_id=$2 AND consumed_at IS NULL AND declined_at IS NULL AND expires_at>now() RETURNING *`,[id,ws,user])).rows[0];
  if(proposal)await db.query(`UPDATE assistant_actions SET ${approve?'consumed_at':'declined_at'}=now(),decided_by=$3 WHERE id=$1 AND workspace_id=$2`,[id,ws,user]);return proposal;
 },user);
 if(!a)throw new ApiError(409,'decided','This request was already handled or has expired.');
 if(!approve)return {declined:true};
 const live=await withSystem(async db=>(await db.query('SELECT 1 FROM api_tokens WHERE id=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())',[a.token_id])).rowCount);
 const result=live?await callTool({user:a.requested_by,ws,scope:'write',kind:'agent',tokenId:a.token_id??undefined,approved:true},a.tool,a.args):{isError:true as const,content:[{type:'text' as const,text:'The key that asked for this was removed.'}]};
 await withSystem(async db=>{const outcome=result.isError?'failed':'done';await db.query('UPDATE company_action_approvals SET outcome=$2 WHERE id=$1',[a.id,outcome]);await db.query('UPDATE assistant_actions SET outcome=$2 WHERE id=$1',[a.id,outcome]);},user);
 if(result.isError)throw new ApiError(422,'failed',result.content[0]?.text??'This change could not be made.');
 return {done:true};
}
