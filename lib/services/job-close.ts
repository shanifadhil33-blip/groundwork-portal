import type { PoolClient } from 'pg';
import { withSystem } from '../db';
import { ApiError } from '../http';
import { CLOSE_REPLIES, canApproveDraft, canMarkNoPhotos, canSignOff, draftCost, draftLines, lowRatingRecipients, noPhotosRefusal, signOffRefusal, type CloseActor, type CloseJob, type DraftLine } from '../job-close';
import { disclosedCost } from '../day-plan';
import { OUTCOME_LABELS } from './job-report';
import { sendPush } from './push';
import { uuid } from './shared';

const denied = () => new ApiError(403, 'forbidden', 'You cannot make this change on this job.');
type JobRow = CloseJob & { id: string; title: string; order_number: number; archived_at?: string | null; report_at?: string | null; report_problem?: string | null; report_work?: string | null };

async function context(db: PoolClient, user: string, ws: string, id: string, lock = true) {
  uuid.parse(ws); uuid.parse(id);
  const m = (await db.query('SELECT role,staff_kind,client_kind,client_id,is_owner FROM members WHERE workspace_id=$1 AND user_id=$2 AND archived_at IS NULL', [ws, user])).rows[0];
  if (!m) throw denied();
  const job = (await db.query(`SELECT * FROM work_orders WHERE workspace_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`, [ws, id])).rows[0] as JobRow | undefined;
  if (!job || job.archived_at || m.role === 'technician' && job.assignee_id !== user || m.role === 'client' && (job.client_id !== m.client_id || (m.client_kind === 'household' && job.created_by !== user))) throw denied();
  const actor: CloseActor = { role: m.role, staff_kind: m.staff_kind, client_kind: m.client_kind, user, client_id: m.client_id, is_owner: !!m.is_owner };
  return { actor, job };
}

async function photoCount(db: PoolClient, ws: string, id: string) {
  const photos = (await db.query("SELECT kind,count(*)::int AS n FROM job_photos WHERE workspace_id=$1 AND work_order_id=$2 GROUP BY kind", [ws, id])).rows as { kind: string; n: number }[];
  const before = photos.find(row => row.kind === 'before')?.n ?? 0;
  const after = photos.find(row => row.kind === 'after')?.n ?? 0;
  return { before, after, total: before + after };
}

export async function applySignOff(db: PoolClient, user: string, ws: string, id: string) {
  const { actor, job } = await context(db, user, ws, id);
  const why = signOffRefusal(actor, job);
  if (why || !canSignOff(actor, job)) throw new ApiError(403, 'forbidden', why ?? CLOSE_REPLIES.onlyClient);
  await db.query("SELECT set_config('app.close_job',$1,true)", [job.id]);
  const saved = await db.query('UPDATE work_orders SET signed_off_at=clock_timestamp(), signed_off_by=$3 WHERE workspace_id=$1 AND id=$2 AND signed_off_at IS NULL RETURNING id', [ws, id, user]);
  if (!saved.rowCount) throw new ApiError(409, 'closed', CLOSE_REPLIES.already);
  const lines = draftLines(job);
  if (job.report_outcome === 'fixed' && lines.length) {
    await db.query(`INSERT INTO draft_invoices(workspace_id,work_order_id,lines) VALUES($1,$2,$3::jsonb)
      ON CONFLICT (workspace_id, work_order_id) DO NOTHING`, [ws, id, JSON.stringify(lines)]);
  }
  return CLOSE_REPLIES.signed;
}


export async function getJobClose(user: string, ws: string, id: string) {
  return withSystem(async db => {
    const { actor, job } = await context(db, user, ws, id, false);
    const photos = await photoCount(db, ws, id);
    const draftRow = (await db.query('SELECT lines,status FROM draft_invoices WHERE workspace_id=$1 AND work_order_id=$2', [ws, id])).rows[0] as { lines: DraftLine[]; status: string } | undefined;
    const lines = draftRow?.lines ?? [];
    const name = (await db.query('SELECT name FROM visible_assignee($1,$2)', [ws, id])).rows[0]?.name as string | undefined;
    const outcome = job.report_outcome && job.report_outcome in OUTCOME_LABELS ? OUTCOME_LABELS[job.report_outcome as keyof typeof OUTCOME_LABELS] : 'Done';
    const money = (await db.query(`SELECT w.currency, o.payment_status, o.quote_status, o.quote_amount,
      (SELECT s.visit_charge_shown FROM job_suggestions s WHERE s.workspace_id=o.workspace_id AND s.work_order_id=o.id AND s.visit_charge_shown IS NOT NULL ORDER BY s.decided_at DESC NULLS LAST LIMIT 1) AS visit_shown
      FROM work_orders o JOIN workspaces w ON w.id=o.workspace_id WHERE o.workspace_id=$1 AND o.id=$2`, [ws, id])).rows[0];
    const shown = money ? disclosedCost(actor.role, money, String(money.currency ?? '')) : null;
    return {
      can_sign_off: canSignOff(actor, job),
      signed_off: !!job.signed_off_at,
      can_mark: canMarkNoPhotos(actor, job, photos.total),
      marked: !!job.no_photos_at,
      photos,
      draft: draftRow && actor.role === 'admin' ? { lines, status: draftRow.status, cost: draftCost(lines), can_keep: draftRow.status === 'waiting' && canApproveDraft(actor), waiting: CLOSE_REPLIES.waitingOwner } : null,
      card: {
        problem: job.report_problem ?? '',
        fix: job.report_work ?? '',
        outcome,
        technician: name ?? '',
        when: job.report_at ?? null,
        // The draft bill is unsent and owner only, so its sample amounts never reach the client or technician.
        cost: actor.role === 'admin' ? draftCost(lines) : null,
        waiting: actor.role === 'admin' && lines.length > 0 && draftCost(lines) == null ? CLOSE_REPLIES.waitingOwner : null,
        thanks: job.signed_off_at && actor.role === 'client' && (await db.query('SELECT 1 FROM job_ratings WHERE work_order_id=$1', [id])).rows[0] ? CLOSE_REPLIES.thanks : null,
        shown_label: shown?.label ?? null,
        shown_amount: shown?.amount ?? null,
      },
    };
  }, user);
}

