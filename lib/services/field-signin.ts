import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { withSystem } from '../db';
import { ApiError, forbidden } from '../http';
import { sessionCookie } from '../auth';
import { requiredEnv } from '../env';
import { assertRealUser } from './demo';
import { allow, hash, inWorkspace, uuid , allowTeam } from './shared';

/** Field staff sign in with a link or a 6 digit code. Nothing is emailed or texted: the admin shares it (WhatsApp, in person). $0. */
const LINK_DAYS = 7, SESSION_DAYS = 90;
const codeHash = (code: string) => createHmac('sha256', requiredEnv('AUTH_SECRET')).update('fieldcode:' + code).digest('hex');
const ipHash = (ip: string) => createHmac('sha256', requiredEnv('AUTH_SECRET')).update('fieldip:' + ip).digest('hex');
const addWorkerSchema = z.object({ name: z.string().trim().min(1, 'Write a name.').max(120), phone: z.string().trim().max(30).regex(/^[+0-9 ()]*$/, 'Use numbers only.').optional().or(z.literal('')), role: z.enum(['technician', 'staff']).default('technician') }).strict();
const redeemSchema = z.union([z.object({ token: z.string().min(20).max(100) }).strict(), z.object({ code: z.string().transform(v => v.replace(/\D/g, '')).pipe(z.string().length(6, 'Type the 6 numbers.')) }).strict()]);

async function makeLink(db: PoolClient, ws: string, userId: string, by: string) {
  await db.query('UPDATE login_links SET expires_at=now() WHERE user_id=$1 AND used_at IS NULL AND expires_at>now()', [userId]);
  const token = randomBytes(24).toString('base64url');
  let code = '';
  for (let i = 0; i < 10; i++) {
    code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const taken = (await db.query('SELECT 1 FROM login_links WHERE code_hash=$1 AND used_at IS NULL AND expires_at>now()', [codeHash(code)])).rowCount;
    if (!taken) break;
  }
  const expires = (await db.query(`INSERT INTO login_links(workspace_id,user_id,token_hash,code_hash,expires_at,created_by) VALUES($1,$2,$3,$4,now()+interval '${LINK_DAYS} days',$5) RETURNING expires_at`, [ws, userId, hash(token), codeHash(code), by])).rows[0].expires_at as Date;
  return { token, code, expires_at: expires.toISOString() };
}
/** Who may get a link: admins for technicians and supervisors, supervisors for technicians. Never admins, clients or Google accounts. */
function mayLink(asker: string, target: string) { return target === 'technician' ? ['admin', 'staff'].includes(asker) : target === 'staff' && asker === 'admin'; }

export async function addFieldWorker(user: string, ws: string, body: unknown) {
  await assertRealUser(user);
  const data = addWorkerSchema.parse(body);
  await inWorkspace(user, ws, async c => { allowTeam(c); if (!mayLink(c.role, data.role)) throw forbidden(); });
  return withSystem(async db => {
    const userId = (await db.query('INSERT INTO users(name,phone) VALUES($1,$2) RETURNING id', [data.name, data.phone || null])).rows[0].id as string;
    await db.query('INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,$3)', [ws, userId, data.role]);
    return { user_id: userId, name: data.name, role: data.role, ...(await makeLink(db, ws, userId, user)) };
  }, user);
}
export async function newFieldLink(user: string, ws: string, target: string) {
  await assertRealUser(user); uuid.parse(target);
  const asker = await inWorkspace(user, ws, async c => { allowTeam(c); return c.role; });
  return withSystem(async db => {
    const m = (await db.query('SELECT m.role, u.name, EXISTS(SELECT 1 FROM accounts a WHERE a."userId"=u.id) AS google FROM members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.archived_at IS NULL', [ws, target])).rows[0];
    if (!m) throw new ApiError(404, 'not_found', 'We couldn’t find that person.');
    if (!mayLink(asker, m.role)) throw forbidden();
    if (m.google) throw new ApiError(409, 'uses_google', 'This person signs in with Google.');
    return { user_id: target, name: m.name, role: m.role, ...(await makeLink(db, ws, target, user)) };
  }, user);
}
export async function redeemFieldLink(body: unknown, ip: string) {
  const data = redeemSchema.parse(body);
  // Count the try in its own transaction, so a wrong code (which rolls back) still counts.
  const ipKey = ipHash(ip);
  const tries = await withSystem(async db => {
    await db.query("DELETE FROM login_attempts WHERE created_at<now()-interval '1 day'");
    const n = (await db.query("SELECT count(*)::int AS n FROM login_attempts WHERE ip_hash=$1 AND created_at>now()-interval '15 minutes'", [ipKey])).rows[0].n as number;
    if (n < 10) await db.query('INSERT INTO login_attempts(ip_hash) VALUES($1)', [ipKey]);
    return n;
  });
  if (tries >= 10) throw new ApiError(429, 'too_many', 'Too many tries. Please wait 15 minutes.');
  return withSystem(async db => {
    const link = (await db.query(`SELECT l.id,l.user_id,m.role FROM login_links l JOIN members m ON m.user_id=l.user_id AND m.workspace_id=l.workspace_id AND m.archived_at IS NULL
      WHERE ${'token' in data ? 'l.token_hash=$1' : 'l.code_hash=$1'} AND l.used_at IS NULL AND l.expires_at>now() FOR UPDATE OF l`, ['token' in data ? hash(data.token) : codeHash(data.code)])).rows[0];
    if (!link) throw new ApiError(400, 'bad_code', 'That did not work. Ask your admin for a new code.');
    await db.query('UPDATE login_links SET used_at=now() WHERE id=$1', [link.id]);
    const token = randomBytes(32).toString('base64url'), expires = new Date(Date.now() + SESSION_DAYS * 864e5);
    await db.query('INSERT INTO sessions("userId","sessionToken",expires) VALUES($1,$2,$3)', [link.user_id, token, expires]);
    const cookie = `${sessionCookie.name}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${sessionCookie.options.secure ? '; Secure' : ''}`;
    return { cookie, home: link.role === 'technician' ? '/today' : '/dashboard' };
  });
}
