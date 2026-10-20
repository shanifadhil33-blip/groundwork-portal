/** SCHED03 to SCHED09, NOTIF07. Pure rules. Nothing here writes or claims a message was sent. */

export const DAY_START = 6;
export const DAY_END = 20;

export const DAY_REPLIES = {
  saved: 'The plan is saved. Each person can see his day in the app.',
  noPush: 'No phone notification went out.',
  pushOn: 'Phone notifications went to the people who turned them on.',
  markedLate: 'Marked late. No message was sent.',
  dayChanged: 'Look again. The day changed.',
  onlyPlanner: 'Only the owner or a supervisor can approve the day.',
  onlyGate: 'Only the office, the client, or the facility manager can confirm a gate pass.',
  noVisit: 'You have no visit ready to start.',
  notYours: 'This visit is not yours.',
  openJob: 'Open the job and tap On the way.',
  onWay: 'On the way. The client can see it in the app.',
  noGate: 'Every job for tomorrow has a gate pass, or none is needed.',
  gateConfirmed: 'Gate pass confirmed. The team can see it on the job.',
  gateSkipped: 'Marked. No gate pass is needed for this visit.',
  gateQuiet: 'This visit does not need a gate pass.',
  seePlan: 'Open Home to see the plan. Nothing is saved until you say yes.',
  gateAsk: 'Jobs with no gate pass tomorrow',
  planAsk: 'Today\'s plan',
  nothingToPlan: 'Nothing is waiting for a morning plan.',
  approve: 'Approve this plan? Nothing changes until you say yes.',
  windowChanged: 'Your visit window changed. Open the job to see the new time.',
  dayReady: 'Your day is ready. Open Today.',
  sickMoved: 'Your jobs were moved because you are off sick.',
  noBackup: 'No one else covers this trade.',
  notDemo: 'That practice control is only in the demo company.',
  visitCharge: 'Visit charge',
  agreed: 'Price you agreed',
  covered: 'Covered by contract',
  arrival: 'Arrival window',
} as const;

export function planSavedReply(pushCount: number) {
  return pushCount > 0 ? `${DAY_REPLIES.saved} ${DAY_REPLIES.pushOn}` : `${DAY_REPLIES.saved} ${DAY_REPLIES.noPush}`;
}

export function clockLabel(hour: number) {
  const n = ((hour % 24) + 24) % 24;
  const face = n % 12 || 12;
  return `${face} ${n < 12 ? 'AM' : 'PM'}`;
}

/** A visit is a window, never an exact minute. The office still stores the start hour. */
export function arrivalWindow(hour: number, span = 2) {
  const safe = Number.isFinite(hour) ? Math.trunc(hour) : DAY_START;
  const start = Math.max(DAY_START, Math.min(DAY_END - 1, safe));
  const end = Math.min(DAY_END, start + Math.max(1, Math.trunc(span) || 2));
  return { start, end, label: `${clockLabel(start)} to ${clockLabel(end)}` };
}

export function hourInZone(iso: string, timeZone: string) {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  const n = Number(hour);
  return Number.isFinite(n) ? n : DAY_START;
}

export function arrivalLabel(iso: string, timeZone: string, span = 2) {
  return arrivalWindow(hourInZone(iso, timeZone), span).label;
}

export type PlanActor = { role: string; staff_kind?: string | null; client_kind?: string | null; user: string; client_id?: string | null };
export type GateJob = { client_id: string; created_by?: string | null };

export function canPlanDay(actor: PlanActor) {
  return actor.role === 'admin' || (actor.role === 'staff' && actor.staff_kind !== 'office');
}

export function canConfirmGate(actor: PlanActor, job: GateJob) {
  if (actor.role === 'admin' || actor.role === 'staff') return true;
  if (actor.role !== 'client' || !actor.client_id || actor.client_id !== job.client_id) return false;
  if ((actor.client_kind ?? 'manager') === 'household') return job.created_by === actor.user;
  return true;
}

export function needsGate(input: { day: string | null; tomorrow: string; access: string | null; gate: string | null; status: string }) {
  if (!input.day || input.day !== input.tomorrow) return false;
  if (input.status === 'done' || input.status === 'cancelled') return false;
  if (input.gate === 'confirmed' || input.gate === 'not_needed') return false;
  if (input.gate === 'waiting') return true;
  return !!input.access?.trim();
}

export type PlanPerson = { id: string; name: string; trades: string[]; areas: string[]; away: string | null; booked: number[] };
export type PlanJob = {
  id: string; order: number; title: string; trade: string | null; area: string | null;
  priority: string; status: string; assignee_id: string | null; hour: number | null; running_late?: boolean;
};
export type PlanLine = {
  job_id: string; order: number; title: string; assignee_id: string | null; assignee_name: string | null;
  hour: number | null; window: string | null; why: string; kind: 'place' | 'flag';
};

const RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const covers = (person: PlanPerson, job: PlanJob) =>
  (!job.trade || person.trades.length === 0 || person.trades.includes(job.trade))
  && (!job.area || person.areas.length === 0 || person.areas.includes(job.area));

function rankPeople(job: PlanJob, people: PlanPerson[], load: Map<string, number[]>) {
  return people.filter(person => !person.away && covers(person, job)).sort((a, b) => {
    const trade = (person: PlanPerson) => job.trade && person.trades.includes(job.trade) ? 0 : 1;
    const area = (person: PlanPerson) => job.area && person.areas.includes(job.area) ? 0 : 1;
    return trade(a) - trade(b) || area(a) - area(b) || (load.get(a.id)?.length ?? 0) - (load.get(b.id)?.length ?? 0);
  });
}

function freeHour(taken: number[], from: number) {
  for (let hour = from; hour <= DAY_END - 2; hour += 2) {
    if (!taken.includes(hour) && !taken.includes(hour + 1)) return hour;
  }
  return null;
}

function place(job: PlanJob, person: PlanPerson, hour: number, why: string): PlanLine {
  return {
    job_id: job.id, order: job.order, title: job.title, assignee_id: person.id, assignee_name: person.name,
    hour, window: arrivalWindow(hour).label, why, kind: 'place',
  };
}

function flag(job: PlanJob, why: string): PlanLine {
  return { job_id: job.id, order: job.order, title: job.title, assignee_id: null, assignee_name: null, hour: null, window: null, why, kind: 'flag' };
}

export function awayReason(name: string, kind: string | null, weekly: boolean) {
  if (kind === 'leave') return `${name} is on leave that day.`;
  if (kind === 'sick') return `${name} is off sick that day.`;
  if (kind === 'off' || weekly) return `${name} is off that day.`;
  return null;
}

/** Open jobs only. People on leave or a day off are skipped. A clash is a flag, not a silent overlap. */
export function morningPlan(jobs: PlanJob[], people: PlanPerson[], startHour = 8) {
  const open = jobs.filter(job => job.status === 'open' && !job.assignee_id)
    .sort((a, b) => (RANK[a.priority] ?? 2) - (RANK[b.priority] ?? 2) || a.order - b.order);
  const load = new Map(people.map(person => [person.id, [...person.booked]]));
  const lines: PlanLine[] = [];
  for (const job of open) {
    const person = rankPeople(job, people, load)[0];
    if (!person) {
      const away = people.find(candidate => candidate.away && job.trade && candidate.trades.includes(job.trade));
      lines.push(flag(job, away?.away ?? DAY_REPLIES.noBackup));
      continue;
    }
    const hour = freeHour(load.get(person.id) ?? [], startHour);
    if (hour == null) {
      lines.push(flag(job, `${person.name} has no free window today.`));
      continue;
    }
    load.get(person.id)?.push(hour);
    const why = job.trade && person.trades.includes(job.trade) ? `${person.name} covers this trade.` : `${person.name} is free.`;
    lines.push(place(job, person, hour, why));
  }
  const placed = lines.filter(line => line.kind === 'place').length;
  const summary = lines.length ? `${placed} of ${lines.length} open jobs can be placed. Nothing is saved until you say yes.` : DAY_REPLIES.nothingToPlan;
  return { lines, summary };
}

/** A late job gets a later window and a free backup. Nothing is told to the client until yes. */
export function watchLate(job: PlanJob, people: PlanPerson[]): PlanLine | null {
  if (!job.running_late || job.hour == null) return null;
  const next = arrivalWindow(Math.min(job.hour + 2, DAY_END - 1));
  const backup = people.find(person => person.id !== job.assignee_id && !person.away && covers(person, job) && person.booked.length === 0);
  const current = people.find(person => person.id === job.assignee_id);
  const who = backup ?? current;
  if (!who) return flag(job, DAY_REPLIES.noBackup);
  return {
    job_id: job.id, order: job.order, title: job.title, assignee_id: who.id, assignee_name: who.name,
    hour: next.start, window: next.label,
    why: backup ? `Offer ${next.label} and ${backup.name} as backup. Nothing is sent until you say yes.` : `Offer ${next.label}. No backup is free. Nothing is sent until you say yes.`,
    kind: 'place',
  };
}

