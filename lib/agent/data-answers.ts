/**
 * Answers from the app's own data when every AI provider is busy or gives a broken reply.
 * The person never sees an error: common questions (today, late jobs, a job's status, what needs attention,
 * messages, suggested jobs, leave) get a real answer straight from the database, through the same role checked tools.
 * Replies are plain English; the per user page translation shows them in the reader's language.
 */
import { callTool, type AgentContext } from './tools';

export type Intent = 'attention' | 'today' | 'late' | 'job' | 'messages' | 'suggestions' | 'leave' | 'summary';

/** Words in every app language that point at each intent. Lower case; matched as substrings. */
const WORDS: Record<Exclude<Intent, 'job' | 'summary'>, string[]> = {
  late: ['late', 'overdue', 'behind', 'delay', 'متأخر', 'تأخير', 'متاخر', 'देर', 'विलंब', 'ढिलो', 'বিলম্ব', 'দেরি', 'தாமத', 'ലേറ്റ്', 'വൈകി', 'gecik', 'retard', 'atras', 'atrasad', 'huli', 'terlambat', 'дер', 'دیر'],
  messages: ['message', 'messaged', 'chat', 'unread', 'رسال', 'رسائل', 'پیغام', 'پیام', 'संदेश', 'सन्देश', 'মেসেজ', 'বার্তা', 'செய்தி', 'സന്ദേശ', 'mensaje', 'mensagem', 'mensahe', 'pesan', 'mesaj', 'message'],
  suggestions: ['suggest', 'suggestion', 'request', 'اقتراح', 'مقترح', 'طلب', 'درخواست', 'सुझाव', 'अनुरोध', 'অনুরোধ', 'পরামর্শ', 'கோரிக்கை', 'അഭ്യർത്ഥന', 'solicitud', 'sugerencia', 'pedido', 'kahilingan', 'permintaan', 'öneri', 'talep'],
  leave: ['leave', 'day off', 'time off', 'holiday', 'vacation', 'sick', 'إجازة', 'اجازة', 'رخصت', 'چھٹی', 'छुट्टी', 'बिदा', 'ছুটি', 'விடுப்பு', 'അവധി', 'vacaciones', 'licencia', 'férias', 'bakasyon', 'cuti', 'izin'],
  today: ['today', 'my day', 'my jobs', 'schedule', 'اليوم', 'جدول', 'آج', 'امروز', 'आज', 'आज', 'আজ', 'இன்று', 'ഇന്ന്', 'hoy', 'hoje', 'ngayon', 'hari ini', 'bugün', "aujourd'hui"],
  attention: ['attention', 'need to do', 'what now', 'pending', 'waiting', 'urgent', 'انتباه', 'يحتاج', 'معلق', 'توجہ', 'توجه', 'ध्यान', 'बाकी', 'মনোযোগ', 'বাকি', 'கவனம்', 'ശ്രദ്ധ', 'pendiente', 'pendente', 'kailangan', 'perlu', 'bekleyen'],
};
const ORDER: Exclude<Intent, 'job' | 'summary'>[] = ['late', 'leave', 'messages', 'suggestions', 'today', 'attention'];

/** Western, Arabic Indic, Persian and Devanagari digits read as numbers. */
function digits(s: string) {
  return s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0)).replace(/[०-९]/g, d => String(d.charCodeAt(0) - 0x966)).replace(/[০-৯]/g, d => String(d.charCodeAt(0) - 0x9e6));
}

export function detectIntent(question: string): { intent: Intent; number?: number } {
  const q = digits(question.toLowerCase());
  const job = q.match(/(?:wo|job|work order|#|رقم|نمبر|नंबर|নম্বর)\s*-?\s*(\d{1,7})\b/) ?? q.match(/^\D*(\d{1,7})\D*$/);
  if (job) return { intent: 'job', number: Number(job[1]) };
  for (const k of ORDER) if (WORDS[k].some(w => q.includes(w))) return { intent: k };
  return { intent: 'summary' };
}

/** Model replies that are really errors and must never reach the person. */
export function brokenReply(text: string | undefined | null): boolean {
  if (!text || !text.trim()) return true;
  return /limit for workspace actions|request is incomplete|incomplete request|rate limit|quota|too many requests|internal error|something went wrong|an error occurred|\b(?:429|500|502|503)\b|invalid tool arguments|tool limit reached|unknown tool/i.test(text);
}

const STATUS: Record<string, string> = { open: 'Open', scheduled: 'Visit booked', in_progress: 'In progress', on_hold: 'On hold', waiting_on_parts: 'Waiting on parts', done: 'Done', cancelled: 'Cancelled' };
const label = (s: string) => STATUS[s] ?? s.replace(/_/g, ' ');
const when = (v: unknown, tz?: string) => { if (!v) return ''; const d = new Date(String(v)); if (Number.isNaN(d.getTime())) return String(v); return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz }); };
const line = (j: any, tz?: string) => `• WO ${j.order_number}: ${j.title}${j.site_name ? ` at ${j.site_name}` : ''}${j.scheduled_for ? `, ${when(j.scheduled_for, tz)}` : ''} (${label(j.status)})`;
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

