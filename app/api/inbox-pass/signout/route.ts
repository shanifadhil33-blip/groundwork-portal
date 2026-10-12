import { INBOX_ORIGIN } from '../../../../lib/inbox';
import { clearSession, endSession, FLOW_COOKIE } from '../../../../lib/inbox-flow';
/** Inbox Sign out, step 2: end the Groundwork session too, then back to the portfolio home (fixed address). */
export async function GET(req: Request) {
  const h = new Headers({ Location: INBOX_ORIGIN + '/', 'Cache-Control': 'no-store' });
  await endSession(req); h.append('Set-Cookie', clearSession);
  h.append('Set-Cookie', `${FLOW_COOKIE.name}=; Path=/api/inbox-pass; Max-Age=0; HttpOnly; SameSite=Lax`);
  return new Response(null, { status: 303, headers: h });
}
