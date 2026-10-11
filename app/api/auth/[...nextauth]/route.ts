import { NextRequest } from 'next/server';
import { handlers, sessionCookie } from '../../../../lib/auth';
import { ownerPool } from '../../../../lib/db';
import { withoutSessionCookie } from '../../../../lib/auth-callback';
async function handle(request: NextRequest, method: 'GET' | 'POST') {
  if (/^\/api\/auth\/(callback|signin)\//.test(new URL(request.url).pathname)) {
    const clean = withoutSessionCookie(request, sessionCookie.name);
    for (const token of clean.tokens) await ownerPool.query('DELETE FROM sessions WHERE "sessionToken"=$1', [token]);
    const response=await handlers[method](new NextRequest(clean.request));
    response.headers.append('Set-Cookie','groundwork-demo=; Path=/; SameSite=Lax; Max-Age=0');
    return response;
  }
  return handlers[method](request);
}
export const GET = (request: NextRequest) => handle(request, 'GET');
export const POST = (request: NextRequest) => handle(request, 'POST');
