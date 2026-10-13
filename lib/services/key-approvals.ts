import { withSystem } from '../db';
import { callTool } from '../agent/tools';
import { ApiError } from '../http';
import { allow, inWorkspace } from './shared';
/** Connect AI key actions waiting for an admin (approval mode Ask before every action). */
export async function listKeyApprovals(user:string,ws:string){
 await inWorkspace(user,ws,async c=>allow(c,['admin']));
 return withSystem(async db=>(await db.query(`SELECT a.id,a.tool,a.summary,a.created_at,a.expires_at,coalesce(u.name,u.email) AS asked_by,t.name AS key_name
  FROM assistant_actions a JOIN users u ON u.id=a.user_id LEFT JOIN api_tokens t ON t.id=a.token_id
  WHERE a.workspace_id=$1 AND a.source='key' AND a.consumed_at IS NULL AND a.declined_at IS NULL AND a.expires_at>now() ORDER BY a.created_at`,[ws])).rows);
}
export async function decideKeyApproval(user:string,ws:string,id:string,body:unknown){
 const approve=!!(body as {approve?:unknown})?.approve;
 await inWorkspace(user,ws,async c=>allow(c,['admin']));
 // Claim first so two admins cannot run it twice; no lock is held while it runs.
 const a=await withSystem(async db=>(await db.query(`UPDATE assistant_actions SET ${approve?'consumed_at':'declined_at'}=now(),decided_by=$3 WHERE id=$1 AND workspace_id=$2 AND source='key' AND consumed_at IS NULL AND declined_at IS NULL AND expires_at>now() RETURNING *`,[id,ws,user])).rows[0],user);
 if(!a)throw new ApiError(409,'decided','This request was already handled or has expired.');
 if(!approve)return {declined:true};
 const live=await withSystem(async db=>(await db.query('SELECT 1 FROM api_tokens WHERE id=$1 AND revoked_at IS NULL',[a.token_id])).rowCount);
 const result=live?await callTool({user:a.user_id,ws,scope:'write',kind:'agent',tokenId:a.token_id??undefined,approved:true},a.tool,a.args):{isError:true as const,content:[{type:'text' as const,text:'The key that asked for this was removed.'}]};
 await withSystem(db=>db.query('UPDATE assistant_actions SET outcome=$2 WHERE id=$1',[a.id,result.isError?'failed':'done']),user);
 if(result.isError)throw new ApiError(422,'failed',result.content[0]?.text??'This change could not be made.');
 return {done:true};
}
