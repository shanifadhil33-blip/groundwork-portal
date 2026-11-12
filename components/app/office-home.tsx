'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, Circle, X } from 'lucide-react';
import { Translated } from './app-words';
import { useApp } from './context';
import { useResource } from './resource';
import type { DayPlanData } from './day-plan-card';
import { PageHeader } from '../ui/layout';
import { BottomSheet, Button, Card, IconButton, Skeleton, useToast } from '../ui';
import { post, RequestError } from '../../lib/ui/api';
import { formatInLang } from '../../lib/date-lang';
import { useUiLang } from './use-ui-lang';
import { greetingWord } from '../../lib/ui/greeting-word';
import { roleGroup, type RoleGroup } from '../../lib/ui/nav';
import { workOrderTitle, type Page, type WorkOrder } from '../../lib/ui/work-orders';

type NeedsYouRow = { kind: string; count: number; href: string };
type Summary = { today: number; late: number; without_technician: number; needs: NeedsYouRow[]; money: { currency: string; in: number; out: number } | null; setup?: { clients: boolean; team: boolean; jobs: boolean } | null };

/** Words for each Needs you row: one for a single item, one for many. The number is shown beside them. */
const NEEDS_WORDS: Record<string, [string, string]> = {
  late: ['late job', 'late jobs'],
  to_approve: ['request to approve', 'requests to approve'],
  without_technician: ['job without a technician', 'jobs without a technician'],
  questions: ['question from your team', 'questions from your team'],
  time_off: ['time off request', 'time off requests'],
  documents: ['company document expires within 30 days', 'company documents expire within 30 days'],
  lessons: ['new lesson for the Agent to check', 'new lessons for the Agent to check'],
  mine_today: ['of your own jobs is today', 'of your own jobs are today'],
};

/** One short "try this" per demo person: what to do first on this screen. */
const TRY_FIRST: Partial<Record<RoleGroup, { text: string; label: string; href: string }>> = {
  owner: { text: 'Approve today’s plan so every technician knows his jobs.', label: 'See today’s plan', href: '#plan' },
  admin: { text: 'Look at the new requests from clients and approve one.', label: 'See new requests', href: '/work-orders?tab=approve' },
  supervisor: { text: 'Give the job without a technician to someone.', label: 'See the job', href: '/work-orders?assignee_id=unassigned&active=true' },
  office: { text: 'Add a job for a client.', label: 'New job', href: '/work-orders/new' },
};

function money(value: number, currency: string) { return `${currency} ${Math.round(value).toLocaleString('en-US')}`; }

