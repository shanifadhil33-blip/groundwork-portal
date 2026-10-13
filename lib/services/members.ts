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
   const count=(await c.db.query("SELECT count(*)::int AS n FROM members WHERE workspace_id=$1 AND role='admin' AND archived_at IS NULL",[ws])).rows[0].n;
   if(count<=1)throw new ApiError(409,'last_admin','Keep at least one workspace admin.');
  }
  if(data?.client_id)await row(c,'clients',data.client_id);
  if(data) {
   if(member.client_id!==data.client_id && (await c.db.query('SELECT 1 FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 LIMIT 1',[ws,id])).rowCount && data.role==='client')throw invalid('Unassign this member before changing them to a client.','role');
   // Extra roles must stay below the main role; a client has none.
   const below=data.role==='admin'?['staff','technician']:data.role==='staff'?['technician']:[];
   return update(c,'members',id,{role:data.role,client_id:data.client_id??null,extra_roles:(member.extra_roles??[]).filter((r:string)=>below.includes(r))});
  }
  // Delete is only for someone added by mistake. Anyone with jobs, notes or changes is archived instead, so history stays.
  if(member.role!=='client'){const used=(await c.db.query('SELECT EXISTS(SELECT 1 FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2) OR EXISTS(SELECT 1 FROM comments WHERE workspace_id=$1 AND author_id=$2) OR EXISTS(SELECT 1 FROM work_order_events WHERE workspace_id=$1 AND actor_id=$2) AS used',[ws,id])).rows[0].used;if(used)throw new ApiError(409,'has_history','This person has job history. Archive them instead, so their jobs and notes keep their name.');}
  await c.db.query('SELECT remove_member($1,$2)',[ws,id]);return {deleted:true};
 });
}

/** Roles a team member can hold together. The main role is the highest; the rest are kept as extra roles. */
const TEAM_ORDER=['admin','staff','technician'] as const;
const rolesSchema=z.object({roles:z.array(z.enum([...TEAM_ORDER,'office'])).min(1,'Keep at least one role.').max(4)}).strict();
/** Office staff (ROLE11) is stored as staff with staff_kind office. Supervisor or Admin covers it, so it only counts on its own. */
export function splitRoles(roles:string[]){const office=roles.includes('office')&&!roles.includes('admin')&&!roles.includes('staff');const sorted=TEAM_ORDER.filter(r=>roles.includes(r)||(office&&r==='staff'));return {role:sorted[0],extra_roles:sorted.slice(1),staff_kind:office?'office':null};}
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
  if(cur.role==='admin'&&next.role!=='admin'){const n=(await db.query("SELECT count(*)::int AS n FROM members WHERE workspace_id=$1 AND role='admin' AND archived_at IS NULL",[ws])).rows[0].n;if(n<=1)throw new ApiError(409,'last_admin','Keep at least one admin.');}
  return (await db.query('UPDATE members SET role=$3, extra_roles=$4, staff_kind=$5 WHERE workspace_id=$1 AND user_id=$2 RETURNING user_id, role, extra_roles, staff_kind',[ws,id,next.role,next.extra_roles,next.staff_kind])).rows[0];
 },user);
}

/** What is linked to a team member: their jobs and notes. A person with any history is archived, never deleted. */
export async function memberImpact(user:string,ws:string,id:string){
 uuid.parse(id);
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);
  const m=(await c.db.query('SELECT role,archived_at FROM members WHERE workspace_id=$1 AND user_id=$2',[ws,id])).rows[0];if(!m)throw new ApiError(404,'not_found','This person is not on your team.');
  const q=async(sql:string)=>Number((await c.db.query(sql,[ws,id])).rows[0].n);
  const jobs=await q('SELECT count(*) n FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2');
  const open=await q("SELECT count(*) n FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 AND status NOT IN ('done','cancelled')");
  const notes=await q('SELECT count(*) n FROM comments WHERE workspace_id=$1 AND author_id=$2');
  const changes=await q('SELECT count(*) n FROM work_order_events WHERE workspace_id=$1 AND actor_id=$2');
  return {role:m.role,archived:!!m.archived_at,jobs,open_jobs:open,notes,can_delete:!jobs&&!notes&&!changes};
 });
}
/**
 * Archive a former team member (universal rule 17): they can no longer sign in to this workspace, they leave the Team page,
 * pickers and suggestions, and every job, note and count keeps their name. Their open jobs become unassigned and are
 * remembered, so Unarchive can give back the ones nobody else took. Admin only; never yourself or the last admin.
 */
