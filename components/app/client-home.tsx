'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { Translated } from './app-words';
import { RequestSuggestions } from './request-suggestions';
import { PageHeader } from '../ui/layout';
import { useApp } from './context';
import { useResource } from './resource';
import { Card, ErrorState, Skeleton, StatusBadge } from '../ui';
import { workOrderTitle, isOverdue, clientStatusLabel, type Page, type WorkOrder } from '../../lib/ui/work-orders';
type ClientJob = WorkOrder & { quote_status?: string | null; visit_confirmed_for?: string | null };

function ClientRow({ job, reason }: { job: ClientJob; reason?: string }) {
  const { workspace } = useApp();
  const late = isOverdue(job, Date.now(), workspace?.timezone);
  return <li><Link className="list-row" href={`/work-orders/${job.id}`} onClick={() => sessionStorage.setItem('work-orders-return', '/home')}>
    <span className="list-row-main">
      <span className="list-row-title"><span data-no-translate>{workOrderTitle(job)}</span><StatusBadge status={job.status}>{clientStatusLabel(job)}</StatusBadge></span>
      <span className="list-row-meta" data-no-translate>{[job.site_name, job.assignee_name].filter(Boolean).join(', ')}</span>
      {reason && <span className="list-row-meta waiting-reason">{reason}</span>}
      {late && <span className="list-row-meta late-note">Late</span>}
    </span>
    <ChevronRight className="directional-icon" aria-hidden="true" />
  </Link></li>;
}

function Group({ title, jobs, loading, error, retry, seeAll, empty, reason }: { title: string; jobs: ClientJob[]; loading: boolean; error: unknown; retry: () => void; seeAll?: string; empty: string; reason?: (job: ClientJob) => string }) {
  return <section className="stack compact">
    <div className="section-title"><h2>{title}</h2>{seeAll && jobs.length > 3 && <Link className="text-link" href={seeAll}>See all</Link>}</div>
    <Card>{loading ? <div className="stack compact"><Skeleton className="skeleton-row" /><Skeleton className="skeleton-row" /></div> : error ? <ErrorState retry={retry} /> : jobs.length ? <ul className="list">{jobs.slice(0, 3).map(job => <ClientRow key={job.id} job={job} reason={reason?.(job)} />)}</ul> : <p>{empty}</p>}</Card>
  </section>;
}

/** Client Home: Your requests. One primary, then what waits for him, what is open and what is done. */
export function ClientHome() {
  const { member, workspace } = useApp(), base = member ? `/api/workspaces/${member.workspace_id}/work-orders` : null;
  const active = useResource<Page<ClientJob>>(base ? `${base}?active=true&sort=updated_at&dir=asc&pageSize=100` : null);
  const done = useResource<Page<ClientJob>>(base ? `${base}?status=done&sort=updated_at&dir=desc&pageSize=5` : null);
  useEffect(() => { const refresh = () => { void active.reload(); void done.reload(); }; window.addEventListener('groundwork-suggestions-changed', refresh); return () => window.removeEventListener('groundwork-suggestions-changed', refresh); }, [active.reload, done.reload]);
  if (!member) return null;
  const decides = ['manager', 'household'].includes(member.client_kind ?? 'manager');
  const now = Date.now(), tz = workspace?.timezone;
  // Only things he must answer: a price, or a new visit time on a job that is not late (bug 52).
  const waiting = (active.data?.data ?? []).filter(o => decides && (o.quote_status === 'pending' || (!!o.scheduled_for && new Date(o.scheduled_for).getTime() > now && !isOverdue(o, now, tz) && (!o.visit_confirmed_for || new Date(o.visit_confirmed_for).getTime() !== new Date(o.scheduled_for).getTime()))));
  const open = (active.data?.data ?? []).filter(o => !waiting.some(w => w.id === o.id)).reverse();
  return <Translated><div className="page client-home">
    <PageHeader>
      <div className="page-title"><h1>Your requests</h1><p>Ask for work and follow it here.</p></div>
      <div className="page-actions"><Link className="button primary lg" href="/work-orders/new" onClick={() => sessionStorage.setItem('work-orders-return', '/home')}><Plus aria-hidden="true" />New request</Link></div>
    </PageHeader>
    {waiting.length > 0 && <Group title="Waiting for you" jobs={waiting} loading={false} error={null} retry={active.reload} seeAll="/work-orders?active=true" empty="" reason={job => job.quote_status === 'pending' ? 'A price to approve' : 'Confirm the visit time'} />}
    <RequestSuggestions />
    <Group title="Open" jobs={open} loading={active.loading} error={active.error} retry={active.reload} seeAll="/work-orders?active=true" empty="Nothing is open. Send a request when something needs fixing." />
    <Group title="Done" jobs={done.data?.data ?? []} loading={done.loading} error={done.error} retry={done.reload} seeAll="/work-orders?status=done" empty="Finished work shows here." />
  </div></Translated>;
}
