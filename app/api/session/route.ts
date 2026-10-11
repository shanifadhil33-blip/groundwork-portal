import { getSessionUserId } from '../../../lib/auth';

export async function GET(req: Request) {
  return Response.json({ signedIn: Boolean(await getSessionUserId(req)) }, { headers: { 'Cache-Control': 'no-store' } });
}
