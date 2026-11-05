/** JOB14, JOB15, PHOTO04, TECH05, TECH09, CLIENT07, LANG06. Plain rules the server checks before any write. */

export const CLOSE_REPLIES = {
  signOffAsk: 'Sign off this finished job? This cannot be undone.',
  signed: 'Signed off. This stays on the job.',
  already: 'This job is already signed off.',
  notDone: 'Sign off waits until the job is done.',
  onlyClient: 'Only the client or the office can sign off.',
  noPhotos: 'No photos',
  marked: 'Marked. This closed job has no photos.',
  photosExist: 'This job already has photos.',
  markWaits: 'You can mark no photos after the job is done.',
  onlyTeam: 'Only the team can mark no photos.',
  draftTitle: 'Draft bill',
  waitingOwner: 'Waiting for the owner',
  kept: 'The owner kept this draft. It is not sent.',
  onlyOwner: 'Only the owner can keep this draft.',
  reminder: 'Please sign off the finished job when you can.',
  thanks: 'Thank you',
  translated: 'Translated',
} as const;

export const SIGN_OFF_REMINDERS: Record<string, string> = {
  en: CLOSE_REPLIES.reminder,
  'ar-AE': 'لو سمحت اعتمد الشغل اللي خلص لما تقدر.',
  ar: 'لو سمحت اعتمد الشغل اللي خلص لما تقدر.',
  hi: 'काम पूरा हो गया है। जब हो सके तब इसे स्वीकार करें।',
  ur: 'کام مکمل ہو گیا ہے۔ جب ہو سکے اسے منظور کریں۔',
  ml: 'ജോലി കഴിഞ്ഞു. കഴിയുമ്പോൾ ഇത് സ്വീകരിക്കുക.',
  fil: 'Tapos na ang trabaho. Paki apruba kapag kaya.',
};

export function signOffReminder(language: string | null | undefined) {
  const code = language || 'en';
  return SIGN_OFF_REMINDERS[code] ?? SIGN_OFF_REMINDERS[code.split('-')[0]] ?? SIGN_OFF_REMINDERS.en;
}

export type CloseActor = { role: string; staff_kind?: string | null; client_kind?: string | null; user: string; client_id?: string | null; is_owner?: boolean };
export type CloseJob = { status: string; client_id: string; created_by?: string | null; assignee_id?: string | null; signed_off_at?: string | null; no_photos_at?: string | null; report_outcome?: string | null; report_work?: string | null; report_part?: string | null };

export function canSignOff(actor: CloseActor, job: CloseJob) {
  if (job.signed_off_at || job.status !== 'done') return false;
  if (actor.role === 'admin' || actor.role === 'staff') return true;
  if (actor.role !== 'client' || actor.client_id !== job.client_id) return false;
  if ((actor.client_kind ?? 'manager') === 'household') return job.created_by === actor.user;
  return true;
}

export function signOffRefusal(actor: CloseActor, job: CloseJob) {
  if (job.signed_off_at) return CLOSE_REPLIES.already;
  if (job.status !== 'done') return CLOSE_REPLIES.notDone;
  if (!canSignOff(actor, job)) return CLOSE_REPLIES.onlyClient;
  return null;
}

export function canMarkNoPhotos(actor: CloseActor, job: CloseJob, photoCount: number) {
  if (job.no_photos_at || job.status !== 'done' || photoCount > 0) return false;
  if (actor.role === 'admin') return true;
  if (actor.role === 'staff' && actor.staff_kind !== 'office') return true;
  return actor.role === 'technician' && job.assignee_id === actor.user;
}

export function noPhotosRefusal(actor: CloseActor, job: CloseJob, photoCount: number) {
  if (job.no_photos_at) return CLOSE_REPLIES.marked;
  if (job.status !== 'done') return CLOSE_REPLIES.markWaits;
  if (photoCount > 0) return CLOSE_REPLIES.photosExist;
  if (!canMarkNoPhotos(actor, job, photoCount)) return CLOSE_REPLIES.onlyTeam;
  return null;
}

