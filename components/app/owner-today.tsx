'use client';
import Link from 'next/link';
import { useResource } from './resource';
import { useApp } from './context';
import { useUiLang } from './use-ui-lang';
import { formatInLang } from '../../lib/date-lang';
import { statusLabels, type Page, type WorkOrder } from '../../lib/ui/work-orders';
import type { DayPlanData } from './day-plan-card';

const time = (v: string | null, tz: string, lang?: string) => v ? formatInLang(v, { hour: 'numeric', minute: '2-digit', timeZone: tz }, lang) : '';
const initial = (name?: string | null) => (name ?? '').trim().charAt(0).toUpperCase();
function lateBy(due: string | null, tz: string) {
  if (!due) return 0;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(due)) / 86400000));
}

/** Desert Stone owner home: the one dark summary panel. Approve the plan jumps to the day plan, where the real Yes lives. */
export function OwnerSummary({ base }: { base: string }) {
  const { workspace } = useApp(), tz = workspace?.timezone ?? 'Asia/Dubai';
  const today = useResource<Page<WorkOrder>>(`${base}/work-orders?today=true&sort=scheduled_for&dir=asc&pageSize=10`);
  const late = useResource<Page<WorkOrder>>(`${base}/work-orders?overdue=true&sort=due_on&dir=asc&pageSize=5`);
  const plan = useResource<DayPlanData>(`${base}/day-plan`);
  const n = today.data?.total ?? 0, l = late.data?.total ?? 0, k = plan.data?.lines?.length ?? 0;
  const go = () => { const el = document.getElementById('day-plan'); el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); el?.querySelector<HTMLElement>('button, a')?.focus({ preventScroll: true }); };
  return <section className="ds-hero owner-summary" aria-labelledby="owner-summary-h">
    <div className="owner-summary-copy"><p id="owner-summary-h" className="ds-muted owner-summary-label">Today</p>
      <p className="owner-summary-line"><span className="num" data-no-translate>{n}</span> <span>jobs today</span><span aria-hidden="true"> · </span><span className="owner-gold"><span className="num" data-no-translate>{l}</span> <span>late</span></span><span aria-hidden="true"> · </span><span className="num" data-no-translate>{k}</span> <span>without a person</span></p></div>
    {k > 0 && plan.data?.can_plan && <button type="button" className="ds-hero-btn ds-hero-main" onClick={go}>Approve the plan</button>}
  </section>;
}

/** Today's jobs: a table on desktop, rows on the phone. */
export function TodayJobs({ base }: { base: string }) {
  const { workspace } = useApp(), tz = workspace?.timezone ?? 'Asia/Dubai', lang = useUiLang();
  const r = useResource<Page<WorkOrder>>(`${base}/work-orders?today=true&sort=scheduled_for&dir=asc&pageSize=10`);
  const rows = r.data?.data ?? [];
  return <section className="ds-panel today-jobs stack compact" aria-labelledby="today-jobs-h">
    <div className="ds-section-head"><h2 id="today-jobs-h">Today&apos;s jobs</h2><Link href="/work-orders?today=true" className="ds-link">See all</Link></div>
    {!rows.length ? <p className="ds-sub">{r.loading ? '' : 'No jobs today'}</p> : <>
      <table className="ds-table"><thead><tr><th scope="col">Time</th><th scope="col">Technician</th><th scope="col">Job</th><th scope="col">Site</th><th scope="col">Status</th></tr></thead>
        <tbody>{rows.map(j => <tr key={j.id}><td className="num" data-no-translate>{time(j.scheduled_for, tz, lang)}</td><td>{j.assignee_name ? <span className="ds-person"><span className="ds-avatar" aria-hidden="true" data-no-translate>{initial(j.assignee_name)}</span><span data-no-translate>{j.assignee_name}</span></span> : <span className="ds-sub">Unassigned</span>}</td><td><Link href={`/work-orders/${j.id}`} className="ds-cell-link" data-no-translate>{j.title}</Link></td><td className="ds-sub" data-no-translate>{j.site_name}</td><td><span className={`ds-chip ds-chip-${j.status}`}>{statusLabels[j.status] ?? j.status}</span></td></tr>)}</tbody></table>
      <ul className="ds-rows ds-phone-rows">{rows.map(j => <li key={j.id}><Link className="ds-row" href={`/work-orders/${j.id}`}><span className="ds-time num" data-no-translate>{time(j.scheduled_for, tz, lang)}</span><span className="ds-main"><strong data-no-translate>{j.title}</strong><span className="ds-sub" data-no-translate>{[j.assignee_name, j.site_name].filter(Boolean).join(', ')}</span></span><span className={`ds-chip ds-chip-${j.status}`}>{statusLabels[j.status] ?? j.status}</span></Link></li>)}</ul>
    </>}
  </section>;
}

/** Late jobs, newest problem first, with how many days late. */
export function LateJobs({ base }: { base: string }) {
  const { workspace } = useApp(), tz = workspace?.timezone ?? 'Asia/Dubai', lang = useUiLang();
  const r = useResource<Page<WorkOrder>>(`${base}/work-orders?overdue=true&sort=due_on&dir=asc&pageSize=5`);
  const rows = r.data?.data ?? [];
  if (!rows.length) return null;
  return <section className="ds-panel late-jobs stack compact" aria-labelledby="late-jobs-h">
    <h2 id="late-jobs-h">Late jobs</h2>
    <ul className="ds-divided">{rows.map(j => { const d = lateBy(j.due_on, tz); return <li key={j.id}><Link href={`/work-orders/${j.id}`} className="ds-late-row"><span className="ds-main"><strong><span data-no-translate>WO {j.order_number} {j.title}</span></strong><span className="ds-sub" data-no-translate>{[j.assignee_name, j.site_name].filter(Boolean).join(', ')}</span></span>{d > 0 && j.due_on && <span className="ds-chip ds-chip-late" data-no-translate>{formatInLang(j.due_on + 'T12:00:00Z', { day: 'numeric', month: 'short', timeZone: 'UTC' }, lang)}</span>}</Link></li>; })}</ul>
  </section>;
}
