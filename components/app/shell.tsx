'use client';
import { tabKey, tabWord } from '../../lib/tab-words';
import { Outbox } from './outbox';
import { ContactNamesProvider } from './contact-names-context';
import { menuEnabled } from '../../lib/company';
import { demoEmail } from '../../lib/ui/polish';
import { doesJobs, isOffice, labelsFor,rolesLabel } from '../../lib/roles';
import { LAST_PAGE_KEY } from '../../lib/ui/device';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { AppPageData } from '../../lib/server-page-data';
import { InitialResourceProvider } from './initial-resources';
import { ServerLangProvider } from './use-ui-lang';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode, type ComponentProps } from 'react';
import { FileText, Building2, Users, CalendarCheck, CalendarDays, ClipboardList, ClipboardCheck, Bell, House, LayoutDashboard, ChartPie, Menu, PanelLeftClose, PanelLeftOpen, Settings, Upload, ListChecks, History, Truck, MessageSquare } from 'lucide-react';
import { request, post, RequestError } from '../../lib/ui/api';
import { homeForPersona } from '../../lib/ui/helpers';
import { Badge, BottomSheet, Button, ConfirmDialog, Dropdown, ErrorState, IconButton, PageSkeleton, useToast } from '../ui';
import { useTheme } from '../ui/theme';
import { rememberSession } from '../../lib/head-scripts';
import { Brand, Mark } from '../public/chrome';
import { personas } from '../public/demo-picker';
import { AppContext, type Me, type Workspace } from './context';
import { guardedAction } from './draft-guard';
import { officeOnlyPath, providerOnlyPath } from '../../lib/ui/work-orders';
import { useResource } from './resource';
import { NoAccess } from './no-access';
import { Notifications } from './notifications';
import { Translator } from './translator';
let assistantCode:typeof import('./assistant')|null=null;
const loadAssistant=()=>import('./assistant').then(m=>(assistantCode=m));
// Rendered directly once loaded (a lazy component waits about 300 ms on first show); chosen once per mount so it never remounts.
function AssistantHost(props:ComponentProps<typeof import('./assistant').Assistant>){const [m]=useState(()=>assistantCode);return m?<m.Assistant {...props}/>:<Assistant {...props}/>;}
const Assistant=dynamic(()=>loadAssistant().then(m=>m.Assistant),{ssr:false});
// The Agent panel code loads when the browser is idle, so the first tap on Agent opens it at once (Oct 19: about 0.3 s on first open).
if(typeof window!=='undefined'){const load=()=>{void loadAssistant().then(m=>m.Assistant).catch(()=>{});};const w=window as Window&{requestIdleCallback?:(cb:()=>void,o?:{timeout:number})=>number};if(w.requestIdleCallback)w.requestIdleCallback(load,{timeout:4000});else setTimeout(load,2000);}
/** The language the Translator set on <html>; phone tab words come from a fixed table, never live translation. */
function useHtmlLang(serverLanguage?:string) {
  const [lang, setLang] = useState(serverLanguage??'en');
  useEffect(() => { const el = document.documentElement, read = () => setLang(el.lang || 'en'); read(); const o = new MutationObserver(read); o.observe(el, { attributes: true, attributeFilter: ['lang'] }); return () => o.disconnect(); }, []);
  return lang;
}
export function AppShell({ children, initial, serverLanguage, languageSetup }: { children: ReactNode; initial?:AppPageData|null; serverLanguage?:string; languageSetup?:ReactNode }) {
  const path = usePathname(), router = useRouter(), { sync } = useTheme(),toast=useToast();
  const [me, setMe] = useState<Me | null>(initial?.me??null), [workspace, setWorkspace] = useState<Workspace | null>(initial?.workspace??null), [error, setError] = useState(false), [loading, setLoading] = useState(!initial);
  const [collapsed, setCollapsed] = useState(false), [drawer, setDrawer] = useState(false), [assistant, setAssistant] = useState(false), [notifications, setNotifications] = useState(false), [unread, setUnread] = useState<number | null>(()=>{const r=initial?.resources['/api/notifications/unread-count'];return r&&'data' in r?(r.data as {unread_count:number}).unread_count:null;}), [countError, setCountError] = useState(false), [pending, setPending] = useState<number | null>(()=>{const r=initial?.resources[`/api/workspaces/${initial.me.memberships[0]?.workspace_id}/dashboard`];return r&&'data' in r?(r.data as {pending_queue_rows:number}).pending_queue_rows:null;});
  const [confirm, setConfirm] = useState<'signout' | 'reset' | 'switch' | null>(null), [busy, setBusy] = useState(false), [actionError, setActionError] = useState<string | null>(null), [persona, setPersona] = useState('imran');
  const pendingStarted=useRef(false);
  const [demoOptions, setDemoOptions] = useState(false);
  const [assistantLoaded,setAssistantLoaded]=useState(false),[desktop,setDesktop]=useState(false);
  useEffect(()=>{const query=matchMedia('(min-width:1024px)');const update=()=>setDesktop(query.matches);update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
  const [ask,setAsk]=useState<{text:string;n:number}|null>(null);
  useEffect(()=>{if(assistant)setAssistantLoaded(true);},[assistant]);
  // Signed in: public pages opened later show 'Go to dashboard' from their first frame.
  useEffect(()=>{rememberSession('in');},[]);
  const [shortcut, setShortcut] = useState('Ctrl J');
  useEffect(() => {
    setShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘J' : 'Ctrl J');
    const toggle = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') { event.preventDefault(); setAssistant(open => !open); } };
    window.addEventListener('keydown', toggle);
    return () => window.removeEventListener('keydown', toggle);
  }, []);
  useEffect(() => {
    document.getElementById('app-content')?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.querySelector('.app-main')?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [path, loading]);
  useEffect(()=>{if(!loading&&workspace?.is_demo&&sessionStorage.getItem('groundwork-demo-restored')){sessionStorage.removeItem('groundwork-demo-restored');toast('Demo data restored');}},[loading,workspace,toast]);
  const member = me?.memberships[0] ?? null;
  const home = member?.is_owner && workspace?.company_size==='big' && workspace?.enabled_dashboards?.includes('overview') ? '/overview' : member?.role === 'client' ? '/home' : member?.role === 'technician' ? '/today' : '/dashboard', office = isOffice(member?.role);
  const dashboardAssistant=!!member&&path===home;
  const docked=dashboardAssistant&&desktop;
  useEffect(()=>{if(docked)setAssistantLoaded(true);},[docked]);
  const companyReplies=useResource<{company_replies:number}>('/api/notifications/unread-count');
  useEffect(()=>{const refresh=()=>void companyReplies.reload();const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[companyReplies.reload]);
  const messageCounts=useResource<{unread_count:number;direct_unread_count?:number;team_unread_count?:number}>(member?`/api/workspaces/${member.workspace_id}/messages/unread`:null);
  useEffect(()=>{const refresh=()=>void messageCounts.reload();window.addEventListener('groundwork-messages-changed',refresh);window.addEventListener('focus',refresh);const timer=setInterval(refresh,60000);return()=>{clearInterval(timer);window.removeEventListener('groundwork-messages-changed',refresh);window.removeEventListener('focus',refresh);};},[messageCounts.reload]);
  const suggestions=useResource<{pending_suggestions:number}>(member&&office?`/api/workspaces/${member.workspace_id}/dashboard`:null);
  useEffect(()=>{if(!member||!office)return;const refresh=()=>void suggestions.reload();window.addEventListener('groundwork-queue-changed',refresh);window.addEventListener('focus',refresh);const timer=setInterval(refresh,60000);return()=>{clearInterval(timer);window.removeEventListener('groundwork-queue-changed',refresh);window.removeEventListener('focus',refresh);};},[member,office,suggestions.reload]);
  const clientDetail=useResource<{name:string}>(member&&office&&/^\/clients\/[^/]+$/.test(path)?`/api/workspaces/${member.workspace_id}${path}`:null);
  const load = useCallback(async () => { setLoading(true); setError(false); try { const result = await request<Me>('/api/me'); const selected=localStorage.getItem('groundwork-workspace');result.memberships.sort((a,b)=>Number(b.workspace_id===selected)-Number(a.workspace_id===selected));const membership = result.memberships[0]; const ws = membership ? await request<Workspace>(`/api/workspaces/${membership.workspace_id}`) : null; setMe(result); setWorkspace(ws);document.cookie='groundwork-session=1; Path=/; SameSite=Lax; Max-Age=31536000'; if(ws?.is_demo)document.cookie='groundwork-demo=1; Path=/; SameSite=Lax; Max-Age=2592000'; await sync(); } catch (e) { if (e instanceof RequestError && e.status === 401) return; setError(true); } finally { setLoading(false); } }, [sync]);
  useEffect(() => { if(!initial)void load();else {document.cookie='groundwork-session=1; Path=/; SameSite=Lax; Max-Age=31536000';if(initial.workspace?.is_demo)document.cookie='groundwork-demo=1; Path=/; SameSite=Lax; Max-Age=2592000';void sync();} setCollapsed(localStorage.getItem('groundwork-sidebar') === 'collapsed'); }, [load]);
  useEffect(() => { if (!me) return; if (!me.user.is_demo && !workspace?.is_demo && !me.onboarding_started && path !== '/find-company' && path !== '/onboarding' && path !== '/invites/accept' && !sessionStorage.getItem(`onboardingShown:${me.user.id}`)){sessionStorage.setItem(`onboardingShown:${me.user.id}`,'1');router.replace('/onboarding');} if (member && (path === (member.role === 'client' ? '/dashboard' : '/home') || (member.role === 'technician' && path === '/dashboard'))) router.replace(home); }, [me, member, path, home, router]);
  const refreshUnread = useCallback(async () => { try { const result = await request<{ unread_count: number }>('/api/notifications/unread-count'); setUnread(result.unread_count); setCountError(false); } catch { setCountError(true); } }, []);
  useEffect(() => { if (!member) return; if(!initial)void refreshUnread(); const timer = setInterval(refreshUnread, 60000); const focus = () => { void refreshUnread(); }; window.addEventListener('focus', focus); return () => { clearInterval(timer); window.removeEventListener('focus', focus); }; }, [member, refreshUnread]);
  useEffect(() => {
    if (!member || !isOffice(member.role)) { setPending(null); return; }
    let active = true;
    const refresh = async () => { try { const result = await request<{ pending_queue_rows: number }>(`/api/workspaces/${member.workspace_id}/dashboard`); if (active) setPending(result.pending_queue_rows); } catch { if (active) setPending(null); } };
    if(!initial||pendingStarted.current)void refresh();
    pendingStarted.current=true;
    window.addEventListener('groundwork-queue-changed', refresh); window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('groundwork-queue-changed', refresh); window.removeEventListener('focus', refresh); };
  }, [member, path]);
  function openConfirm(action: typeof confirm) { guardedAction(() => { if(action==='switch')setPersona(personas.find(p=>p.key!==(me?.user.email??'').split('.')[0])?.key??'imran');setActionError(null); setConfirm(action); }); }
  async function execute() {
    if (busy) return; setBusy(true); setActionError(null);
    try { if (confirm === 'signout') { await post('/api/auth/sign-out'); sessionStorage.clear(); rememberSession('out'); window.location.replace('/sign-in?signed_out=1'); } else if (confirm === 'reset') { await post('/api/demo/reset', { confirm: true });sessionStorage.setItem('groundwork-demo-restored','1'); window.location.replace(home); } else { await post('/api/demo/switch', { persona }); window.location.replace(homeForPersona(persona)); } }
    catch { setActionError(confirm === 'signout' ? 'We couldn’t sign you out. Please try again.' : 'We couldn’t update your demo. Please try again.'); setBusy(false); }
  }
  useEffect(() => { if (!path.startsWith('/settings')) sessionStorage.setItem(LAST_PAGE_KEY, path); }, [path]);
  const htmlLang = useHtmlLang(serverLanguage);
  if (error) return <div className="public-page"><Brand /><ErrorState message="We couldn’t open your workspace. Please try again." retry={load} /></div>;
  if (loading || !me || (member && !workspace) || (member?.role === 'client' && path === '/dashboard') || (member?.role === 'technician' && path === '/dashboard') || (member && member.role !== 'client' && path === '/home')) return <><div className="public-header"><Brand /></div><PageSkeleton /></>;
  const nav = member?.role === 'technician' ? [{ href: '/today', label: 'Today', icon: CalendarCheck }, { href: '/work-orders', label: 'My jobs', icon: ClipboardList }, { href: '/suggestions/new', label: 'Suggest a job', icon: ClipboardCheck }, { href: '/settings', label: 'Settings', icon: Settings }] : [{ href: home, label: 'Home', icon: member?.role === 'client' ? House : LayoutDashboard }, ...(office && doesJobs(member) ? [{ href: '/today', label: 'My day', icon: CalendarCheck }, { href: `/work-orders?assignee_id=${me.user.id}&active=true`, label: 'My jobs', icon: ClipboardCheck }] : []), ...(member && office ? [{ href: '/work-orders', label: 'Jobs', icon: ClipboardList }, { href: '/schedule', label: 'Schedule', icon: CalendarDays }, { href: '/documents', label: 'Documents', icon: FileText }, { href: '/queue', label: 'New requests', icon: ListChecks }, { href: '/suggestions', label: 'Suggested', icon: ClipboardCheck }, { href: '/team', label: 'Team', icon: Users }, { href: '/clients', label: 'Clients', icon: Building2 }, { href: '/import', label: 'Add from Excel', icon: Upload }, { href: '/supplier', label: 'Parts', icon: Truck }] : member ? [{href:'/work-orders',label:'Requests',icon:ClipboardList}] : []), { href: '/settings', label: 'Settings', icon: Settings }];
  if(member)nav.splice(nav.length-1,0,{href:'/messages',label:'Messages',icon:MessageSquare});
  if(member&&member.role!=='client')nav.splice(nav.length-1,0,{href:'/team-space',label:'Team space',icon:Users});
  if(member?.role==='admin'&&!nav.some(n=>n.href==='/overview')&&(workspace?.enabled_dashboards?.includes('overview')??true))nav.unshift({href:'/overview',label:'Company overview',icon:ChartPie});
  for(let i=nav.length-1;i>=0;i--)if(!menuEnabled(nav[i].href,workspace?.enabled_dashboards))nav.splice(i,1);
  const navLinks = nav.map(item => <Link href={item.href} prefetch={true} key={item.href} className="nav-link" aria-label={item.href === '/queue' && pending ? `${item.label}, ${pending} waiting` : item.label} aria-current={path === item.href || path.startsWith(item.href + '/') ? 'page' : undefined} title={collapsed ? item.label : undefined} onClick={() => setDrawer(false)}><item.icon size={18} aria-hidden="true" /><span className="nav-label">{item.label}</span>{item.href==='/team-space'&&!!messageCounts.data?.team_unread_count&&<span className="unread-message-dot" aria-label="Unread Team space messages">●</span>}{item.href==='/messages'&&!!(messageCounts.data?.direct_unread_count??messageCounts.data?.unread_count)&&<span className="unread-message-dot" aria-label="Unread messages">●</span>}{item.href==='/suggestions'&&!!suggestions.data?.pending_suggestions&&<span className="nav-queue-count">{suggestions.data.pending_suggestions}</span>}{item.href === '/queue' && pending !== null && pending > 0 && <span className="nav-queue-count"><span className="num">{pending > 99 ? '99+' : pending}</span></span>}</Link>);
  const currentPersona = personas.find(p => p.key === (me.user.email??'').split('.')[0])?.name ?? me.user.name ?? 'a demo user';
  const accountOptions = [{ value: 'settings', label: 'Settings' }, { value: 'signout', label: 'Sign out' }];
  const context = member?.client_name ?? workspace?.name ?? member?.workspace_name ?? 'Your workspace';
  const role = member?.role ? rolesLabel(member,labelsFor(workspace?.role_names)) : 'Account';
  async function switchWorkspace(id:string){if(!me)return;setLoading(true);try{const ws=await request<Workspace>(`/api/workspaces/${id}`);document.cookie=`groundwork-workspace=${id}; Path=/; SameSite=Lax; Max-Age=31536000`;localStorage.setItem('groundwork-workspace',id);setMe({...me,memberships:[...me.memberships].sort((a,b)=>Number(b.workspace_id===id)-Number(a.workspace_id===id))});setWorkspace(ws);router.push(ws.enabled_dashboards?.includes('overview')&&me.memberships.find(m=>m.workspace_id===id)?.is_owner?'/overview':'/dashboard');}catch{setError(true);}finally{setLoading(false);}}
  const workMemberships=me.memberships.filter(m=>m.role!=='client'),clientMemberships=me.memberships.filter(m=>m.role==='client');
  const mixed=workMemberships.length>0&&clientMemberships.length>0;
  const group=member?.role==='client'?clientMemberships:workMemberships;
  const modeSwitch=mixed?<div className="segmented-control company-mode" role="group" aria-label="Account mode"><Button variant="ghost" aria-pressed={member?.role!=='client'} onClick={()=>void switchWorkspace(workMemberships[0].workspace_id)}>Work</Button><Button variant="ghost" aria-pressed={member?.role==='client'} onClick={()=>void switchWorkspace(clientMemberships[0].workspace_id)}>{(member?.role==='client'?member:clientMemberships[0])?.client_kind==='household'?'My home':'As client'}</Button></div>:null;
  const workspaceContext = <div className="workspace-context"><strong data-no-translate>{context}</strong><Badge>{role}</Badge>{(mixed?group:me.memberships).length>1&&<Dropdown label="Company" value={member?.workspace_id??''} options={(mixed?group:me.memberships).map(m=>({value:m.workspace_id,label:m.workspace_name}))} onChange={id=>void switchWorkspace(id)}/>}{!me.user.is_demo&&!workspace?.is_demo&&<Link href="/find-company">Add another company</Link>}<Link href="/onboarding">Continue setup</Link>{workspace?.is_demo && <Badge>Demo</Badge>}</div>;
  const mainNav = nav.filter(item => !['/settings','/today','/documents','/queue','/team','/clients','/import','/supplier'].includes(item.href) || item.href === home || item.href === '/schedule').slice(0,4);
  const mainLinks = navLinks.filter((_, i) => mainNav.includes(nav[i]));
  const navigation = <div className="nav-links">{mainLinks}<button className="nav-link" type="button" onClick={() => setDrawer(true)}><Menu size={18}/><span className="nav-label">More</span></button></div>;
  const overflowNavigation = <div className="nav-links">{navLinks}</div>;
  const accountMenu = (compact = false) => <Dropdown label="Account menu" width={compact ? 44 : 240} menuWidth={240} options={accountOptions} header={<div className="account-info"><strong data-no-translate>{me.user.name ?? 'Your account'}</strong><small>{demoEmail(me.user.email)}</small><Badge>{role}</Badge></div>} onChange={value => { setDrawer(false); value === 'settings' ? guardedAction(() => router.push('/settings')) : openConfirm('signout'); }}>
    <span data-no-translate className="user-initials" aria-hidden="true">{(me.user.name ?? 'Account').split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase()}</span>
    {!compact && <span className="account-copy"><strong data-no-translate>{me.user.name ?? 'Account'}</strong><small>{role}</small></span>}
  </Dropdown>;
  return <ServerLangProvider language={initial?.user===me.user.id?serverLanguage:undefined}><InitialResourceProvider resources={initial?.user===me.user.id?initial.resources:{}}><AppContext.Provider key={`${me.user.id}:${member?.workspace_id??''}`} value={{ me, member, workspace, reload: load, askAssistant: text => { setAsk(a => ({ text, n: (a?.n ?? 0) + 1 })); setAssistant(true); }, updateName: name => setMe(current => current ? { ...current, user: { ...current.user, name } } : current) }}>
    {initial?.user===me.user.id&&languageSetup}<ContactNamesProvider><Translator />
    <a href="#app-content" className="skip-link">Skip to content</a>
    <div className={`app-shell ${collapsed ? 'collapsed' : ''} ${dashboardAssistant ? 'with-dashboard-assistant' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand"><Brand href={home} /><IconButton label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => { setCollapsed(!collapsed); localStorage.setItem('groundwork-sidebar', !collapsed ? 'collapsed' : 'expanded'); }}>{collapsed ? <PanelLeftOpen className="directional-icon" size={20} /> : <PanelLeftClose className="directional-icon" size={20} />}</IconButton></div>
        {workspaceContext}
        <nav aria-label="Main navigation">{navigation}</nav>
        <div className="sidebar-bottom">{accountMenu(collapsed)}</div>
      </aside><div className="app-main"><header className="app-header"><span className="phone-brand"><Mark /></span><div className="header-context">{modeSwitch}{clientDetail.data?.name?<>Clients / <span data-no-translate>{clientDetail.data.name}</span></>:member?.role==='client'&&providerOnlyPath(path)?'Home':nav.find(item => path === item.href || path.startsWith(item.href + '/'))?.label ?? 'Workspace'}</div><div className="header-actions">{!!companyReplies.data?.company_replies&&<Link className="button ghost company-replies" href="/find-company">Company replies <Badge>{companyReplies.data.company_replies}</Badge></Link>}{member && <><Button variant="ghost" className="assistant-launcher" aria-label="Open Agent" onClick={()=>setAssistant(open => !open)}><MessageSquare size={16}/>Agent <kbd data-no-translate>{shortcut}</kbd></Button><Button variant="secondary" className="phone-assistant" onClick={()=>setAssistant(true)}><MessageSquare size={18} aria-hidden="true"/>Agent</Button></>}{member && <span className="notification-trigger"><IconButton label={countError ? 'Notifications: count unavailable' : `Notifications${unread !== null ? `, ${unread} unread` : ''}`} onClick={() => { setNotifications(true); void refreshUnread(); }}><Bell size={20} /></IconButton>{unread !== null && unread > 0 && <span className="count-dot num">{unread > 99 ? '99+' : unread}</span>}</span>}</div></header>{workspace?.is_demo && <div className="demo-banner"><span className="demo-description">Practice data. It resets every 6 hours.</span><span data-no-translate className="demo-persona">{currentPersona}</span><Button className="phone-demo-options" variant="ghost" size="sm" onClick={()=>setDemoOptions(true)}>Switch person</Button></div>}<div className="outbox-slot"><Outbox key={`${me.user.id}:${member?.workspace_id}`}/></div><main id="app-content" className="route-content" key={path}>{(member?.role==='client'&&providerOnlyPath(path))||(member?.role==='technician'&&officeOnlyPath(path))?<NoAccess/>:children}</main></div></div><nav className="bottom-tabs" aria-label="Phone navigation">{mainNav.map(item => <Link key={item.href} aria-label={item.label} href={item.href} prefetch={true} aria-current={path === item.href || path.startsWith(item.href + '/') ? 'page' : undefined}><item.icon size={20} aria-hidden="true" /><span className="tab-label" data-no-translate>{tabWord(htmlLang, tabKey(item.href, member?.role), mainNav.length < 4)}</span></Link>)}<button type="button" aria-label="More" onClick={() => setDrawer(true)}><Menu size={20} /><span className="tab-label" data-no-translate>{tabWord(htmlLang, 'more', mainNav.length < 4)}</span></button></nav><BottomSheet open={demoOptions} onClose={()=>setDemoOptions(false)} title="Switch person"><div className="stack compact">{member?.role==='admin'&&<Link className="button ghost" href="/isolation" onClick={()=>setDemoOptions(false)}>Isolation check</Link>}<Button variant="ghost" onClick={()=>{setDemoOptions(false);openConfirm('switch');}}>Switch persona</Button><Button variant="ghost" onClick={()=>{setDemoOptions(false);openConfirm('reset');}}>Reset demo</Button></div></BottomSheet><BottomSheet open={drawer} onClose={() => setDrawer(false)} title="Your workspace"><div className="workspace-drawer"><Link href={home} className="brand" aria-label="Groundwork home" onClick={() => setDrawer(false)}><Mark /><span className="brand-label">Groundwork</span></Link>{workspaceContext}<nav aria-label="Drawer navigation">{overflowNavigation}</nav><div className="drawer-account">{accountMenu()}<small className="muted">{demoEmail(me.user.email)}</small></div><Button variant="ghost" onClick={() => { setDrawer(false); openConfirm('signout'); }}>Sign out</Button></div></BottomSheet>{member && (assistantLoaded||dashboardAssistant) && <AssistantHost key={`${me.user.id}:${member.workspace_id}`} ws={member.workspace_id} open={assistant} docked={docked} ask={ask} onClose={()=>setAssistant(false)}/>} {member && <Notifications key={`${me.user.id}:${member.workspace_id}`} open={notifications} onClose={() => setNotifications(false)} ws={member.workspace_id} onChange={delta=>{if(delta)setUnread(n=>n===null?null:Math.max(0,n+delta));void refreshUnread();}} />}<ConfirmDialog open={confirm === 'signout'} onClose={() => setConfirm(null)} title="Sign out of Groundwork?" confirmLabel="Sign out" busyLabel="Signing out…" busy={busy} error={actionError} onConfirm={execute}>Your session will end. Sign in again or start a demo to continue.</ConfirmDialog><ConfirmDialog open={confirm === 'reset'} onClose={() => setConfirm(null)} title="Reset your demo?" confirmLabel="Reset demo" busyLabel="Resetting demo…" busy={busy} danger error={actionError} onConfirm={execute}>This deletes changes in your sandbox and creates fresh sample data. This can’t be undone.</ConfirmDialog><BottomSheet open={confirm === 'switch'} onClose={() => setConfirm(null)} title="Switch persona?" busy={busy} footer={<><Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button><Button busy={busy} busyLabel="Switching persona…" onClick={execute}>Switch persona</Button></>}><div className="stack"><p>You’ll stay in this sandbox and continue with the selected role.</p><Dropdown label="Persona" disabled={busy} options={personas.map(p => ({ value: p.key, label: `${p.name} · ${p.role}${p.key===(me.user.email??'').split('.')[0]?' (current)':''}`,disabled:p.key===(me.user.email??'').split('.')[0] }))} value={persona} onChange={setPersona} width={320} />{actionError && <p className="inline-error" role="alert">{actionError}</p>}</div></BottomSheet></ContactNamesProvider></AppContext.Provider></InitialResourceProvider></ServerLangProvider>;
}
