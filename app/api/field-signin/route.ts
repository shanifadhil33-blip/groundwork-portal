import { redeemFieldLink } from '../../../lib/services/field-signin';
import { errorResponse, json, readBody } from '../../../lib/http';
/** Field staff sign in with the link or code their boss shared. Public, rate limited per IP. */
export async function POST(req: Request) { try {
  const ip = process.env.VERCEL ? req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown' : 'local';
  const result = await redeemFieldLink(await readBody(req), ip);
  const response = json({ home: result.home }, 200, { 'Set-Cookie': result.cookie });
  response.headers.append('Set-Cookie', 'groundwork-demo=; Path=/; SameSite=Lax; Max-Age=0');
  return response;
} catch (error) { return errorResponse(error); } }