const rateOnly = 'Only the client rates the job.';
const pickStars = 'Pick a rating from one to five.';

async function writeRating(db: PoolClient, user: string, ws: string, id: string, clientId: string, stars: number, thanks: string) {
  const saved = (await db.query(`INSERT INTO job_ratings(work_order_id,workspace_id,client_id,rated_by,stars,note)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (work_order_id) DO NOTHING RETURNING stars`, [id, ws, clientId, user, stars, thanks])).rows[0];
  if (!saved || stars > 2) return [] as string[];
  const people = (await db.query("SELECT user_id,role,staff_kind FROM members WHERE workspace_id=$1 AND archived_at IS NULL AND role IN ('admin','staff')", [ws])).rows;
  const job = (await db.query('SELECT assignee_id, title, order_number FROM work_orders WHERE workspace_id=$1 AND id=$2', [ws, id])).rows[0];
  const to = lowRatingRecipients(people, job?.assignee_id ?? null).filter(id => id !== user);
  if (to.length) await db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,work_order_title,job_step_body)
    SELECT unnest($1::uuid[]),$2,'low_rating','work_orders',$3,$4,$5`, [to, ws, id, job?.title ?? '', 'A client gave a low rating. Open the job.']);
  return to;
}

/** The client signs off, rates and thanks in one step. The office signs off with no rating. A low rating is recorded for supervisors and the reply never says a message was sent. */
export async function signOffJob(user: string, ws: string, id: string, input?: { stars?: number; thanks?: string }) {
  const stars = input?.stars;
  const thanks = (input?.thanks ?? '').trim();
  const saved = await withSystem(async db => {
    const { actor, job } = await context(db, user, ws, id);
    if (actor.role !== 'client' && (stars || thanks)) throw new ApiError(422, 'validation', rateOnly);
    if (actor.role === 'client' && (!stars || stars < 1 || stars > 5)) throw new ApiError(422, 'validation', pickStars);
    const reply = await applySignOff(db, user, ws, id);
    const to = actor.role === 'client' && stars ? await writeRating(db, user, ws, id, String(actor.client_id), stars, thanks) : [];
    return { reply, to, title: job.title, order: job.order_number };
  }, user);
  if (saved.to.length) await sendPush(saved.to, { title: 'Low rating', body: `Job #${saved.order} ${saved.title}`, url: `/work-orders/${id}`, tag: `rating-${id}` });
  return { reply: saved.reply };
}

export async function thankJob(user: string, ws: string, id: string, input?: { stars?: number; thanks?: string }) {
  const stars = input?.stars;
  const thanks = (input?.thanks ?? '').trim();
  const saved = await withSystem(async db => {
    const { actor, job } = await context(db, user, ws, id);
    if (actor.role !== 'client') throw new ApiError(403, 'forbidden', rateOnly);
    if (!job.signed_off_at) throw new ApiError(409, 'closed', CLOSE_REPLIES.notDone);
    const existing = (await db.query('SELECT stars FROM job_ratings WHERE work_order_id=$1', [id])).rows[0];
    if (!existing && (!stars || stars < 1 || stars > 5)) throw new ApiError(422, 'validation', pickStars);
    const to = !existing && stars ? await writeRating(db, user, ws, id, String(actor.client_id), stars, thanks) : [];
    return { reply: CLOSE_REPLIES.thanks, to, title: job.title, order: job.order_number };
  }, user);
  if (saved.to.length) await sendPush(saved.to, { title: 'Low rating', body: `Job #${saved.order} ${saved.title}`, url: `/work-orders/${id}`, tag: `rating-${id}` });
  return { reply: saved.reply };
}

export async function markNoPhotos(user: string, ws: string, id: string) {
  return withSystem(async db => {
    const { actor, job } = await context(db, user, ws, id);
    const photos = await photoCount(db, ws, id);
    const why = noPhotosRefusal(actor, job, photos.total);
    if (why) throw new ApiError(403, 'forbidden', why);
    await db.query("SELECT set_config('app.close_job',$1,true)", [job.id]);
    await db.query('UPDATE work_orders SET no_photos_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 AND no_photos_at IS NULL', [ws, id]);
    return { reply: CLOSE_REPLIES.marked };
  }, user);
}

export async function keepDraft(user: string, ws: string, id: string) {
  return withSystem(async db => {
    const { actor } = await context(db, user, ws, id);
    if (!canApproveDraft(actor)) throw new ApiError(403, 'forbidden', CLOSE_REPLIES.onlyOwner);
    const row = (await db.query("UPDATE draft_invoices SET status='kept', kept_by=$3, kept_at=clock_timestamp() WHERE workspace_id=$1 AND work_order_id=$2 AND status='waiting' RETURNING id", [ws, id, user])).rows[0];
    if (!row) throw new ApiError(409, 'closed', CLOSE_REPLIES.kept);
    return { reply: CLOSE_REPLIES.kept };
  }, user);
}
