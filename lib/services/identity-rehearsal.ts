import type { Context } from './shared';
import { ApiError } from '../http';
import { practiceInviteScope } from '../identity-rehearsal';

/** Membership has already been checked by inWorkspace. Uses the caller's RLS identity. */
export async function practiceWorkspace(c: Context) {
  const w = (await c.db.query('SELECT is_demo,demo_expires_at FROM workspaces WHERE id=$1', [c.ws])).rows[0];
  if (!w?.is_demo) return null;
  if (!w.demo_expires_at || new Date(w.demo_expires_at) <= new Date()) throw new ApiError(401, 'demo_ended', 'Sign in to continue.');
  return { expires_at: new Date(w.demo_expires_at).toISOString() };
}

/** Preview receipts belong to their creator and are removed by the existing sandbox cleanup.
 * They never enter the invites table or any credential store. */
export async function practiceInvites(c: Context) {
  return (await c.db.query('SELECT result FROM idempotency_keys WHERE user_id=$1 AND scope=$2 ORDER BY created_at DESC,key', [c.user, practiceInviteScope(c.ws)])).rows.map(r => r.result);
}
