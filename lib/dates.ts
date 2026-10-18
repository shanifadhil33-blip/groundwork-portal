import { formatInLang } from './date-lang';
// Calendar dates are kept as YYYY-MM-DD, never interpreted in the browser timezone.
export const workspaceTimezone = 'Asia/Dubai';
export function localDate(value: string | Date | number, timezone = workspaceTimezone): string {
 if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
  const day = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0,10)===value ? value : '';
 }
 const date = new Date(value);
 if (!Number.isFinite(date.getTime())) return '';
 const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
 return ['year','month','day'].map(key => parts.find(part => part.type === key)?.value).join('-');
}
/** lang: English inside English sentences (the translator turns the whole sentence); the person's language for a date shown on its own (LANG01 slice 2). */
export function formatDate(value: string | Date, timezone = workspaceTimezone, short = false, lang = 'en'): string {
 const day = localDate(value, timezone);
 if (!day) return 'Unknown date';
 return formatInLang(new Date(`${day}T12:00:00Z`), {timeZone:'UTC',month:'short',day:'numeric',...(!short || day.slice(0,4) !== localDate(Date.now(),timezone).slice(0,4) ? {year:'numeric' as const} : {})}, lang);
}
export function isOverdue(order: {due_on?: string | null; status:string}, now: number | Date = Date.now(), timezone = workspaceTimezone): boolean {
 return !!order.due_on && order.due_on < localDate(now, timezone) && !['done','cancelled'].includes(order.status);
}
// Shared SQL equivalent of isOverdue. The workspace is resolved under the caller's RLS.
export const overdueSql = "due_on < (CURRENT_TIMESTAMP AT TIME ZONE (SELECT timezone FROM workspaces WHERE id=work_orders.workspace_id))::date AND status NOT IN ('done','cancelled')";
/** A visit today (workspace day) that isn't finished: the jobs to do today. */
export const todaySql = "(scheduled_for AT TIME ZONE (SELECT timezone FROM workspaces WHERE id=work_orders.workspace_id))::date = (CURRENT_TIMESTAMP AT TIME ZONE (SELECT timezone FROM workspaces WHERE id=work_orders.workspace_id))::date AND status NOT IN ('done','cancelled')";
export function scheduledInstant(day: string, timezone = workspaceTimezone, hour = 9): string | null {
 if (!day) return null;
 // Resolve a wall-clock visit time in the workspace, including seasonal offsets.
 const wall = Date.parse(`${day}T${String(hour).padStart(2,'0')}:00:00Z`);
 let instant = wall;
 for(let i=0;i<3;i++) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant);
  const get=(key:string)=>parts.find(p=>p.type===key)?.value;
  const rendered=Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`);
  instant += wall-rendered;
 }
 return new Date(instant).toISOString();
}
