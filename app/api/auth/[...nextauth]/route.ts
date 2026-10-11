import { NextRequest } from 'next/server';
import { handlers, sessionCookie } from '../../../../lib/auth';
import { withSystem } from '../../../../lib/db';
import { withoutSessionCookie } from '../../../../lib/auth-callback';
async function handle(request: NextRequest, method: 'GET' | 'POST') {
  if (/^\/api\/auth\/(callback|signin)\//.test(new URL(request.url).pathname)) {
    const clean = await withoutSessionCookie(request, sessionCookie.name);
    if(clean.tokens.length)await withSystem(db=>db.query('DELETE FROM sessions WHERE "sessionToken"=ANY($1::text[])', [clean.tokens]));
    const response=await handlers[method](new NextRequest(clean.url, clean.init));
    response.headers.append('Set-Cookie','groundwork-demo=; Path=/; SameSite=Lax; Max-Age=0');
    return response;
  }
  return handlers[method](request);
}
export const GET = (request: NextRequest) => handle(request, 'GET');
export const POST = (request: NextRequest) => handle(request, 'POST');
