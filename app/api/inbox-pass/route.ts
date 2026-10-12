import { getSessionUserId, sessionCookie, signIn } from '../../../lib/auth';
import { ownerPool } from '../../../lib/db';
import { INBOX_ORIGIN, inboxPass, isInboxOwner } from '../../../lib/inbox';
/** Google sign in for the portfolio inbox. Only Adhil's two real Google accounts get a pass; fixed return URL.
 *  A demo or field worker session is ended first and sent to Google, so nobody hits a dead end. Refusal only after a real Google sign in. */
export async function GET(req: Request) {
  const id = await getSessionUserId(req);
  const user = id ? (await ownerPool.query('SELECT u.email, u.is_demo, EXISTS(SELECT 1 FROM accounts a WHERE a."userId"=u.id AND a.provider=\'google\') AS google FROM users u WHERE u.id=$1', [id])).rows[0] : null;
  if (!user || !user.google || user.is_demo) {
    const token = req.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(sessionCookie.name + '='))?.slice(sessionCookie.name.length + 1);
    if (token) await ownerPool.query('DELETE FROM sessions WHERE "sessionToken"=$1', [token]); // never link Google to a demo or field account
    return signIn('google', { redirectTo: '/api/inbox-pass' });
  }
  if (!isInboxOwner(user.email, false)) return Response.redirect(INBOX_ORIGIN + '/inbox?denied=1', 303);
  return new Response(null, { status: 303, headers: { Location: `${INBOX_ORIGIN}/inbox/callback?t=${encodeURIComponent(inboxPass(user.email.toLowerCase()))}`, 'Cache-Control': 'no-store' } });
}