async function read(c: AgentContext, name: string, args: unknown = {}): Promise<any | null> {
  const r = await callTool(c, name, args);
  return r.isError ? null : (r.structuredContent as any)?.result ?? null;
}

async function attention(c: AgentContext) {
  const a = await read(c, 'needs_attention');
  if (!a) return null;
  const bits = [a.summary ? `${a.summary}.` : `You have ${plural(a.suggested_jobs ?? 0, 'suggested job')}.`];
  for (const s of (a.suggestions ?? []).slice(0, 3)) bits.push(`• ${s.title}${s.sender_name ? ` from ${s.sender_name}` : ''}`);
  if (a.unread_notifications) bits.push(`You have ${plural(a.unread_notifications, 'unread update')}.`);
  for (const n of (a.notifications ?? []).slice(0, 3)) if (n.title || n.body) bits.push(`• ${n.title ?? n.body}`);
  if (a.unread_messages) bits.push(`You have ${plural(a.unread_messages, 'unread message')}.`);
  return bits.join('\n');
}

async function today(c: AgentContext) {
  const d = await read(c, 'my_day');
  if (d) {
    if (!d.today.length && !d.late.length) return `You have no jobs today.${d.next?.length ? ` Next: ${d.next.slice(0, 1).map((j: any) => line(j, d.timezone).slice(2)).join('')}` : ''}`;
    return [`You have ${plural(d.today.length, 'job')} today${d.done ? `, ${d.done} done` : ''}.`, ...d.today.slice(0, 6).map((j: any) => line(j, d.timezone)), ...(d.late.length ? [`Late: ${plural(d.late.length, 'job')}.`, ...d.late.slice(0, 3).map((j: any) => line(j, d.timezone))] : [])].join('\n');
  }
  const open = await read(c, 'list_work_orders', { status: ['open', 'scheduled', 'in_progress', 'on_hold'], sort: 'scheduled_for', dir: 'asc', pageSize: 6 });
  if (!open) return null;
  return open.data?.length ? [`You have ${plural(open.total ?? open.data.length, 'open job')}.`, ...open.data.map((j: any) => line(j))].join('\n') : 'You have no open jobs right now.';
}

async function late(c: AgentContext, tz?: string) {
  const r = await read(c, 'list_work_orders', { overdue: true, sort: 'due_on', dir: 'asc', pageSize: 6 });
  if (!r) return null;
  return r.data?.length ? [`${plural(r.total ?? r.data.length, 'job is', 'jobs are')} late.`, ...r.data.map((j: any) => line(j, tz))].join('\n') : 'Nothing is late. Every job is on time.';
}

async function job(c: AgentContext, n: number) {
  const j = await read(c, 'get_work_order_by_number', { number: n });
  if (!j) return `I could not find WO ${n}. Check the number on the Work orders page.`;
  const bits = [`WO ${j.order_number}: ${j.title}`, `Status: ${label(j.status)}`];
  if (j.site_name ?? j.site?.name) bits.push(`Site: ${j.site_name ?? j.site.name}`);
  if (j.assignee_name) bits.push(`Assigned to: ${j.assignee_name}`);
  if (j.scheduled_for) bits.push(`Visit: ${when(j.scheduled_for)}`);
  if (j.due_on) bits.push(`Due: ${j.due_on}`);
  return bits.join('\n');
}

async function suggestions(c: AgentContext) {
  const r = await read(c, 'list_suggestions');
  if (!r) return null;
  const pending = (r.data ?? []).filter((s: any) => s.status === 'pending');
  const decided = (r.data ?? []).filter((s: any) => s.status !== 'pending').slice(0, 3);
  const out = [pending.length ? `${plural(pending.length, 'suggested job is', 'suggested jobs are')} waiting for review.` : 'No suggested jobs are waiting.'];
  for (const s of pending.slice(0, 4)) out.push(`• ${s.title}${s.sender_name ? ` from ${s.sender_name}` : ''}`);
  for (const s of decided) out.push(`• ${s.title}: ${s.status === 'approved' ? 'Accepted' : `Not accepted${s.decline_reason ? ` (${s.decline_reason})` : ''}`}`);
  return out.join('\n');
}