/** SAMPLE prices. A line exists only when the technician reported that work or that part. Amounts are never invented for an unnamed part. */
export const SAMPLE_PRICE_LIST = [
  { key: 'visit', label: 'Visit', amount: '150.00' },
  { key: 'washer', label: 'Washer', amount: '25.00' },
  { key: 'seal', label: 'Seal', amount: '40.00' },
  { key: 'filter', label: 'Filter', amount: '60.00' },
] as const;

export type DraftLine = { label: string; detail: string; amount: string | null };

export function draftLines(job: Pick<CloseJob, 'report_work' | 'report_part'>): DraftLine[] {
  const lines: DraftLine[] = [];
  const work = job.report_work?.trim() ?? '';
  const part = job.report_part?.trim() ?? '';
  if (work) lines.push({ label: 'Work reported', detail: work, amount: SAMPLE_PRICE_LIST[0].amount });
  if (part) {
    const known = SAMPLE_PRICE_LIST.find(row => row.key !== 'visit' && row.label.toLowerCase() === part.toLowerCase());
    lines.push({ label: 'Part reported', detail: part, amount: known?.amount ?? null });
  }
  return lines;
}

export function canApproveDraft(actor: CloseActor) { return actor.role === 'admin' && !!actor.is_owner; }

export type RatingPerson = { user_id: string; role: string; staff_kind?: string | null };

/** TECH09: a low rating goes to the supervisor first, never to the technician and never to office staff. */
export function lowRatingRecipients(people: RatingPerson[], assigneeId: string | null) {
  const skip = (person: RatingPerson) => person.user_id === assigneeId;
  const supers = people.filter(person => person.role === 'staff' && person.staff_kind !== 'office' && !skip(person));
  const chosen = supers.length ? supers : people.filter(person => person.role === 'admin' && !skip(person));
  return chosen.map(person => person.user_id);
}

export const DONE_MOMENT: Record<string, string> = {
  fixed: 'Job done. Great work!',
  temporary: 'Job done for now. The office will plan the return visit.',
  needs_part: 'Report saved. The job waits for the part.',
  cant_fix: 'Report saved. Your supervisor will take it from here.',
};

const OUTCOME_WORDS: Record<string, string> = { fixed: 'Fixed', temporary: 'Temporary fix', needs_part: 'Needs a part', cant_fix: "Can't be fixed" };

export function doneCard(input: { outcome: string; name: string; problem: string; work: string; before: number; after: number }) {
  return {
    title: DONE_MOMENT[input.outcome] ?? DONE_MOMENT.fixed,
    name: input.name,
    lines: [
      { label: 'The problem', value: input.problem.trim() || 'Not set yet' },
      { label: 'What was done', value: input.work.trim() || 'Not set yet' },
      { label: 'How it ended', value: OUTCOME_WORDS[input.outcome] ?? OUTCOME_WORDS.fixed },
      { label: 'Before photos', value: input.before ? String(input.before) : CLOSE_REPLIES.noPhotos },
      { label: 'After photos', value: input.after ? String(input.after) : CLOSE_REPLIES.noPhotos },
    ],
  };
}

/** LANG06: his words stay as he wrote them. The English copy is marked translated for the office. */
export function englishCopyMark(language: string | null | undefined, english: string | null | undefined) {
  const text = english?.trim() ?? '';
  if (!text || !language || language === 'en' || language.startsWith('en-')) return null;
  return { label: CLOSE_REPLIES.translated, text };
}

export function draftCost(lines: DraftLine[]) {
  if (!lines.length || lines.some(line => line.amount == null)) return null;
  return lines.reduce((sum, line) => sum + Number(line.amount), 0).toFixed(2);
}

export function readSignOff(text: string) {
  const words = text.normalize('NFC').trim().replace(/[.!?؟]+$/u, '').replace(/\s+/gu, ' ');
  const numbered = /^(?:please\s+)?sign off(?:\s+(?:wo|job|work order|مهمة)\s*#?\s*(\d+))?$/i.exec(words) || /^(?:اعتماد|اعتمد)(?:\s*(\d+))?$/.exec(words);
  if (!numbered) return null;
  return { order: numbered[1] ? Number(numbered[1]) : null };
}
