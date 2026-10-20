import type { PoolClient } from 'pg';
import { withSystem } from '../db';
import { ApiError } from '../http';
import { CLOSE_REPLIES, canApproveDraft, canMarkNoPhotos, canSignOff, draftCost, draftLines, noPhotosRefusal, signOffRefusal, type CloseActor, type CloseJob, type DraftLine } from '../job-close';
import { OUTCOME_LABELS } from './job-report';
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
        thanks: job.signed_off_at && actor.role === 'client' ? CLOSE_REPLIES.thanks : null,
      },
    };
  }, user);
}

export async function signOffJob(user: string, ws: string, id: string) {
  return withSystem(async db => ({ reply: await applySignOff(db, user, ws, id) }), user);
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