async function messages(c: AgentContext) {
  const r = await read(c, 'list_messages');
  if (r) {
    const unread = (r.data ?? r.threads ?? []).filter((t: any) => t.unread || t.unread_count);
    if (!unread.length) return 'You have no unread messages.';
    return [`You have ${plural(unread.length, 'conversation')} with unread messages.`, ...unread.slice(0, 4).map((t: any) => `• ${t.title ?? t.from_name ?? t.last_sender ?? 'Message'}${t.last_body ? `: ${String(t.last_body).slice(0, 80)}` : ''}`)].join('\n');
  }
  return attention(c);
}

async function leave(c: AgentContext) {
  const r = await read(c, 'list_leave_requests');
  if (!r) return null;
  const list = Array.isArray(r) ? r : [...(r.waiting ?? r.pending ?? []), ...(r.mine ?? [])];
  if (!list.length) return 'There are no time off requests right now.';
  return ['Time off requests:', ...list.slice(0, 5).map((t: any) => `• ${t.name ? `${t.name}: ` : ''}${t.starts_on}${t.ends_on && t.ends_on !== t.starts_on ? ` to ${t.ends_on}` : ''} (${t.status === 'pending' ? 'Waiting' : t.status === 'approved' ? 'Approved' : t.status === 'declined' ? 'Declined' : t.status})`)].join('\n');
}

/** A real answer from app data, never null: the last resort is a short summary and what the person can ask. */
export async function dataAnswer(c: AgentContext, question: string): Promise<string> {
  const { intent, number } = detectIntent(question);
  try {
    const answer = intent === 'job' ? await job(c, number!) : intent === 'late' ? await late(c) : intent === 'messages' ? await messages(c) : intent === 'suggestions' ? await suggestions(c) : intent === 'leave' ? await leave(c) : intent === 'today' ? await today(c) : await attention(c);
    if (answer) return intent === 'summary' ? `${answer}\n\nYou can also ask about today's jobs, late jobs, or a job number like WO 12.` : answer;
  } catch { /* fall through to the summary */ }
  try { const t = await today(c); if (t) return t; } catch { /* ignore */ }
  return 'I can show today\'s jobs, late jobs, a job by its number, suggested jobs and messages. Which would you like?';
}

/**
 * Quick lookups (Adhil, Oct 19): the common read questions, including the suggested prompts, answer straight from the
 * database with no AI call, well under a second. Only a whole short question matches, so anything longer or with
 * more detail still goes to the AI. Every read goes through the same role checked tools, so a technician sees only
 * his own jobs and a client only his own requests. Returns null when the question is not a quick lookup or the role
 * can not use the tool (the AI then answers as before).
 */
