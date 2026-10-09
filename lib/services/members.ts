import { z } from 'zod';
import { ApiError, invalid } from '../http';
import { allow, inWorkspace, role, row, update, uuid } from './shared';
export const membershipSchema=z.object({role,client_id:uuid.nullable().optional()}).strict().superRefine((v,ctx)=>{
 if((v.role==='client')!==Boolean(v.client_id))ctx.addIssue({code:'custom',path:['client_id'],message:'Client roles require a client; other roles must have no client.'});
});
export async function listMembers(user:string,ws:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);return (await c.db.query('SELECT m.*,u.name,u.email FROM members m LEFT JOIN LATERAL visible_user(m.user_id) u ON true WHERE m.workspace_id=$1 ORDER BY u.name,m.user_id',[ws])).rows;});
}
export async function changeMember(user:string,ws:string,id:string,body?:unknown) {
 return inWorkspace(user,ws,async c=>{
  allow(c,['admin']);
  // Lock the parent to serialize all removals/demotions, including different admins.
  await row(c,'workspaces',ws,true);
  const member=await row(c,'members',id,true);
  const data=body===undefined?undefined:membershipSchema.parse(body);
  if(member.role==='admin' && data?.role!=='admin') {
   const count=(await c.db.query("SELECT count(*)::int AS n FROM members WHERE workspace_id=$1 AND role='admin'",[ws])).rows[0].n;
   if(count<=1)throw new ApiError(409,'last_admin','Keep at least one workspace admin.');
  }
  if(data?.client_id)await row(c,'clients',data.client_id);
  if(data) {
   if(member.client_id!==data.client_id && (await c.db.query('SELECT 1 FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 LIMIT 1',[ws,id])).rowCount && data.role==='client')throw invalid('Unassign this member before changing them to a client.','role');
   return update(c,'members',id,{role:data.role,client_id:data.client_id??null});
  }
  await c.db.query('SELECT remove_member($1,$2)',[ws,id]);return {deleted:true};
 });
}
