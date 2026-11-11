'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ArrowLeft, Bell, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { AppPageData } from '../../lib/server-page-data';
import { useVisiblePoll } from '../../lib/hooks/use-visible-poll';
import { tabWord } from '../../lib/tab-words';
import { isOffice } from '../../lib/roles';
import { HELP_ITEM, isCurrent, navFor, parentOf, ROLE_CAN_DO, ROLE_NAME, roleGroup, SETTINGS_ITEM, type NavItem } from '../../lib/ui/nav';
import { LAST_PAGE_KEY } from '../../lib/ui/device';
import { demoEmail } from '../../lib/ui/polish';
import { request, post, RequestError } from '../../lib/ui/api';
import { demoLanguage } from '../../lib/ui/demo-language';
import { homeForPersona } from '../../lib/ui/helpers';
import { officeOnlyPath, providerOnlyPath } from '../../lib/ui/work-orders';
import { useCacheScope } from '../../lib/ui/resource-cache';
import { rememberSession } from '../../lib/head-scripts';
import { BottomSheet, Button, ConfirmDialog, Dropdown, ErrorState, IconButton, PageSkeleton, useToast } from '../ui';
import { useTheme } from '../ui/theme';
import { Brand, Mark } from '../public/chrome';
import { personas } from '../public/demo-picker';
import { Translated } from './app-words';
import { AccountIdentity } from './account-identity';
import { AgentButton } from './agent-button';
import { AppContext, type Me, type Workspace } from './context';
import { ContactNamesProvider } from './contact-names-context';
import { guardedAction } from './draft-guard';
import { InitialResourceProvider } from './initial-resources';
import { NoAccess } from './no-access';
import { Notifications } from './notifications';
import { Outbox } from './outbox';
import { useResource } from './resource';
import { Translator } from './translator';
import { useUiLang } from './use-ui-lang';

// The Agent code loads on hover, focus or touch start of its button, so the first open is instant.
let assistantCode: typeof import('./assistant') | null = null;
const loadAssistant = () => import('./assistant').then(m => (assistantCode = m));
const LazyAssistant = dynamic(() => loadAssistant().then(m => m.Assistant), { ssr: false });
// Rendered directly once loaded. Chosen once per mount so it never remounts.
function AssistantHost(props: ComponentProps<typeof import('./assistant').Assistant>) {
  const [loaded] = useState(() => assistantCode);
  return loaded ? <loaded.Assistant {...props} /> : <LazyAssistant {...props} />;
}

type Overlay = 'more' | 'people' | 'notifications' | 'agent' | null;
const bellLabel = (count: number) => (count > 0 ? `Notifications, ${count} unread` : 'Notifications');
type Counts = { unread_count: number; company_replies?: number };
const ENTRY_PATHS = ['/onboarding', '/find-company', '/invites/accept'];