/** The urgent job takes the earliest fitting visit. That visit moves two hours later. */
export function urgentReshuffle(urgent: PlanJob, jobs: PlanJob[], people: PlanPerson[]) {
  const candidates = jobs
    .filter(job => job.id !== urgent.id && job.assignee_id && job.hour != null && job.status === 'scheduled' && job.priority !== 'urgent')
    .sort((a, b) => (a.hour ?? 0) - (b.hour ?? 0));
  const displaced = candidates.find(job => {
    const person = people.find(candidate => candidate.id === job.assignee_id);
    return person && !person.away && covers(person, urgent);
  });
  if (!displaced || displaced.hour == null || !displaced.assignee_id) return { lines: [flag(urgent, DAY_REPLIES.noBackup)] as PlanLine[] };
  const person = people.find(candidate => candidate.id === displaced.assignee_id)!;
  const movedHour = freeHour([displaced.hour, ...(person.booked.filter(hour => hour !== displaced.hour))], Math.min(displaced.hour + 2, DAY_END - 2));
  const lines = [place(urgent, person, displaced.hour, `${person.name} takes the urgent call.`)];
  if (movedHour == null) lines.push(flag(displaced, `${person.name} has no later window for the job that moves.`));
  else lines.push(place(displaced, person, movedHour, `This visit moves so the urgent call can come first.`));
  return { lines };
}

/** His remaining visits move to someone else. He is treated as away. */
export function sickMove(personId: string, jobs: PlanJob[], people: PlanPerson[]) {
  const his = jobs.filter(job => job.assignee_id === personId && (job.status === 'scheduled' || job.status === 'in_progress'));
  const others = people.map(person => person.id === personId ? { ...person, away: person.away ?? 'Off sick today.' } : person);
  const load = new Map(others.map(person => [person.id, [...person.booked]]));
  if (!his.length) return { lines: [] as PlanLine[], summary: 'He has no visits left to move.' };
  const lines = his.map(job => {
    const person = rankPeople(job, others, load)[0];
    if (!person) return flag(job, DAY_REPLIES.noBackup);
    const hour = job.hour ?? freeHour(load.get(person.id) ?? [], 8) ?? 8;
    if ((load.get(person.id) ?? []).includes(hour)) {
      const later = freeHour(load.get(person.id) ?? [], hour);
      if (later == null) return flag(job, `${person.name} has no free window today.`);
      load.get(person.id)?.push(later);
      return place(job, person, later, `${person.name} covers this visit.`);
    }
    load.get(person.id)?.push(hour);
    return place(job, person, hour, `${person.name} covers this visit.`);
  });
  return { lines, summary: 'Nothing moves until you say yes.' };
}

export function planFingerprint(lines: PlanLine[]) {
  return lines.map(line => [line.job_id, line.assignee_id ?? '', line.hour ?? '', line.kind, line.why].join(':')).join('|');
}

const norm = (text: string) => text.normalize('NFC').trim().replace(/[.!?؟]+$/u, '').replace(/\s+/gu, ' ').toLowerCase();

export function readOnTheWay(text: string) {
  const words = norm(text);
  const english = /^(?:i am|i'm|im) on the way(?: to (?:wo\s*)?(\d+))?$/.exec(words);
  const arabic = /^(?:انا|أنا) (?:في|على) الطريق(?:\s+(\d+))?$/.exec(text.normalize('NFC').trim());
  const hit = english || arabic;
  if (!hit) return null;
  return { order: hit[1] ? Number(hit[1]) : null };
}

export function readPlanApprove(text: string) {
  const words = norm(text);
  if (/^approve (?:today's plan|the morning plan|this plan)$/.test(words)) return 'morning' as const;
  if (norm(text) === 'اعتمد خطة اليوم' || norm(text) === 'اعتمد الخطة') return 'morning' as const;
  return null;
}

export function readPlanAsk(text: string) {
  const words = norm(text);
  if (/^(?:show |what is |what's )?(?:today's plan|the morning plan|plan the morning|morning plan)$/.test(words)) return 'morning' as const;
  if (/^(?:which jobs (?:still )?have no gate pass(?: confirmed)?(?: for tomorrow)?|gate pass for tomorrow)$/.test(words)) return 'gate' as const;
  if (norm(text) === 'خطة اليوم' || norm(text) === 'رتب الصباح') return 'morning' as const;
  if (norm(text) === 'أي شغل بدون تصريح بكرة' || norm(text) === 'اي شغل بدون تصريح بكرة') return 'gate' as const;
  return null;
}

export type DisclosedJob = { payment_status?: string | null; quote_status?: string | null; quote_amount?: number | string | null; visit_shown?: number | string | null };

/** The client sees only a price he was already shown. Draft bills never come through here. */
export function disclosedCost(role: string, job: DisclosedJob, currency: string) {
  if (role === 'technician') return null;
  if (job.payment_status === 'contract') return { label: DAY_REPLIES.covered, amount: null as string | null };
  if (job.quote_status === 'approved' && job.quote_amount != null && job.quote_amount !== '') {
    return { label: DAY_REPLIES.agreed, amount: `${currency} ${Number(job.quote_amount).toFixed(2)}` };
  }
  if (job.visit_shown != null && job.visit_shown !== '') {
    return { label: DAY_REPLIES.visitCharge, amount: `${currency} ${Number(job.visit_shown).toFixed(2)}` };
  }
  return null;
}
