import { z } from 'zod';
import { scheduledInstant } from '../dates';
import { withSystem } from '../db';
import { ApiError, missing } from '../http';
import {
  DAY_REPLIES, arrivalWindow, canConfirmGate, canPlanDay, morningPlan, needsGate, planFingerprint, planSavedReply,
  sickMove, urgentReshuffle, watchLate, type PlanActor, type PlanJob, type PlanLine, type PlanPerson,
} from '../day-plan';
import { offReason } from './time-off';
import { sendPush } from './push';
import { uuid } from './shared';

const denied = () => new ApiError(403, 'forbidden', DAY_REPLIES.onlyPlanner);
type Actor = PlanActor & { demo: boolean; tz: string; today: string; tomorrow: string; currency: string };
type Row = {
  id: string; order_number: number; title: string; trade: string | null; area: string | null; priority: string; status: string;
  assignee_id: string | null; hour: number | null; running_late: boolean; client_id: string; created_by: string | null;
  gate_pass: string | null; access_notes: string | null; day: string | null; window_hours: number;
};

async function actorOf(db: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[] }> }, user: string, ws: string): Promise<Actor> {
  uuid.parse(ws);
  const m = (await db.query('SELECT role,staff_kind,client_kind,client_id FROM members WHERE workspace_id=$1 AND user_id=$2 AND archived_at IS NULL', [ws, user])).rows[0];
  if (!m?.role) throw missing();
  const w = (await db.query(`SELECT timezone, is_demo, currency,
    (now() AT TIME ZONE timezone)::date::text AS today,
    ((now() AT TIME ZONE timezone)::date + 1)::text AS tomorrow
    FROM workspaces WHERE id=$1`, [ws])).rows[0];
  if (!w) throw missing();
  return { role: m.role, staff_kind: m.staff_kind, client_kind: m.client_kind, user, client_id: m.client_id, demo: !!w.is_demo, tz: w.timezone, today: w.today, tomorrow: w.tomorrow, currency: w.currency };
}

async function load(db: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[] }> }, user: string, ws: string, actor: Actor) {
  const peopleRows = (await db.query(`SELECT m.user_id, u.name, m.trades, m.areas FROM members m JOIN users u ON u.id=m.user_id
    WHERE m.workspace_id=$1 AND m.archived_at IS NULL AND m.role='technician' ORDER BY u.name`, [ws])).rows;
  const jobs = (await db.query(`SELECT w.id, w.order_number, w.title, w.trade, s.area, w.priority, w.status, w.assignee_id,
      CASE WHEN w.scheduled_for IS NULL THEN NULL ELSE EXTRACT(HOUR FROM w.scheduled_for AT TIME ZONE $2)::int END AS hour,
      w.running_late_at IS NOT NULL AS running_late, w.client_id, w.created_by, w.gate_pass, s.access_notes,
      CASE WHEN w.scheduled_for IS NULL THEN NULL ELSE (w.scheduled_for AT TIME ZONE $2)::date::text END AS day,
      w.window_hours
    FROM work_orders w JOIN sites s ON s.workspace_id=w.workspace_id AND s.id=w.site_id
    WHERE w.workspace_id=$1 AND w.archived_at IS NULL AND w.status NOT IN ('done','cancelled')
      AND (w.status='open' OR (w.scheduled_for AT TIME ZONE $2)::date IN ($3::date,$4::date))`, [ws, actor.tz, actor.today, actor.tomorrow])).rows as Row[];
  const people: PlanPerson[] = [];
  for (const person of peopleRows) {
    const away = await offReason(db as never, ws, person.user_id, actor.today);
    const booked = jobs.filter(job => job.assignee_id === person.user_id && job.day === actor.today && job.hour != null).map(job => job.hour as number);
    people.push({ id: person.user_id, name: person.name, trades: person.trades ?? [], areas: person.areas ?? [], away, booked });
  }
  const planJobs: PlanJob[] = jobs.filter(job => job.day === actor.today || job.status === 'open').map(job => ({
    id: job.id, order: job.order_number, title: job.title, trade: job.trade, area: job.area, priority: job.priority,
    status: job.status, assignee_id: job.assignee_id, hour: job.hour, running_late: job.running_late,
  }));
  return { people, jobs, planJobs, viewer: user };
}

function pack(lines: PlanLine[], summary: string) {
  return { lines, summary, fingerprint: planFingerprint(lines) };
}

