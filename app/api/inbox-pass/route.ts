import { getSessionUserId } from '../../../lib/auth';
import { ownerPool } from '../../../lib/db';
import { INBOX_ORIGIN, inboxPass, isInboxOwner } from '../../../lib/inbox';
/** Google sign in for the portfolio inbox: only Adhil's two Google accounts get a pass. Fixed return URL, no open redirect. */
export async function GET(req: Request) {
  const id = await getSessionUserId(req);
  if (!id) return Response.redirect(new URL('/sign-in?callbackUrl=' + encodeURIComponent('/api/inbox-pass'), req.url), 303);
  const user = (await ownerPool.query('SELECT u.email, u.is_demo, EXISTS(SELECT 1 FROM accounts a WHERE a."userId"=u.id AND a.provider=\'google\') AS google FROM users u WHERE u.id=$1', [id])).rows[0];
  if (!user?.google || !isInboxOwner(user.email, !!user.is_demo)) return Response.redirect(INBOX_ORIGIN + '/inbox?denied=1', 303);
  return new Response(null, { status: 303, headers: { Location: `${INBOX_ORIGIN}/inbox/callback?t=${encodeURIComponent(inboxPass(user.email.toLowerCase()))}`, 'Cache-Control': 'no-store' } });
}
