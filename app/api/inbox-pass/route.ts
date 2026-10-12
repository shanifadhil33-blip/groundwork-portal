import { cookies } from 'next/headers';
import { getSessionUserId, sessionCookie, signIn } from '../../../lib/auth';
import { ownerPool } from '../../../lib/db';
import { INBOX_ORIGIN, inboxPass, isInboxOwner } from '../../../lib/inbox';
import { endSession, FLOW_COOKIE, readCookie } from '../../../lib/inbox-flow';
/** Google sign in for the portfolio inbox. Fixed return URL; only the allowlisted Google account gets a pass.
 *  Every new sign in ends any Groundwork session here and goes to Google with prompt=select_account, so the picker always shows.
 *  back=1 is honored only with the flow cookie set on the way out, so nobody can skip Google by visiting it directly. */
export async function GET(req: Request) {
  const back = new URL(req.url).searchParams.get('back') === '1';
  const flow = readCookie(req, FLOW_COOKIE.name);
  if (!back || !flow) {
    await endSession(req);
    const jar = await cookies();
    jar.set(sessionCookie.name, '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    jar.set(FLOW_COOKIE.name, crypto.randomUUID(), { path: '/api/inbox-pass', maxAge: FLOW_COOKIE.maxAge, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    return signIn('google', { redirectTo: '/api/inbox-pass?back=1' }, { prompt: 'select_account' });
  }
  (await cookies()).set(FLOW_COOKIE.name, '', { path: '/api/inbox-pass', maxAge: 0 }); // one use
  const id = await getSessionUserId(req);
  const user = id ? (await ownerPool.query('SELECT u.email, u.is_demo, EXISTS(SELECT 1 FROM accounts a WHERE a."userId"=u.id AND a.provider=\'google\') AS google FROM users u WHERE u.id=$1', [id])).rows[0] : null;
  if (!user || !user.google || user.is_demo || !isInboxOwner(user.email, false)) return Response.redirect(INBOX_ORIGIN + '/inbox?denied=1', 303);
  return new Response(null, { status: 303, headers: { Location: `${INBOX_ORIGIN}/inbox/callback?t=${encodeURIComponent(inboxPass(user.email.toLowerCase()))}`, 'Cache-Control': 'no-store' } });
}
