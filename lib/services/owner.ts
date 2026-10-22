import { ApiError } from '../http';
import type { Context } from './shared';
export type OwnerPower = 'prices' | 'approval_mode' | 'payments' | 'owners' | 'close' | 'handover';
export const OWNER_REFUSAL: Record<OwnerPower, string> = {
 prices: 'Only the owner or an admin allowed to handle money can set prices.',
 approval_mode: 'Only the owner can change when the agent asks first.',
 payments: 'Only the owner can mark jobs as paid. He can hand this to admins in Settings.',
 owners: 'Only the owner can choose who the owner is.',
 close: 'Only the owner can close the company account.',
 handover: 'Only the owner can hand these powers to admins.',
};
export async function ownerCan(c: Context, power: OwnerPower) {
 const m = (await c.db.query(`SELECT m.is_owner,m.role,w.owner_handover FROM members m JOIN workspaces w ON w.id=m.workspace_id
  WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.archived_at IS NULL`, [c.ws,c.user])).rows[0];
 return !!m && (m.is_owner || (m.role==='admin' && ['prices','approval_mode','payments'].includes(power) && m.owner_handover.includes(power==='prices'?'payments':power)));
}
export async function requireOwner(c: Context, power: OwnerPower) {
 if (!await ownerCan(c,power)) throw new ApiError(403,'forbidden',OWNER_REFUSAL[power]);
}
/** Used before agent cards or queues, and again by each service before saving. */
export async function ownerToolPower(c: Context, tool: string, args: Record<string, any>): Promise<OwnerPower | null> {
 if(tool==='send_quote')return 'prices';
 if(tool==='set_approval_mode') return 'approval_mode';
 if(tool==='set_job_payment' && args.payment_status==='paid') return 'payments';
 if(tool==='set_member_roles') {
  const m=(await c.db.query('SELECT is_owner FROM members WHERE workspace_id=$1 AND user_id=$2',[c.ws,args.user_id])).rows[0];
  if(m && m.is_owner !== args.roles.includes('owner')) return 'owners';
 }
 return null;
}
