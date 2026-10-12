import { ownerPool } from './db';
import { sessionCookie } from './auth';

/** Short lived marker that this browser just started an inbox sign in here, so back=1 can only follow a real trip to Google. */
export const FLOW_COOKIE = { name: 'inbox-flow', maxAge: 600 };
export function readCookie(req: Request, name: string) {
  return req.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(name + '='))?.slice(name.length + 1) ?? null;
}
/** Ends this browser's Groundwork session row. Callers also clear the cookie. */
export async function endSession(req: Request) {
  const token = readCookie(req, sessionCookie.name);
  if (token) await ownerPool.query('DELETE FROM sessions WHERE "sessionToken"=$1', [decodeURIComponent(token)]);
}
export const clearSession = `${sessionCookie.name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
