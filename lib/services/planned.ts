import { asAgent, withSystem } from '../db';
import { ApiError, missing } from '../http';
import { CLOSE_REPLIES, canSignOff, readSignOff, signOffRefusal, type CloseActor } from '../job-close';
import { z } from 'zod';
import { PHONE_REPLIES, PHONE_REPLIES_AR, readPhoneAsk } from '../phone-change';
import { getPreferences } from './settings';
import { USUAL_REPLIES, readUsualAsk, usualValid } from '../usual-context';
import { warmLead } from '../warm-reply';
import { DAY_REPLIES, readOnTheWay, readPlanApprove, readPlanAsk } from '../day-plan';
import { LEARN_REPLIES, classifyCorrection } from '../learn-habits';
import { applySignOff } from './job-close';
import { getDayPlan, postDayPlan } from './day-plan';
import { saveLearnedRule } from './habits';
import { patchWorkOrder } from './work-orders';
import { inWorkspace, uuid } from './shared';

const PLANNED = ['issue_phone_code', 'set_usual_context', 'sign_off', 'approve_day_plan', 'remember_rule'] as const;

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

async function sayOnTheWay(user: string, ws: string, order: number | null) {
  const found = await inWorkspace(user, ws, async c => {
    const rows = (await c.db.query(`SELECT id, updated_at FROM work_orders
      WHERE workspace_id=$1 AND archived_at IS NULL AND assignee_id=$2 AND status='scheduled' AND on_way_at IS NULL
      AND ($3::int IS NULL OR order_number=$3) ORDER BY scheduled_for NULLS LAST LIMIT 2`, [ws, user, order])).rows;
    if (!rows.length) return { reply: order ? DAY_REPLIES.notYours : DAY_REPLIES.noVisit };
    if (rows.length !== 1) return { reply: DAY_REPLIES.openJob };
    return { id: rows[0].id as string, updated_at: new Date(rows[0].updated_at).toISOString() };
  });
  if (!('id' in found) || typeof found.id !== 'string' || typeof found.updated_at !== 'string') return { available: true as const, reply: 'reply' in found ? String(found.reply) : DAY_REPLIES.openJob };
  await patchWorkOrder(user, ws, found.id, { on_way: true, updated_at: found.updated_at });
  return { available: true as const, reply: DAY_REPLIES.onWay };
}

/** Fixed phrases for the day plan, a remembered rule, the phone check, usual start and sign off. They never call the model. */
export async function planFromWords(user: string, ws: string, words: string) {
  const phone = readPhoneAsk(words);
  const onWay = readOnTheWay(words);
  const planAsk = readPlanAsk(words);
  const planYes = readPlanApprove(words);
  const correction = classifyCorrection(words);
  if (phone.kind === 'none' && !readUsualAsk(words) && !readSignOff(words) && !onWay && !planAsk && !planYes && !correction) return null;
  await inWorkspace(user, ws, async () => undefined);
  const name = await firstName(user);
  const lead = (reply: string) => warmLead(name, reply);
  try {
    if (onWay) {
      const said = await sayOnTheWay(user, ws, onWay.order);
      return { ...said, reply: lead(said.reply) };
    }
    if (planAsk || planYes) {
      const plan = await getDayPlan(user, ws);
      if (!plan.can_plan) return { available: true as const, reply: lead(DAY_REPLIES.onlyPlanner) };
      if (!plan.lines.length) return { available: true as const, reply: lead(DAY_REPLIES.nothingToPlan) };
      if (planYes) return card(user, ws, 'approve_day_plan', { kind: 'morning', fingerprint: plan.fingerprint }, DAY_REPLIES.approve);
      return { available: true as const, reply: lead(`${DAY_REPLIES.planAsk}. ${DAY_REPLIES.seePlan}`) };
    }
    if (correction?.kind === 'once') return { available: true as const, reply: lead(LEARN_REPLIES.once) };
    if (correction?.kind === 'ask') return card(user, ws, 'remember_rule', { rule: correction.rule, company: correction.company }, LEARN_REPLIES.ask);
    // SIGN10 hidden (scope cut Oct 20 2026): no free code sender, so the agent never offers a phone change by code.
    if (phone.kind === 'ask_number' || phone.kind === 'number') {
      // Asked in Arabic, or his app is in Arabic: the fixed line in Gulf Arabic by hand, marked localized so the page leaves it.
      const ar = /[\u0600-\u06FF]/.test(words) || !!(await getPreferences(user)).language?.startsWith('ar');
      if (ar) return { available: true as const, reply: name ? `${name}، ${PHONE_REPLIES_AR.hidden}` : PHONE_REPLIES_AR.hidden, localized: true };
      return { available: true as const, reply: lead(PHONE_REPLIES.hidden) };
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
  const held = await asAgent({ kind: 'assistant' }, () => withSystem(async db => {
    const a = (await db.query('SELECT * FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND id=$3 FOR UPDATE', [ws, user, actionId])).rows[0];
    if (!a || !PLANNED.includes(a.tool)) throw missing();
    if (a.consumed_at) throw new ApiError(409, 'consumed', 'This action has already been confirmed.');
    if (a.declined_at) throw new ApiError(409, 'declined', 'You said no to this one. Ask Agent again.');
    if (new Date(a.expires_at) <= new Date()) throw new ApiError(409, 'expired', 'This action has expired. Ask Agent again.');
    if (a.tool === 'approve_day_plan') return { defer: { kind: String(a.args.kind ?? 'morning'), fingerprint: String(a.args.fingerprint ?? '') }, id: a.id as string };
    let reply: string = PHONE_REPLIES.saved;
    if (a.tool === 'issue_phone_code') throw new ApiError(410, 'removed', PHONE_REPLIES.hidden);
    if (a.tool === 'set_usual_context') {
      const ask = { start: a.args.start ?? undefined, areas: a.args.areas ?? undefined };
      const bad = usualValid(ask);
      if (bad || (!ask.start && !ask.areas)) throw new ApiError(422, 'validation', bad ?? USUAL_REPLIES.badAreas);
      await db.query('INSERT INTO user_preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING', [user]);
      await db.query('UPDATE user_preferences SET usual_start=coalesce($2::time,usual_start), usual_areas=coalesce($3::text[],usual_areas), updated_at=clock_timestamp() WHERE user_id=$1', [user, ask.start ?? null, ask.areas ?? null]);
      reply = USUAL_REPLIES.saved;
    } else if (a.tool === 'remember_rule') {
      reply = await saveLearnedRule(db, user, ws, String(a.args.rule ?? ''), !!a.args.company);
    } else {
      reply = await applySignOff(db, user, ws, String(a.args.id));
    }
    await db.query("UPDATE assistant_actions SET consumed_at=now(), outcome='done' WHERE id=$1", [a.id]);
    return { available: true as const, reply, logged: true };
  }, user));
  const pending = held && 'defer' in held ? held.defer : undefined;
  if (pending) {
    let reply: string = DAY_REPLIES.dayChanged;
    try {
      const saved = await postDayPlan(user, ws, { action: 'approve', kind: pending.kind, fingerprint: pending.fingerprint });
      reply = String(saved.reply);
    } catch (error) {
      reply = calm(error);
    }
    await asAgent({ kind: 'assistant' }, () => withSystem(db => db.query("UPDATE assistant_actions SET consumed_at=now(), outcome='done' WHERE id=$1 AND user_id=$2 AND consumed_at IS NULL", [held.id, user]), user));
    return { available: true, reply, logged: true };
  }
  return held;
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