/** Read the morning plan, tomorrow's gate list and late visits. Selects only. */
export async function getDayPlan(user: string, ws: string) {
  return withSystem(async db => {
    const actor = await actorOf(db, user, ws);
    const { people, jobs, planJobs } = await load(db, user, ws, actor);
    const planner = canPlanDay(actor);
    const morning = planner || actor.role === 'staff' ? morningPlan(planJobs, people) : { lines: [] as PlanLine[], summary: DAY_REPLIES.nothingToPlan };
    const watch = (planner ? planJobs : []).map(job => watchLate(job, people)).filter((line): line is PlanLine => !!line)
      .map(line => ({ ...line, fingerprint: planFingerprint([line]) }));
    const gates = jobs.filter(job => needsGate({ day: job.day, tomorrow: actor.tomorrow, access: job.access_notes, gate: job.gate_pass, status: job.status }) && canConfirmGate(actor, job))
      .map(job => ({ id: job.id, order: job.order_number, title: job.title, window: job.hour == null ? null : arrivalWindow(job.hour, job.window_hours).label }));
    const visits = actor.demo && planner ? jobs.filter(job => job.day === actor.today && job.status === 'scheduled').map(job => ({ id: job.id, order: job.order_number, title: job.title })) : [];
    return {
      can_plan: planner,
      demo: actor.demo && planner,
      today: actor.today,
      summary: morning.summary,
      fingerprint: planFingerprint(morning.lines),
      lines: morning.lines,
      watch,
      gates,
      visits,
      people: planner ? people.map(person => ({ id: person.id, name: person.name, away: person.away })) : [],
    };
  }, user);
}

const body = z.object({
  action: z.enum(['preview', 'approve', 'confirm_gate', 'skip_gate', 'mark_late']),
  kind: z.enum(['morning', 'watch', 'urgent', 'sick']).optional(),
  fingerprint: z.string().max(12000).optional(),
  job_id: uuid.optional(),
  person_id: uuid.optional(),
}).strict();

function proposal(kind: string, planJobs: PlanJob[], people: PlanPerson[], jobId?: string, personId?: string) {
  if (kind === 'morning') return morningPlan(planJobs, people);
  if (kind === 'watch') {
    const job = planJobs.find(row => row.id === jobId);
    const line = job ? watchLate(job, people) : null;
    const lines = line ? [line] : [];
    return { lines, summary: lines.length ? lines[0].why : DAY_REPLIES.nothingToPlan };
  }
  if (kind === 'urgent') {
    const job = planJobs.find(row => row.id === jobId);
    if (!job) return { lines: [] as PlanLine[], summary: DAY_REPLIES.nothingToPlan };
    const moved = urgentReshuffle({ ...job, priority: 'urgent' }, planJobs, people);
    return { lines: moved.lines, summary: DAY_REPLIES.approve };
  }
  const moved = sickMove(personId ?? '', planJobs, people);
  return { lines: moved.lines, summary: moved.summary };
}

async function applyLines(db: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> }, ws: string, actor: Actor, kind: string, lines: PlanLine[], urgentId?: string) {
  const day = actor.today;
  for (const line of lines) {
    if (line.kind !== 'place' || !line.assignee_id || line.hour == null) continue;
    const when = scheduledInstant(day, actor.tz, line.hour);
    if (!when) continue;
    await db.query(`UPDATE work_orders SET assignee_id=$3, scheduled_for=$4,
      status=CASE WHEN status='open' THEN 'scheduled' ELSE status END,
      priority=CASE WHEN $5::bool THEN 'urgent' ELSE priority END,
      running_late_at=CASE WHEN $6::bool THEN NULL ELSE running_late_at END
      WHERE workspace_id=$1 AND id=$2 AND archived_at IS NULL`, [ws, line.job_id, line.assignee_id, when, kind === 'urgent' && line.job_id === urgentId, kind === 'watch']);
  }
}