export async function archiveMember(user:string,ws:string,id:string){
 uuid.parse(id);
 if(id===user)throw invalid('You can not archive yourself.','user_id');
 await inWorkspace(user,ws,async c=>allow(c,['admin']));
 return withSystem(async db=>{
  await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[ws]);
  const m=(await db.query('SELECT role,archived_at FROM members WHERE workspace_id=$1 AND user_id=$2 FOR UPDATE',[ws,id])).rows[0];
  if(!m)throw new ApiError(404,'not_found','This person is not on your team.');
  if(m.archived_at)throw new ApiError(409,'archived','This person is already archived.');
  if(m.role==='admin'&&Number((await db.query("SELECT count(*) n FROM members WHERE workspace_id=$1 AND role='admin' AND archived_at IS NULL",[ws])).rows[0].n)<=1)throw new ApiError(409,'last_admin','Keep at least one admin.');
  const jobs=(await db.query("UPDATE work_orders SET assignee_id=NULL WHERE workspace_id=$1 AND assignee_id=$2 AND status NOT IN ('done','cancelled') RETURNING id",[ws,id])).rows.map(r=>r.id);
  await db.query('UPDATE members SET archived_at=now(), archive_unassigned=$3 WHERE workspace_id=$1 AND user_id=$2',[ws,id,jobs]);
  await db.query('DELETE FROM login_links WHERE workspace_id=$1 AND user_id=$2 AND used_at IS NULL',[ws,id]);
  return {archived:true,unassigned:jobs.length};
 },user);
}
export async function unarchiveMember(user:string,ws:string,id:string){
 uuid.parse(id);
 await inWorkspace(user,ws,async c=>allow(c,['admin']));
 return withSystem(async db=>{
  const m=(await db.query('SELECT archived_at,archive_unassigned FROM members WHERE workspace_id=$1 AND user_id=$2 FOR UPDATE',[ws,id])).rows[0];
  if(!m)throw new ApiError(404,'not_found','This person is not on your team.');
  if(!m.archived_at)throw new ApiError(409,'not_archived','This person is not archived.');
  const back=(await db.query("UPDATE work_orders SET assignee_id=$2 WHERE workspace_id=$1 AND id=ANY($3::uuid[]) AND assignee_id IS NULL AND status NOT IN ('done','cancelled') RETURNING id",[ws,id,m.archive_unassigned??[]])).rowCount;
  await db.query("UPDATE members SET archived_at=NULL, archive_unassigned='{}' WHERE workspace_id=$1 AND user_id=$2",[ws,id]);
  return {unarchived:true,jobs_back:back};
 },user);
}

/** Client side role (ROLE09): facility manager (default), client office staff or household (sees only his own requests). Admin only; works in the demo. */
export const CLIENT_KINDS=['manager','office','household'] as const;
export async function setClientKind(user:string,ws:string,id:string,body:unknown){
 uuid.parse(id);const {kind}=z.object({kind:z.enum(CLIENT_KINDS)}).strict().parse(body);
 await inWorkspace(user,ws,async c=>{allow(c,['admin']);const m=(await c.db.query('SELECT role FROM members WHERE workspace_id=$1 AND user_id=$2',[ws,id])).rows[0];if(!m)throw new ApiError(404,'not_found','This person is not in your workspace.');if(m.role!=='client')throw invalid('Only client members have a client type.','kind');});
 return withSystem(async db=>(await db.query('UPDATE members SET client_kind=$3 WHERE workspace_id=$1 AND user_id=$2 RETURNING user_id,client_kind',[ws,id,kind])).rows[0],user);
}