/** A real new company: four short steps on Home until they are done. Never a forced wizard (bugs 57, 84). */
function SetupCard({ setup }: { setup: { clients: boolean; team: boolean; jobs: boolean } }) {
  const { me } = useApp(), key = `groundwork-setup-hidden:${me.user.id}`;
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem(key) === '1'); } catch { /* Shown in full. */ } }, [key]);
  const steps = [
    { done: true, text: 'Create your company.', label: 'Company details', href: '/settings/company' },
    { done: setup.team, text: 'Invite your team.', label: 'Invite', href: '/settings/team' },
    { done: setup.clients, text: 'Add your first client.', label: 'Add client', href: '/clients' },
    { done: setup.jobs, text: 'Add your first job.', label: 'New job', href: '/work-orders/new' },
  ];
  const done = steps.filter(step => step.done).length;
  const toggle = (value: boolean) => { setHidden(value); try { localStorage.setItem(key, value ? '1' : '0'); } catch { /* Kept for this visit. */ } };
  if (hidden) return <Card className="setup-line"><span><span>Setup</span> <span className="num" data-no-translate>{done}</span> <span>of</span> <span className="num" data-no-translate>{steps.length}</span></span><Button variant="secondary" size="sm" onClick={() => toggle(false)}>Continue</Button></Card>;
  return (
    <Card className="stack compact setup-card">
      <div className="section-title"><h2>Set up Groundwork</h2><Button variant="ghost" size="sm" onClick={() => toggle(true)}>Hide for now</Button></div>
      <p><span className="num" data-no-translate>{done}</span> <span>of</span> <span className="num" data-no-translate>{steps.length}</span> <span>done</span></p>
      <ul className="list">
        {steps.map(step => (
          <li key={step.label} className="list-row">
            {step.done ? <CheckCircle2 className="setup-done" aria-label="Done" /> : <Circle className="setup-todo" aria-hidden="true" />}
            <span className="list-row-main">{step.text}</span>
            {!step.done && <Link className="button secondary sm" href={step.href}>{step.label}</Link>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TryFirst({ group, onPlan }: { group: RoleGroup; onPlan: () => void }) {
  const { me } = useApp();
  const tip = TRY_FIRST[group];
  const key = `groundwork-try-first:${me.user.id}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem(key) === '1'); } catch { setHidden(false); } }, [key]);
  if (!tip || hidden) return null;
  const hide = () => { setHidden(true); try { localStorage.setItem(key, '1'); } catch { /* Shown again next time. */ } };
  return (
    <Card className="try-first">
      <div className="try-first-copy"><p className="try-first-label">Try this first</p><p>{tip.text}</p></div>
      <div className="try-first-actions">
        {tip.href === '#plan' ? <Button variant="secondary" onClick={onPlan}>{tip.label}</Button> : <Link className="button secondary md" href={tip.href}>{tip.label}</Link>}
        <IconButton label="Hide this tip" onClick={hide}><X /></IconButton>
      </div>
    </Card>
  );
}

function Count({ value, one, many, href }: { value: number | undefined; one: string; many: string; href: string }) {
  if (value === undefined) return <Skeleton className="today-count-skeleton" />;
  return <Link className="today-count" href={href}><span className="num" data-no-translate>{value}</span> <span>{value === 1 ? one : many}</span></Link>;
}

/** Today's plan in a sheet: who does which job. One Approve, in the sheet footer. */
function PlanSheet({ open, onClose, plan, onApproved }: { open: boolean; onClose: () => void; plan: DayPlanData | null; onApproved: () => Promise<void> }) {
  const { member } = useApp(), toast = useToast();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lines = plan?.lines.filter(line => line.kind === 'place') ?? [];
  async function approve() {
    if (!plan || !member) return;
    setBusy(true); setError('');
    try {
      await post(`/api/workspaces/${member.workspace_id}/day-plan`, { action: 'approve', kind: 'morning', fingerprint: plan.fingerprint });
      await onApproved();
      onClose();
      toast('Today’s plan is approved. Every technician can see his jobs.');
    } catch (e) { setError(e instanceof RequestError && e.status < 500 ? e.message : 'We couldn’t approve the plan. Please try again.'); }
    finally { setBusy(false); }
  }
  return (
    <BottomSheet open={open} onClose={onClose} title="Today’s plan" busy={busy} footer={plan?.can_plan && lines.length ? <Button size="lg" busy={busy} busyLabel="Approving" onClick={approve}>Approve plan</Button> : undefined}>
      <Translated>
        <div className="stack compact">
          {lines.length
            ? <p><span className="num" data-no-translate>{lines.length}</span> <span>{lines.length === 1 ? 'job needs a technician. We picked one for it.' : 'jobs need a technician. We picked one for each.'}</span> <span>Nothing changes until you approve.</span></p>
            : <p>Every job today has a technician.</p>}
          <ul className="list">
            {lines.map(line => (
              <li key={line.job_id} className="list-row">
                <span className="list-row-main">
                  <span className="list-row-title"><span data-no-translate>{line.title}</span></span>
                  <span className="list-row-meta">{line.assignee_name ? <bdi data-no-translate>{line.assignee_name}</bdi> : 'No technician is free'}</span>
                </span>
              </li>
            ))}
          </ul>
          {error && <p className="inline-error" role="alert">{error}</p>}
        </div>
      </Translated>
    </BottomSheet>
  );
}

function TodaysVisits({ base, tz, lang }: { base: string; tz: string; lang: string }) {
  const visits = useResource<Page<WorkOrder>>(`${base}/work-orders?today=true&sort=scheduled_for&dir=asc&pageSize=10`);
  return (
    <Card className="stack compact todays-visits">
      <h2>Today’s visits</h2>
      {visits.loading ? <div className="stack compact"><Skeleton className="skeleton-row" /><Skeleton className="skeleton-row" /></div>
        : !visits.data?.data.length ? <p>No visits today.</p>
        : <ul className="list">
            {visits.data.data.map(job => (
              <li key={job.id}>
                <Link className="list-row" href={`/work-orders/${job.id}`}>
                  <time className="visit-time num" data-no-translate>{job.scheduled_for ? formatInLang(job.scheduled_for, { hour: 'numeric', minute: '2-digit', timeZone: tz }, lang) : ''}</time>
                  <span className="list-row-main">
                    <span className="list-row-title"><span data-no-translate>{workOrderTitle(job)}</span></span>
                    <span className="list-row-meta">{job.assignee_name ? <bdi data-no-translate>{job.assignee_name}</bdi> : 'No technician yet'}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>}
    </Card>
  );
}

/** Home for the owner, admin, supervisor and office staff. Three blocks: Today, Needs you, This month. */
export function OfficeHome() {
  const { me, member, workspace } = useApp(), lang = useUiLang();
  const base = member ? `/api/workspaces/${member.workspace_id}` : '';
  const summary = useResource<Summary>(base ? `${base}/home` : null);
  const plan = useResource<DayPlanData>(base ? `${base}/day-plan` : null);
  const dashboard = useResource<unknown>(base ? `${base}/dashboard` : null);
  const visits = useResource<unknown>(base ? `${base}/work-orders?today=true&sort=scheduled_for&dir=asc&pageSize=10` : null);
  const [planOpen, setPlanOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); }, []);
  if (!member) return null;
  const group = roleGroup(member) ?? 'office';
  const tz = workspace?.timezone ?? 'Asia/Dubai';
  const first = (me.user.name ?? '').split(' ')[0];
  const data = summary.data;
  const toPlace = plan.data?.lines.filter(line => line.kind === 'place').length ?? 0;
  const canPlan = !!plan.data?.can_plan;
  // Approving changes who does what today: every number on Home and the shell badge refresh at once.
  const refresh = async () => { await Promise.all([summary.reload(), plan.reload(), dashboard.reload(), visits.reload()]); window.dispatchEvent(new Event('groundwork-queue-changed')); };
  const demo = !!me.user.is_demo && !!workspace?.is_demo;
  const needs = data?.needs ?? [];

  return (
    <Translated>
      <div className="page home-page">
        <PageHeader>
          <div className="page-title">
            <h1><span suppressHydrationWarning>{greetingWord(tz, now ?? undefined)}</span>{first && <>, <bdi data-no-translate>{first}</bdi></>}</h1>
            <p><span data-no-translate suppressHydrationWarning>{now ? formatInLang(now, { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }, lang) : ''}</span>{now && '. '}<span>Here is your company today.</span></p>
          </div>
        </PageHeader>
        <div className="home-grid">
          <div className="home-main">
            {data?.setup && <SetupCard setup={data.setup} />}
            {demo && <TryFirst group={group} onPlan={() => setPlanOpen(true)} />}
            <Card className="today-card" aria-labelledby="today-title">
              <h2 id="today-title">Today</h2>
              <div className="today-counts">
                <Count value={data?.today} one="job today" many="jobs today" href="/schedule" />
                <Count value={data?.late} one="late" many="late" href="/work-orders?overdue=true" />
                <Count value={data?.without_technician} one="without a technician" many="without a technician" href="/work-orders?assignee_id=unassigned&active=true" />
              </div>
              <div className="today-action">
                {canPlan && toPlace > 0
                  ? <Button size="lg" onClick={() => setPlanOpen(true)}>Approve today’s plan</Button>
                  : <Link className="button primary lg" href="/work-orders/new">New job</Link>}
                {!canPlan && toPlace > 0 && <p className="small">Only the owner, an admin or a supervisor can approve today’s plan.</p>}
              </div>
            </Card>
            <section className="stack compact" aria-labelledby="needs-title">
              <div className="section-title"><h2 id="needs-title">Needs you</h2>{needs.length > 3 && <Link className="text-link" href="/work-orders?tab=approve">See all</Link>}</div>
              <Card>
                {summary.loading ? <div className="stack compact"><Skeleton className="skeleton-row" /><Skeleton className="skeleton-row" /></div>
                  : !needs.length ? <p>Nothing needs you right now.</p>
                  : <ul className="list">
                      {needs.slice(0, 3).map(row => (
                        <li key={row.kind}>
                          <Link className="list-row" href={row.href}>
                            <span className="list-row-main"><span className="list-row-title"><span><span className="num" data-no-translate>{row.count}</span> <span>{(NEEDS_WORDS[row.kind] ?? [row.kind, row.kind])[row.count === 1 ? 0 : 1]}</span></span></span></span>
                            <ChevronRight className="directional-icon" aria-hidden="true" />
                          </Link>
                        </li>
                      ))}
                    </ul>}
              </Card>
            </section>
            {data?.money && (
              <p className="month-line"><span>This month:</span> <bdi className="num" data-no-translate>{money(data.money.in, data.money.currency)}</bdi> <span>in</span>, <bdi className="num" data-no-translate>{money(data.money.out, data.money.currency)}</bdi> <span>out</span>.</p>
            )}
          </div>
          <aside className="home-side" aria-label="Today’s visits"><TodaysVisits base={base} tz={tz} lang={lang} /></aside>
        </div>
        <PlanSheet open={planOpen} onClose={() => setPlanOpen(false)} plan={plan.data} onApproved={refresh} />
      </div>
    </Translated>
  );
}