/** Preview does not write. Approve writes only after the signed in planner says yes, then tells the other people. */
export async function postDayPlan(user: string, ws: string, input: unknown) {
  const d = body.parse(input);
  if (d.action === 'confirm_gate' || d.action === 'skip_gate') {
    if (!d.job_id) throw new ApiError(422, 'validation', DAY_REPLIES.gateQuiet);
    return withSystem(async db => {
      const actor = await actorOf(db, user, ws);
      const job = (await db.query(`SELECT w.id, w.client_id, w.created_by, w.status, w.gate_pass, s.access_notes,
        (w.scheduled_for AT TIME ZONE $3)::date::text AS day
        FROM work_orders w JOIN sites s ON s.workspace_id=w.workspace_id AND s.id=w.site_id
        WHERE w.workspace_id=$1 AND w.id=$2 AND w.archived_at IS NULL`, [ws, d.job_id, actor.tz])).rows[0];
      if (!job) throw missing();
      if (!canConfirmGate(actor, job)) throw new ApiError(403, 'forbidden', DAY_REPLIES.onlyGate);
      if (!needsGate({ day: job.day, tomorrow: actor.tomorrow, access: job.access_notes, gate: job.gate_pass, status: job.status })) throw new ApiError(409, 'closed', DAY_REPLIES.gateQuiet);
      const gate = d.action === 'confirm_gate' ? 'confirmed' : 'not_needed';
      await db.query('UPDATE work_orders SET gate_pass=$3, gate_pass_at=clock_timestamp(), gate_pass_by=$4 WHERE workspace_id=$1 AND id=$2', [ws, d.job_id, gate, user]);
      return { reply: d.action === 'confirm_gate' ? DAY_REPLIES.gateConfirmed : DAY_REPLIES.gateSkipped };
    }, user);
  }
  if (d.action === 'mark_late') {
    if (!d.job_id) throw new ApiError(422, 'validation', DAY_REPLIES.notDemo);
    return withSystem(async db => {
      const actor = await actorOf(db, user, ws);
      if (!actor.demo || !canPlanDay(actor)) throw new ApiError(403, 'forbidden', DAY_REPLIES.notDemo);
      const row = (await db.query(`UPDATE work_orders SET running_late_at=clock_timestamp()
        WHERE workspace_id=$1 AND id=$2 AND status IN ('scheduled','in_progress') AND archived_at IS NULL RETURNING id`, [ws, d.job_id])).rows[0];
      if (!row) throw missing();
      return { reply: DAY_REPLIES.markedLate };
    }, user);
  }
  const kind = d.kind ?? 'morning';
  const preview = await withSystem(async db => {
    const actor = await actorOf(db, user, ws);
    if (!canPlanDay(actor)) throw denied();
    if (kind === 'sick' && d.person_id) {
      const tech = (await db.query("SELECT 1 FROM members WHERE workspace_id=$1 AND user_id=$2 AND role='technician' AND archived_at IS NULL", [ws, d.person_id])).rows[0];
      if (!tech) throw missing();
    }
    const { people, planJobs } = await load(db, user, ws, actor);
    const next = proposal(kind, planJobs, people, d.job_id, d.person_id);
    return { actor, next: pack(next.lines, next.summary) };
  }, user);
  if (d.action === 'preview') return { ...preview.next, reply: preview.next.summary };
  if (d.fingerprint !== preview.next.fingerprint) throw new ApiError(409, 'conflict', DAY_REPLIES.dayChanged);
  const placed = preview.next.lines.filter(line => line.kind === 'place' && line.assignee_id && line.hour != null);
  if (!placed.length) return { reply: DAY_REPLIES.nothingToPlan, lines: preview.next.lines };
  const told = await withSystem(async db => {
    const actor = await actorOf(db, user, ws);
    if (!canPlanDay(actor)) throw denied();
    const { people, planJobs } = await load(db, user, ws, actor);
    const built = proposal(kind, planJobs, people, d.job_id, d.person_id);
    const again = pack(built.lines, built.summary);
    if (again.fingerprint !== d.fingerprint) throw new ApiError(409, 'conflict', DAY_REPLIES.dayChanged);
    await applyLines(db, ws, actor, kind, again.lines, d.job_id);
    if (kind === 'sick' && d.person_id) {
      await db.query(`INSERT INTO time_off(workspace_id,user_id,kind,starts_on,ends_on,note,created_by)
        SELECT $1,$2,'sick',$3::date,$3::date,'Off sick',$4
        WHERE NOT EXISTS (SELECT 1 FROM time_off WHERE workspace_id=$1 AND user_id=$2 AND status='approved' AND starts_on<=$3::date AND ends_on>=$3::date)`,
        [ws, d.person_id, actor.today, user]);
    }
    const notes: { who: string; body: string; job: string; title: string }[] = [];
    const note = kind === 'morning' ? DAY_REPLIES.dayReady : DAY_REPLIES.windowChanged;
    for (const line of again.lines) {
      if (line.kind !== 'place' || !line.assignee_id || line.assignee_id === user) continue;
      notes.push({ who: line.assignee_id, body: note, job: line.job_id, title: line.title });
    }
    if (kind === 'sick' && d.person_id && d.person_id !== user) notes.push({ who: d.person_id, body: DAY_REPLIES.sickMoved, job: placed[0].job_id, title: placed[0].title });
    for (const note of notes) {
      await db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,work_order_title,job_step_body)
        VALUES($1,$2,'day_plan','work_orders',$3,$4,$5,$6)`, [note.who, ws, note.job, user, note.title, note.body]);
    }
    return [...new Set(notes.map(note => note.who))];
  }, user);
  const pushCount = told.length ? await sendPush(told, { title: 'Your day', body: DAY_REPLIES.dayReady, url: '/today', tag: `dayplan-${ws}` }) : 0;
  return { reply: planSavedReply(pushCount), saved: true };
}
