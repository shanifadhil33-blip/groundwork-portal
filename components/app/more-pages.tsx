'use client';
import Link from 'next/link';
import { PageHeader } from '../ui/layout';
import { Card, EmptyState, ErrorState, Skeleton } from '../ui';
import { Translated } from './app-words';
import { useApp } from './context';
import { Equipment } from './equipment';
import { HelpFeedback } from './help-feedback';
import { NoAccess } from './no-access';
import { useResource } from './resource';
import { LeaveRequests, RequestTimeOff } from './time-off';

/** Help: reached from More on phone and from the account menu on laptop. */
export function HelpPage() {
  return (
    <Translated>
      <div className="page">
        <PageHeader><div className="page-title"><h1>Help</h1><p>Tell us what went wrong or what you need. We read every note.</p></div></PageHeader>
        <Card><HelpFeedback /></Card>
        <Card>
          <nav aria-label="Help" className="list">
            <Link className="list-row" href="/how-agent-works"><span className="list-row-main"><span className="list-row-title">How the Agent works</span><span className="list-row-meta">What it can do for you and what it never does alone.</span></span></Link>
            <Link className="list-row" href="/privacy"><span className="list-row-main"><span className="list-row-title">Privacy</span></span></Link>
            <Link className="list-row" href="/terms"><span className="list-row-main"><span className="list-row-title">Terms</span></span></Link>
          </nav>
        </Card>
      </div>
    </Translated>
  );
}

/** Time off for a technician: ask for days off and see the answers. */
export function TimeOffPage() {
  const { me, member } = useApp();
  if (!member) return null;
  if (member.role === 'client') return <NoAccess />;
  const base = `/api/workspaces/${member.workspace_id}`;
  return (
    <Translated>
      <div className="page">
        <PageHeader>
          <div className="page-title"><h1>Time off</h1><p>Ask for days off. Your supervisor answers here.</p></div>
          <div className="page-actions"><RequestTimeOff base={base} /></div>
        </PageHeader>
        <LeaveRequests base={base} self={me.user.id} />
      </div>
    </Translated>
  );
}

/** Sites for a client manager: his buildings and the equipment in each. */
export function SitesPage() {
  const { member } = useApp();
  const base = member?.role === 'client' ? `/api/workspaces/${member.workspace_id}` : null;
  const sites = useResource<{ id: string; name: string }[]>(base ? `${base}/request-sites` : null);
  if (member && member.role !== 'client') return <NoAccess />;
  const list = Array.isArray(sites.data) ? sites.data : [];
  return (
    <Translated>
      <div className="page">
        <PageHeader><div className="page-title"><h1>Sites</h1><p>Your buildings and the equipment in each one.</p></div></PageHeader>
        {sites.error ? <ErrorState error={sites.error} retry={sites.reload} />
          : sites.loading ? <div className="stack compact"><Skeleton className="skeleton-row" /><Skeleton className="skeleton-row" /></div>
          : !list.length ? <EmptyState title="No sites yet." action={<Link className="button secondary" href="/messages">Message your maintenance company</Link>}>Your maintenance company adds your buildings. Ask them to add one.</EmptyState>
          : list.map(site => <Card key={site.id} className="stack compact"><h2 data-no-translate>{site.name}</h2><Equipment base={base!} siteId={site.id} /></Card>)}
      </div>
    </Translated>
  );
}
