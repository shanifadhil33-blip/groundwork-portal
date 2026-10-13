import { assertRealUser } from './demo';
import { z } from 'zod';
import { ApiError, invalid } from '../http';
import { withSystem } from '../db';
import { allow, inWorkspace, role, row, update, uuid } from './shared';
export const membershipSchema=z.object({role,client_id:uuid.nullable().optional()}).strict().superRefine((v,ctx)=>{
 if((v.role==='client')!==Boolean(v.client_id))ctx.addIssue({code:'custom',path:['client_id'],message:'Client roles require a client; other roles must have no client.'});
});
export async function listMembers(user:string,ws:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);return (await c.db.query('SELECT m.*,u.name,u.email FROM members m LEFT JOIN LATERAL visible_user(m.user_id) u ON true WHERE m.workspace_id=$1 ORDER BY u.name,m.user_id',[ws])).rows;});
}
export async function changeMember(user:string,ws:string,id:string,body?:unknown) {
 await assertRealUser(user);
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
   // Extra roles must stay below the main role; a client has none.
   const below=data.role==='admin'?['staff','technician']:data.role==='staff'?['technician']:[];
   return update(c,'members',id,{role:data.role,client_id:data.client_id??null,extra_roles:(member.extra_roles??[]).filter((r:string)=>below.includes(r))});
  }
  await c.db.query('SELECT remove_member($1,$2)',[ws,id]);return {deleted:true};
 });
}

/** Roles a team member can hold together. The main role is the highest; the rest are kept as extra roles. */
const TEAM_ORDER=['admin','staff','technician'] as const;
const rolesSchema=z.object({roles:z.array(z.enum(TEAM_ORDER)).min(1,'Keep at least one role.').max(3)}).strict();
export function splitRoles(roles:string[]){const sorted=TEAM_ORDER.filter(r=>roles.includes(r));return {role:sorted[0],extra_roles:sorted.slice(1)};}
/**
 * The owner or an admin turns a person's roles on and off (works in the demo sandbox too). Clients are a separate kind of member
 * and are changed in Settings. The last admin can not drop Admin.
 */
export async function setMemberRoles(user:string,ws:string,id:string,body:unknown){
 uuid.parse(id);const next=splitRoles(rolesSchema.parse(body).roles);
 await inWorkspace(user,ws,async c=>{
  allow(c,['admin']);
  const member=(await c.db.query('SELECT role FROM members WHERE workspace_id=$1 AND user_id=$2',[ws,id])).rows[0];
  if(!member)throw new ApiError(404,'not_found','This person is not on your team.');
  if(member.role==='client')throw invalid('Clients are changed in Settings, Members.','roles');
 });
 // Same pattern as skills: the admin check above is the gate, then the owner connection writes (so it works in the demo sandbox).
 // The workspace lock serializes changes so the last admin can never be removed by two admins at once.
 return withSystem(async db=>{
  await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[ws]);
  const cur=(await db.query('SELECT role FROM members WHERE workspace_id=$1 AND user_id=$2 FOR UPDATE',[ws,id])).rows[0];
  if(cur.role==='admin'&&next.role!=='admin'){const n=(await db.query("SELECT count(*)::int AS n FROM members WHERE workspace_id=$1 AND role='admin'",[ws])).rows[0].n;if(n<=1)throw new ApiError(409,'last_admin','Keep at least one admin.');}
  return (await db.query('UPDATE members SET role=$3, extra_roles=$4 WHERE workspace_id=$1 AND user_id=$2 RETURNING user_id, role, extra_roles',[ws,id,next.role,next.extra_roles])).rows[0];
 },user);
}
