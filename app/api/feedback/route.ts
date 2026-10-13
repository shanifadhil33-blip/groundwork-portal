import { z } from 'zod';
import { requireUser } from '../../../lib/auth';
import { ownerPool } from '../../../lib/db';
import { ApiError, errorResponse, json, readBody } from '../../../lib/http';
import { INBOX_ORIGIN, feedbackSecret, senderHash } from '../../../lib/inbox';
import { rolesLabel, type Role } from '../../../lib/roles';
const Body = z.object({
  message: z.string().trim().min(3, 'Write a few words.').max(4000),
  page: z.string().max(300).default('/'),
  device: z.string().max(300).default(''),
  website: z.string().max(0).optional(),
  screenshot: z.object({ type: z.enum(['image/jpeg', 'image/png', 'image/webp']), data: z.string().max(2_000_004) }).optional(),
});
/** Help and feedback: forwards to the central inbox with the shared secret. The app tags app, page, role and device. */
export async function POST(req: Request) { try {
  const id = await requireUser(req);
  const parsed = Body.safeParse(await readBody(req));
  if (!parsed.success) throw new ApiError(422, 'invalid', parsed.error.issues[0]?.message ?? 'Check your message.');
  if (parsed.data.website) return json({ ok: true });
  const member = (await ownerPool.query('SELECT role,client_kind,staff_kind,is_owner,is_manager FROM members WHERE user_id=$1 ORDER BY created_at LIMIT 1', [id])).rows[0];
  const res = await fetch(INBOX_ORIGIN + '/api/inbox', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + feedbackSecret() },
    body: JSON.stringify({ app: 'Groundwork', page: parsed.data.page.startsWith('/') ? parsed.data.page : '/', role: member ? rolesLabel(member) : 'No company yet', device: parsed.data.device, message: parsed.data.message, sender: senderHash(id), screenshot: parsed.data.screenshot }), signal: AbortSignal.timeout(10000) });
  if (res.status === 429) throw new ApiError(429, 'rate_limited', 'You sent a lot today. Please try again later.');
  if (!res.ok) throw new ApiError(502, 'inbox_down', 'We couldn’t send it. Please try again.');
  return json({ ok: true }, 201);
} catch (error) { return errorResponse(error); } }