export function AppShell({ children, initial }: { children: ReactNode; initial?: AppPageData | null }) {
  const path = usePathname(), router = useRouter(), { sync } = useTheme(), toast = useToast(), lang = useUiLang();
  const [me, setMe] = useState<Me | null>(initial?.me ?? null);
  const [workspace, setWorkspace] = useState<Workspace | null>(initial?.workspace ?? null);
  const [loadError, setLoadError] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Only one sheet or panel is open at a time.
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [agentMounted, setAgentMounted] = useState(false);
  const [agentTab, setAgentTab] = useState<'agent' | 'whatsapp'>('agent');
  const [ask, setAsk] = useState<{ text: string; n: number } | null>(null);
  const [confirm, setConfirm] = useState<'signout' | 'reset' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const visits = useRef(0);

  const member = me?.memberships[0] ?? null;
  const group = roleGroup(member);
  const nav = navFor(member);
  const office = isOffice(member?.role);
  const base = member ? `/api/workspaces/${member.workspace_id}` : null;
  useCacheScope(me ? `${me.user.id}:${member?.workspace_id ?? ''}` : '');

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const result = await request<Me>('/api/me');
      const selected = localStorage.getItem('groundwork-workspace');
      result.memberships.sort((a, b) => Number(b.workspace_id === selected) - Number(a.workspace_id === selected));
      const first = result.memberships[0];
      const ws = first ? await request<Workspace>(`/api/workspaces/${first.workspace_id}`) : null;
      setMe(result); setWorkspace(ws);
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) return;
      setLoadError(true);
    }
  }, []);
  // Runs once. A later page payload without a seed must not reload the person and blank the screen.
  const started = useRef(false);
  useEffect(() => { if (started.current) return; started.current = true; if (!initial) void load(); }, [initial, load]);
  useEffect(() => {
    if (!me) return;
    rememberSession('in');
    document.cookie = 'groundwork-session=1; Path=/; SameSite=Lax; Max-Age=31536000';
    if (workspace?.is_demo) document.cookie = 'groundwork-demo=1; Path=/; SameSite=Lax; Max-Age=2592000';
    void sync();
  }, [me, workspace, sync]);
  useEffect(() => { setCollapsed(localStorage.getItem('groundwork-sidebar') === 'collapsed'); }, []);

  // Each role has one Home. Anyone on another role's Home, or without a company, is sent to his own first screen.
  useEffect(() => {
    if (!me) return;
    if (!member) { if (!ENTRY_PATHS.includes(path)) router.replace('/onboarding'); return; }
    // Company setup is only for a person with no company. In the demo there is nothing to join either.
    if (path === '/onboarding' || (path === '/find-company' && me.user.is_demo)) { router.replace(nav.home); return; }
    if ((path === '/dashboard' || path === '/home' || path === '/overview') && path !== nav.home) router.replace(nav.home);
  }, [me, member, path, nav.home, router]);

  useEffect(() => {
    visits.current += 1;
    setOverlay(current => (current === 'agent' ? current : null));
    // ?agent=whatsapp (from the demo bar or the old Demo chat link) opens the WhatsApp preview in the Agent.
    if (new URLSearchParams(window.location.search).get('agent') === 'whatsapp') { setAgentTab('whatsapp'); setAgentMounted(true); setOverlay('agent'); }
    setDemoOpen(false);
    if (!path.startsWith('/settings')) sessionStorage.setItem(LAST_PAGE_KEY, path);
  }, [path]);

  useEffect(() => {
    if (workspace?.is_demo && sessionStorage.getItem('groundwork-demo-restored')) {
      sessionStorage.removeItem('groundwork-demo-restored');
      toast('The demo is back to how it started.');
    }
  }, [workspace, toast]);

  // Counts for the bell, the Jobs badge and the Messages dot.
  const counts = useResource<Counts>(member ? '/api/notifications/unread-count' : null);
  useVisiblePoll(counts.reload, 120_000, !!member);
  const messages = useResource<{ unread_count: number; direct_unread_count?: number; team_unread_count?: number }>(base ? `${base}/messages/unread` : null);
  useVisiblePoll(messages.reload, 120_000, !!member);
  const summary = useResource<{ pending_queue_rows?: number; pending_suggestions?: number }>(base && office ? `${base}/dashboard` : null);
  useVisiblePoll(summary.reload, 90_000, !!member && office);
  useEffect(() => {
    const refreshMessages = () => void messages.reload(), refreshQueue = () => void summary.reload();
    window.addEventListener('groundwork-messages-changed', refreshMessages);
    window.addEventListener('groundwork-queue-changed', refreshQueue);
    return () => { window.removeEventListener('groundwork-messages-changed', refreshMessages); window.removeEventListener('groundwork-queue-changed', refreshQueue); };
  }, [messages.reload, summary.reload]);
  const unread = counts.data?.unread_count ?? 0;
  const toApprove = (summary.data?.pending_queue_rows ?? 0) + (summary.data?.pending_suggestions ?? 0);
  const unreadMessages = messages.data?.unread_count ?? 0;

  // Keyboard shortcut for the Agent. Shown only in the tooltip on laptop.
  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') { event.preventDefault(); warmAgent(); setOverlay(current => (current === 'agent' ? null : 'agent')); }
    };
    window.addEventListener('keydown', toggle);
    return () => window.removeEventListener('keydown', toggle);
  }, []);
  function warmAgent() { setAgentMounted(true); void loadAssistant(); }
  // On a phone the tap and the touch start are too close together to load code in between, so it also loads when the page is idle.
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    const warm = () => { void loadAssistant().then(() => setAgentMounted(true)).catch(() => {}); };
    if (idle) idle(warm, { timeout: 3000 }); else setTimeout(warm, 1500);
  }, []);
  useEffect(() => { if (overlay === 'agent') setAgentMounted(true); }, [overlay]);

  async function switchWorkspace(id: string) {
    if (!me) return;
    try {
      const ws = await request<Workspace>(`/api/workspaces/${id}`);
      document.cookie = `groundwork-workspace=${id}; Path=/; SameSite=Lax; Max-Age=31536000`;
      localStorage.setItem('groundwork-workspace', id);
      const memberships = [...me.memberships].sort((a, b) => Number(b.workspace_id === id) - Number(a.workspace_id === id));
      setMe({ ...me, memberships }); setWorkspace(ws);
      router.push(navFor(memberships[0]).home);
    } catch { setLoadError(true); }
  }

  function askToConfirm(action: 'signout' | 'reset') {
    guardedAction(() => { setOverlay(null); setDemoOpen(false); setActionError(null); setConfirm(action); });
  }
  async function runConfirmed() {
    if (busy) return;
    setBusy(confirm); setActionError(null);
    try {
      if (confirm === 'signout') {
        await post('/api/auth/sign-out');
        sessionStorage.clear(); rememberSession('out');
        window.location.replace('/?signed_out=1');
      } else {
        await post('/api/demo/reset', { confirm: true });
        sessionStorage.setItem('groundwork-demo-restored', '1');
        window.location.replace(nav.home);
      }
    } catch {
      setActionError(confirm === 'signout' ? 'We couldn’t sign you out. Please try again.' : 'We couldn’t start the demo over. Please try again.');
      setBusy(null);
    }
  }
  async function changePerson(key: string) {
    if (busy) return;
    setBusy(key); setActionError(null);
    try {
      await post('/api/demo/switch', { persona: key, language: demoLanguage(document.documentElement.lang) });
      window.location.replace(homeForPersona(key));
    } catch { setActionError('We couldn’t change the person. Please try again.'); setBusy(null); }
  }

  if (loadError && !me) return <Translated><div className="public-page"><Brand /><ErrorState message="We couldn’t open Groundwork. Please try again." retry={load} /></div></Translated>;
  // Only the very first identity load needs a fallback. Refreshes keep the signed in screen.
  if (!me || (member && !workspace)) return <Translated><><div className="app-header"><span className="header-brand"><Mark /></span></div><PageSkeleton /></></Translated>;

  const demo = !!me.user.is_demo && !!workspace?.is_demo;
  const personaKey = (me.user.email ?? '').split('.')[0];
  const firstName = (personas.find(p => p.key === personaKey)?.name ?? me.user.name ?? '').split(' ')[0];
  const roleName = group ? ROLE_NAME[group] : 'Account';
  const company = member?.client_name ?? workspace?.name ?? member?.workspace_name ?? '';
  const workMemberships = me.memberships.filter(m => m.role !== 'client'), clientMemberships = me.memberships.filter(m => m.role === 'client');
  const mixed = workMemberships.length > 0 && clientMemberships.length > 0;
  const companies = mixed ? (member?.role === 'client' ? clientMemberships : workMemberships) : me.memberships;
  const back = parentOf(path, nav);
  const blocked = (member?.role === 'client' && providerOnlyPath(path)) || (member?.role === 'technician' && officeOnlyPath(path));
  const moreCurrent = nav.more.some(item => isCurrent(item, path)) && !nav.tabs.some(item => isCurrent(item, path));
  const open = (next: Exclude<Overlay, null>) => setOverlay(current => (current === next ? null : next));

  const countLabel = (kind: NavItem['badge']) => { const count = kind === 'approve' ? toApprove : unreadMessages; return kind === 'approve' ? `${count} to approve` : `${count} unread`; };
  const badge = (item: NavItem) => {
    const count = item.badge === 'approve' ? toApprove : item.badge === 'messages' ? unreadMessages : 0;
    return count > 0 ? <span className="nav-count" aria-label={countLabel(item.badge)}>{count > 99 ? '99+' : count}</span> : null;
  };
  const navLink = (item: NavItem, onClick?: () => void) => (
    <Link key={item.href + item.label} href={item.href} prefetch className="nav-link" aria-current={isCurrent(item, path) ? 'page' : undefined} title={collapsed ? item.label : undefined} onClick={onClick}>
      <item.icon aria-hidden="true" /><span className="nav-label">{item.label}</span>{badge(item)}
    </Link>
  );
  const tabLink = (item: NavItem) => {
    const word = item.tab ? tabWord(lang, item.tab, false) : null;
    return (
      <Link key={item.href + item.label} href={item.href} prefetch aria-current={isCurrent(item, path) ? 'page' : undefined} onClick={() => { if (isCurrent(item, path) && path === item.href) window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
        <item.icon aria-hidden="true" />
        {word ? <span className="tab-label" data-no-translate>{word}</span> : <span className="tab-label">{item.label}</span>}
        {((item.badge === 'approve' && toApprove > 0) || (item.badge === 'messages' && unreadMessages > 0)) && <span className="nav-dot" aria-label={countLabel(item.badge)} />}
      </Link>
    );
  };
  const accountOptions = [
    { value: 'help', label: 'Help' },
    ...(mixed ? [{ value: 'mode', label: member?.role === 'client' ? 'Switch to work' : 'Switch to my requests' }] : []),
    ...(!demo ? [{ value: 'add', label: 'Add another company' }] : []),
    { value: 'signout', label: 'Sign out' },
  ];
  function accountAction(value: string) {
    if (value === 'signout') askToConfirm('signout');
    else if (value === 'mode') void switchWorkspace((member?.role === 'client' ? workMemberships : clientMemberships)[0].workspace_id);
    else guardedAction(() => router.push(value === 'add' ? '/find-company' : HELP_ITEM.href));
  }

  return (
    <Translated>
      <InitialResourceProvider resources={initial?.user === me.user.id ? initial.resources : {}}>
        <AppContext.Provider key={`${me.user.id}:${member?.workspace_id ?? ''}`} value={{ me, member, workspace, reload: load, askAssistant: text => { setAsk(a => ({ text, n: (a?.n ?? 0) + 1 })); warmAgent(); setOverlay('agent'); }, updateName: name => setMe(current => (current ? { ...current, user: { ...current.user, name } } : current)) }}>
          <ContactNamesProvider>
            <Translator />
            <a href="#app-content" className="skip-link">Skip to content</a>
            <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
              <aside className="sidebar">
                <div className="sidebar-top">
                  <Brand href={nav.home} label={false} />
                  <span className="sidebar-company" data-no-translate><bdi>{company}</bdi></span>
                </div>
                <nav className="sidebar-nav" aria-label="Main navigation"><div className="nav-links">{nav.sidebar.map(item => navLink(item))}</div></nav>
                <div className="sidebar-bottom">
                  {member && navLink(SETTINGS_ITEM)}
                  {companies.length > 1 && <Dropdown label="Company" value={member?.workspace_id ?? ''} options={companies.map(m => ({ value: m.workspace_id, label: m.workspace_name, noTranslate: true }))} onChange={id => void switchWorkspace(id)} width={216} />}
                  <Dropdown label="Account menu" className="account-row" menuWidth={216} options={accountOptions} onChange={accountAction}>
                    <AccountIdentity name={me.user.name} role={roleName} compact={collapsed} />
                  </Dropdown>
                  <IconButton label={collapsed ? 'Open the menu' : 'Close the menu'} onClick={() => { setCollapsed(!collapsed); localStorage.setItem('groundwork-sidebar', collapsed ? 'expanded' : 'collapsed'); }}>
                    {collapsed ? <PanelLeftOpen className="directional-icon" /> : <PanelLeftClose className="directional-icon" />}
                  </IconButton>
                </div>
              </aside>
              <div className="app-main">
                <header className="app-header">
                  {back
                    ? <IconButton className="header-back" label="Back" onClick={() => { if (visits.current > 1) router.back(); else router.push(back); }}><ArrowLeft className="directional-icon" /></IconButton>
                    : <Link href={nav.home} className="header-brand" aria-label="Home"><Mark /></Link>}
                  <span className="header-spacer" />
                  {member && (
                    <div className="header-actions">
                      <AgentButton open={overlay === 'agent'} onWarm={warmAgent} onClick={() => { warmAgent(); open('agent'); }} />
                      <span className="bell">
                        <IconButton label={bellLabel(unread)} onClick={() => open('notifications')}><Bell /></IconButton>
                        {unread > 0 && <span className="bell-count num" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
                      </span>
                    </div>
                  )}
                </header>
                {demo && group && (
                  <section className="demo-bar" aria-label="Demo">
                    <div className="demo-bar-line">
                      <button type="button" className="demo-bar-who" aria-expanded={demoOpen} onClick={() => setDemoOpen(!demoOpen)}>
                        <span>Demo. You are</span> <strong data-no-translate>{firstName}</strong>, <span>{roleName}</span>.
                      </button>
                      <button type="button" className="demo-bar-change" onClick={() => open('people')}>Change person</button>
                    </div>
                    {demoOpen && (
                      <div className="demo-bar-more">
                        <p>{ROLE_CAN_DO[group]}</p>
                        <p><span data-no-translate><bdi>{company}</bdi></span>. <span>Sample data, resets every 6 hours.</span></p>
                        <div className="row">
                          {(group === 'owner' || group === 'admin') && <Button variant="secondary" size="sm" onClick={() => { setDemoOpen(false); setAgentTab('whatsapp'); warmAgent(); setOverlay('agent'); }}>See a WhatsApp request arrive</Button>}
                          <Button variant="secondary" size="sm" onClick={() => askToConfirm('reset')}>Start over</Button>
                        </div>
                      </div>
                    )}
                  </section>
                )}
                {member && <div className="outbox-slot"><Outbox key={`${me.user.id}:${member.workspace_id}`} /></div>}
                <main id="app-content" className="route-content">{blocked ? <NoAccess /> : children}</main>
              </div>
            </div>

            {member && (
              <nav className="bottom-nav" aria-label="Main navigation">
                {nav.tabs.map(tabLink)}
                <button type="button" aria-current={moreCurrent ? 'page' : undefined} aria-haspopup="dialog" onClick={() => open('more')}>
                  <Menu aria-hidden="true" /><span className="tab-label" data-no-translate>{tabWord(lang, 'more', false)}</span>
                  {unreadMessages > 0 && nav.more.some(item => item.badge === 'messages') && <span className="nav-dot" aria-label={countLabel('messages')} />}
                </button>
              </nav>
            )}

            <BottomSheet open={overlay === 'more'} onClose={() => setOverlay(null)} title="More">
              <div className="more-sheet">
                <p className="more-context"><span data-no-translate><bdi>{company}</bdi></span>, <span>{roleName}</span></p>
                <nav aria-label="More"><div className="nav-links">{nav.more.map(item => navLink(item))}</div></nav>
                {companies.length > 1 && <Dropdown label="Company" value={member?.workspace_id ?? ''} options={companies.map(m => ({ value: m.workspace_id, label: m.workspace_name, noTranslate: true }))} onChange={id => void switchWorkspace(id)} width={280} />}
                <div className="more-account">
                  <span className="account-row"><AccountIdentity name={me.user.name} role={demoEmail(me.user.email) ?? roleName} /></span>
                  <Button variant="secondary" onClick={() => askToConfirm('signout')}>Sign out</Button>
                </div>
              </div>
            </BottomSheet>

            <BottomSheet open={overlay === 'people'} onClose={() => setOverlay(null)} title="Change person" busy={!!busy}>
              <div className="stack compact">
                <p>See the same company through another person. Your changes in this demo stay.</p>
                <ul className="list">
                  {personas.map(p => (
                    <li key={p.key}>
                      <button type="button" className="list-row" disabled={!!busy || p.key === personaKey} aria-busy={busy === p.key || undefined} onClick={() => void changePerson(p.key)}>
                        <span className="avatar" aria-hidden="true" data-no-translate>{p.name[0]}</span>
                        <span className="list-row-main">
                          <span className="list-row-title"><span data-no-translate>{p.name}</span></span>
                          <span className="list-row-meta">{p.key === personaKey ? <><span>{p.role}</span>. <span>This is you now.</span></> : p.role}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {actionError && <p className="inline-error" role="alert">{actionError}</p>}
                <Button variant="secondary" onClick={() => askToConfirm('reset')}>Start over</Button>
              </div>
            </BottomSheet>

            {member && agentMounted && <AssistantHost key={`agent:${me.user.id}:${member.workspace_id}`} ws={member.workspace_id} open={overlay === 'agent'} ask={ask} tab={agentTab} onTab={setAgentTab} onClose={() => setOverlay(current => (current === 'agent' ? null : current))} />}
            {member && <Notifications key={`notifications:${me.user.id}:${member.workspace_id}`} open={overlay === 'notifications'} onClose={() => setOverlay(current => (current === 'notifications' ? null : current))} ws={member.workspace_id} onChange={delta => { if (delta) counts.setData(current => (current ? { ...current, unread_count: Math.max(0, current.unread_count + delta) } : current)); void counts.reload(); }} />}

            <ConfirmDialog open={confirm === 'signout'} onClose={() => setConfirm(null)} title="Sign out of Groundwork?" confirmLabel="Sign out" busyLabel="Signing out" busy={busy === 'signout'} error={actionError} onConfirm={runConfirmed}>You can sign in again any time.</ConfirmDialog>
            <ConfirmDialog open={confirm === 'reset'} onClose={() => setConfirm(null)} title="Start the demo over?" confirmLabel="Start over" busyLabel="Starting over" busy={busy === 'reset'} danger error={actionError} onConfirm={runConfirmed}>Everything you changed in this demo goes back to how it started.</ConfirmDialog>
          </ContactNamesProvider>
        </AppContext.Provider>
      </InitialResourceProvider>
    </Translated>
  );
}
