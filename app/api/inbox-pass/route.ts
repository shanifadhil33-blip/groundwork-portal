import { getSessionUserId, sessionCookie, signIn } from '../../../lib/auth';
import { ownerPool } from '../../../lib/db';
import { INBOX_ORIGIN, inboxPass, isInboxOwner } from '../../../lib/inbox';
/** Google sign in for the portfolio inbox. Only Adhil's two real Google accounts get a pass; fixed return URL.
 *  Google always shows the account picker (prompt=select_account); any other session is ended first. Refusal only right after a real Google sign in. ?switch=1 forces the picker. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams, back = q.get('back') === '1', change = q.get('switch') === '1';
  const id = await getSessionUserId(req);
  const user = id ? (await ownerPool.query('SELECT u.email, u.is_demo, EXISTS(SELECT 1 FROM accounts a WHERE a."userId"=u.id AND a.provider=\'google\') AS google FROM users u WHERE u.id=$1', [id])).rows[0] : null;
  const owner = !!user && user.google && !user.is_demo && isInboxOwner(user.email, false);
  // Always let Google show the account picker, unless the owner is already signed in and did not ask to switch.
  // The old session is ended first, so a new Google account is never linked to it.
  if (change || (!owner && !back) || !user || !user.google || user.is_demo) {
    const token = req.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(sessionCookie.name + '='))?.slice(sessionCookie.name.length + 1);
    if (token) await ownerPool.query('DELETE FROM sessions WHERE "sessionToken"=$1', [token]);
    return signIn('google', { redirectTo: '/api/inbox-pass?back=1' }, { prompt: 'select_account' });
  }
  if (!owner) return Response.redirect(INBOX_ORIGIN + '/inbox?denied=1', 303);
  return new Response(null, { status: 303, headers: { Location: `${INBOX_ORIGIN}/inbox/callback?t=${encodeURIComponent(inboxPass(user.email.toLowerCase()))}`, 'Cache-Control': 'no-store' } });
}
