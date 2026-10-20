import { randomInt } from 'node:crypto';
import { asAgent, withSystem } from '../db';
import { requiredEnv } from '../env';
import { ApiError, missing } from '../http';
import { CLOSE_REPLIES, canSignOff, readSignOff, signOffRefusal, type CloseActor } from '../job-close';
import { z } from 'zod';
import { PHONE_REPLIES, codeSenderReady, codeMessage, hashPhoneCode, phoneCodeMatches, phoneLookup, readPhoneAsk } from '../phone-change';
import { phoneKey } from '../phone-key';
import { openSealed, seal } from '../secret-box';
import { USUAL_REPLIES, readUsualAsk, usualValid } from '../usual-context';
import { warmLead } from '../warm-reply';
import { applySignOff } from './job-close';
import { inWorkspace, uuid } from './shared';

const secret = () => requiredEnv('AUTH_SECRET');
const PLANNED = ['issue_phone_code', 'set_usual_context', 'sign_off'] as const;

function calm(error: unknown) {
  if (error instanceof ApiError && error.message && !/sql|stack|token|secret/i.test(error.message)) return error.message;
  return 'I could not do that right now, so nothing was changed. Try again in a minute.';
}

async function firstName(user: string) {
  const row = await withSystem(db => db.query('SELECT name FROM users WHERE id=$1', [user]), user);
  return String(row.rows[0]?.name ?? '').trim().split(/\s+/)[0] || null;
}

async function card(user: string, ws: string, tool: string, args: unknown, summary: string) {
  const id = await withSystem(async db => (await db.query(
    'INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
    [ws, user, tool, JSON.stringify(args), summary, 'Nothing is saved until you say yes.'],
  )).rows[0].id as string, user);
  return { available: true as const, reply: summary, pending_action: { id, tool, summary, why: 'Nothing is saved until you say yes.' } };
}

async function queuePhone(user: string, ws: string, phone: string) {
  const current = phoneKey(String((await withSystem(db => db.query('SELECT phone FROM users WHERE id=$1', [user]), user)).rows[0]?.phone ?? ''));
  if (current && current === phone) return { available: true as const, reply: PHONE_REPLIES.same };
  if (!codeSenderReady()) return { available: true as const, reply: PHONE_REPLIES.noSender };
  return card(user, ws, 'issue_phone_code', { phone_sealed: seal(phone, secret()), phone_lookup: phoneLookup(phone, secret()) }, PHONE_REPLIES.confirmSend);
}

async function takeCode(user: string, code: string) {
  return withSystem(async db => {
    const row = (await db.query('SELECT * FROM phone_changes WHERE user_id=$1 AND confirmed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE', [user])).rows[0];
    if (!row) return null;
    if (new Date(row.expires_at) <= new Date()) return { available: true as const, reply: PHONE_REPLIES.expired };
    if (row.attempts >= 5) return { available: true as const, reply: PHONE_REPLIES.locked };
    if (!phoneCodeMatches(code, row.code_hash, secret())) {
      const next = (await db.query('UPDATE phone_changes SET attempts=attempts+1 WHERE id=$1 RETURNING attempts', [row.id])).rows[0].attempts as number;
      return { available: true as const, reply: next >= 5 ? PHONE_REPLIES.locked : PHONE_REPLIES.mismatch };
    }
    const phone = openSealed(row.phone_sealed, secret());
    if (!phone) return { available: true as const, reply: PHONE_REPLIES.expired };
    await db.query('UPDATE users SET phone=$2 WHERE id=$1', [user, `+${phone}`]);
    await db.query('UPDATE phone_changes SET confirmed_at=clock_timestamp() WHERE id=$1', [row.id]);
    return { available: true as const, reply: PHONE_REPLIES.saved };
  }, user);
}

async function queueUsual(user: string, ws: string, ask: { start?: string; areas?: string[] }) {
  const bad = usualValid(ask);
  if (bad) return { available: true as const, reply: bad };
  const summary = ask.areas ? USUAL_REPLIES.areas : USUAL_REPLIES.start;
  return card(user, ws, 'set_usual_context', { start: ask.start ?? null, areas: ask.areas ?? null }, summary);
}

async function queueSignOff(user: string, ws: string, order: number | null) {
  return inWorkspace(user, ws, async c => {
    const jobs = (await c.db.query(`SELECT id,order_number,title,status,client_id,created_by,assignee_id,signed_off_at FROM work_orders
      WHERE workspace_id=$1 AND status='done' AND signed_off_at IS NULL AND archived_at IS NULL AND ($2::int IS NULL OR order_number=$2)
      ORDER BY updated_at DESC LIMIT 5`, [ws, order])).rows;
    const actor: CloseActor = { role: c.role, staff_kind: c.staff_kind, client_kind: c.client_kind, user, client_id: c.client_id };
    const visible = jobs.filter(job => canSignOff(actor, job));
    if (visible.length !== 1) return { available: true as const, reply: visible.length ? 'Open the job to sign off.' : (signOffRefusal(actor, jobs[0] ?? { status: 'open', client_id: '' }) ?? CLOSE_REPLIES.onlyClient) };
    const job = visible[0];
    return card(user, ws, 'sign_off', { id: job.id }, `${CLOSE_REPLIES.signOffAsk} WO ${job.order_number} ${job.title}`);
  });
}