export type QuickLookup = 'parts' | 'late' | 'next' | 'today' | 'free_tomorrow' | 'client_requests' | 'client_visit';
const QUICK: [QuickLookup, RegExp][] = [
  ['parts', /^(?:(?:show|list|which|what)(?: me)?(?: the)?(?: my)? )?(?:jobs|work orders)(?: that)?(?: are)? (?:waiting|on hold) (?:on|for) (?:a )?parts?$|^(?:waiting (?:on|for) parts|parts waiting)$/],
  ['late', /^(?:(?:which|what|show|list)(?: me)?(?: the)?(?: my)? )?(?:jobs|work orders)(?: are)? (?:late|overdue)$|^(?:show |list )?(?:my )?(?:late|overdue) (?:jobs|work orders)$|^(?:is )?anything (?:late|overdue)$/],
  ['next', /^(?:what(?:'s| is) )?my next (?:job|visit)$|^(?:what(?:'s| is) )?next job$/],
  ['today', /^(?:what (?:do i have|are my jobs|is on) today|(?:show )?my jobs today|(?:show )?today'?s jobs|what is my day)$/],
  ['free_tomorrow', /^who(?:'s| is) free tomorrow$/],
  ['client_requests', /^how are my requests (?:going|doing)$|^(?:show )?my requests$/],
  ['client_visit', /^when is (?:the|my) technician coming$|^when is my (?:next )?visit$/],
];
export function quickLookup(question: string): QuickLookup | null {
  const q = question.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().replace(/[?.!\s]+$/, '');
  if (!q || q.length > 60) return null;
  for (const [k, re] of QUICK) if (re.test(q)) return k;
  return null;
}
async function parts(c: AgentContext, tz?: string) {
  const r = await read(c, 'list_work_orders', { status: ['waiting_on_parts'], sort: 'updated_at', dir: 'desc', pageSize: 8 });
  if (!r) return null;
  const n = r.total ?? r.data?.length ?? 0;
  return n ? [`${plural(n, 'job is', 'jobs are')} waiting on parts.`, ...r.data.map((j: any) => line(j, tz))].join('\n') : 'No jobs are waiting on parts.';
}
async function nextJob(c: AgentContext) {
  const d = await read(c, 'my_day');
  if (!d) return null;
  const open = (d.today ?? []).find((j: any) => !['done', 'cancelled'].includes(j.status)) ?? (d.next ?? [])[0];
  if (!open) return d.late?.length ? [`You have no more visits booked. Late: ${plural(d.late.length, 'job')}.`, ...d.late.slice(0, 3).map((j: any) => line(j, d.timezone))].join('\n') : 'You have no more jobs booked.';
  return `Your next job:\n${line(open, d.timezone)}`;
}
async function freeTomorrow(c: AgentContext, from: string) {
  const b = await read(c, 'get_schedule', { from, days: 1 });
  if (!b) return null;
  const techs = (b.people ?? []).filter((p: any) => p.role === 'technician');
  const away = new Set((b.away ?? []).map((a: any) => a.user_id));
  const count = (id: string) => (b.jobs ?? []).filter((j: any) => j.assignee_id === id).length;
  const free = techs.filter((p: any) => !away.has(p.user_id) && !count(p.user_id)).map((p: any) => p.name);
  const busy = techs.filter((p: any) => !away.has(p.user_id) && count(p.user_id)).map((p: any) => `${p.name} (${plural(count(p.user_id), 'job')})`);
  const off = techs.filter((p: any) => away.has(p.user_id)).map((p: any) => p.name);
  const day = new Date(from + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return [free.length ? `Technicians free tomorrow (${day}): ${free.join(', ')}.` : `Every technician has a job tomorrow (${day}).`, ...(busy.length ? [`Booked: ${busy.join(', ')}.`] : []), ...(off.length ? [`Away: ${off.join(', ')}.`] : [])].join('\n');
}
async function clientRequests(c: AgentContext, tz?: string) {
  const r = await read(c, 'list_work_orders', { status: ['open', 'scheduled', 'in_progress', 'waiting_on_parts'], sort: 'updated_at', dir: 'desc', pageSize: 6 });
  if (!r) return null;
  const s = await read(c, 'list_suggestions');
  const waiting = (s?.data ?? []).filter((x: any) => x.status === 'pending').length;
  const n = r.total ?? r.data?.length ?? 0;
  return [n ? `You have ${plural(n, 'open request')}.` : 'You have no open requests.', ...(r.data ?? []).map((j: any) => line(j, tz)), ...(waiting ? [`${plural(waiting, 'new request is', 'new requests are')} waiting for the company to accept.`] : [])].join('\n');
}
async function clientVisit(c: AgentContext, tz?: string) {
  const r = await read(c, 'list_work_orders', { status: ['scheduled', 'in_progress'], sort: 'scheduled_for', dir: 'asc', pageSize: 10 });
  if (!r) return null;
  const soon = (r.data ?? []).filter((j: any) => j.scheduled_for && (j.status === 'in_progress' || new Date(j.scheduled_for).getTime() > Date.now() - 2 * 3600_000));
  if (!soon.length) return 'No visit is booked yet. The company will confirm a time.';
  return [soon.length === 1 ? 'Your next visit:' : `You have ${plural(soon.length, 'visit')} booked:`, ...soon.slice(0, 3).map((j: any) => line(j, tz))].join('\n');
}
/** The quick answer, or null to let the AI answer. tomorrow is the workspace's next day as YYYY-MM-DD. */
export async function quickAnswer(c: AgentContext, question: string, who: { role: string; tomorrow: string; timezone?: string }): Promise<string | null> {
  const k = quickLookup(question);
  if (!k) return null;
  const client = who.role === 'client';
  // Client questions answer only for clients; my day questions only for the team. Parts and late work for everyone (role scoped).
  if ((k === 'client_requests' || k === 'client_visit') && !client) return null;
  if ((k === 'next' || k === 'today' || k === 'free_tomorrow') && client) return null;
  try {
    if (k === 'parts') return await parts(c, who.timezone);
    if (k === 'late') return await late(c, who.timezone);
    if (k === 'next') return await nextJob(c);
    if (k === 'today') return await today(c);
    if (k === 'free_tomorrow') return who.role === 'technician' || !who.tomorrow ? null : await freeTomorrow(c, who.tomorrow);
    if (k === 'client_requests') return await clientRequests(c, who.timezone);
    return await clientVisit(c, who.timezone);
  } catch { return null; }
}