/** Fixed phrases for the phone check, usual start and sign off. They never call the model. */
export async function planFromWords(user: string, ws: string, words: string) {
  const phone = readPhoneAsk(words);
  if (phone.kind === 'none' && !readUsualAsk(words) && !readSignOff(words)) return null;
  await inWorkspace(user, ws, async () => undefined);
  const name = await firstName(user);
  const lead = (reply: string) => warmLead(name, reply);
  try {
    if (phone.kind === 'code') {
      const taken = await takeCode(user, phone.code);
      return taken ? { ...taken, reply: lead(taken.reply) } : null;
    }
    if (phone.kind === 'ask_number') return { available: true as const, reply: lead(codeSenderReady() ? PHONE_REPLIES.askNumber : PHONE_REPLIES.noSender) };
    if (phone.kind === 'number') {
      const queued = await queuePhone(user, ws, phone.phone);
      return { ...queued, reply: lead(queued.reply) };
    }
    const usual = readUsualAsk(words);
    if (usual) {
      const queued = await queueUsual(user, ws, usual);
      return { ...queued, reply: lead(queued.reply) };
    }
    const sign = readSignOff(words);
    if (sign) {
      const queued = await queueSignOff(user, ws, sign.order);
      return queued && 'reply' in queued ? { ...queued, reply: lead(queued.reply) } : queued;
    }
    return null;
  } catch (error) {
    return { available: true as const, reply: calm(error) };
  }
}

export async function confirmPlanned(user: string, ws: string, actionId: string) {
  uuid.parse(actionId);
  return asAgent({ kind: 'assistant' }, () => withSystem(async db => {
    const a = (await db.query('SELECT * FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND id=$3 FOR UPDATE', [ws, user, actionId])).rows[0];
    if (!a || !PLANNED.includes(a.tool)) throw missing();
    if (a.consumed_at) throw new ApiError(409, 'consumed', 'This action has already been confirmed.');
    if (a.declined_at) throw new ApiError(409, 'declined', 'You said no to this one. Ask Agent again.');
    if (new Date(a.expires_at) <= new Date()) throw new ApiError(409, 'expired', 'This action has expired. Ask Agent again.');
    let reply: string = PHONE_REPLIES.saved;
    if (a.tool === 'issue_phone_code') {
      if (!codeSenderReady()) throw new ApiError(409, 'no_sender', PHONE_REPLIES.noSender);
      const phone = openSealed(String(a.args.phone_sealed ?? ''), secret());
      if (!phone) throw new ApiError(409, 'expired', PHONE_REPLIES.expired);
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await db.query('UPDATE phone_changes SET expires_at=now() WHERE user_id=$1 AND confirmed_at IS NULL', [user]);
      await db.query(`INSERT INTO phone_changes(user_id,phone_lookup,phone_sealed,code_hash,expires_at)
        VALUES($1,$2,$3,$4,now()+interval '10 minutes')`, [user, phoneLookup(phone, secret()), seal(phone, secret()), hashPhoneCode(code, secret())]);
      await db.query(`INSERT INTO whatsapp_messages(workspace_id,user_id,phone_sealed,body_sealed,direction,kind)
        VALUES($1,$2,$3,$4,'out','code')`, [ws, user, seal(phone, secret()), seal(codeMessage(code), secret())]);
      reply = PHONE_REPLIES.askCode;
    } else if (a.tool === 'set_usual_context') {
      const ask = { start: a.args.start ?? undefined, areas: a.args.areas ?? undefined };
      const bad = usualValid(ask);
      if (bad || (!ask.start && !ask.areas)) throw new ApiError(422, 'validation', bad ?? USUAL_REPLIES.badAreas);
      await db.query('INSERT INTO user_preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING', [user]);
      await db.query('UPDATE user_preferences SET usual_start=coalesce($2::time,usual_start), usual_areas=coalesce($3::text[],usual_areas), updated_at=clock_timestamp() WHERE user_id=$1', [user, ask.start ?? null, ask.areas ?? null]);
      reply = USUAL_REPLIES.saved;
    } else {
      reply = await applySignOff(db, user, ws, String(a.args.id));
    }
    await db.query("UPDATE assistant_actions SET consumed_at=now(), outcome='done' WHERE id=$1", [a.id]);
    return { available: true, reply, logged: true };
  }, user));
}

const usualBody = z.object({ start: z.string().regex(/^([01]\d|2[0-3]):00$/).optional(), areas: z.array(z.string().trim().min(1).max(40)).max(8).optional() }).strict();
export async function saveUsual(user: string, body: unknown) {
  const parsed = usualBody.parse(body);
  const bad = usualValid(parsed);
  if (bad || (!parsed.start && !parsed.areas?.length)) throw new ApiError(422, 'validation', bad ?? USUAL_REPLIES.badAreas);
  return withSystem(async db => {
    await db.query('INSERT INTO user_preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING', [user]);
    const row = (await db.query('UPDATE user_preferences SET usual_start=coalesce($2::time,usual_start), usual_areas=coalesce($3::text[],usual_areas), updated_at=clock_timestamp() WHERE user_id=$1 RETURNING usual_start,usual_areas', [user, parsed.start ?? null, parsed.areas ?? null])).rows[0];
    return { usual_start: row.usual_start ? String(row.usual_start).slice(0, 5) : null, usual_areas: row.usual_areas as string[] };
  }, user);
}

export async function readUsual(user: string) {
  const row = (await withSystem(db => db.query('SELECT usual_start,usual_areas FROM user_preferences WHERE user_id=$1', [user]), user)).rows[0];
  return { usual_start: row?.usual_start ? String(row.usual_start).slice(0, 5) : null, usual_areas: (row?.usual_areas ?? []) as string[] };
}
