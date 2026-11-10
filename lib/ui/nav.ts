import { Building2, CalendarCheck, CalendarDays, CalendarOff, CircleHelp, ClipboardList, FileCheck, House, MapPin, MessageSquare, Settings, Users, type LucideIcon } from 'lucide-react';
import type { TabKey } from '../tab-words';

/** One set of role names used everywhere: picker, chips, Team, blocked messages. */
export type RoleGroup = 'owner' | 'admin' | 'supervisor' | 'office' | 'technician' | 'client_manager' | 'client_staff' | 'home_client';
type MemberLike = { role?: string | null; staff_kind?: string | null; client_kind?: string | null; is_owner?: boolean } | null | undefined;

export function roleGroup(member: MemberLike): RoleGroup | null {
  if (!member?.role) return null;
  if (member.role === 'admin') return member.is_owner ? 'owner' : 'admin';
  if (member.role === 'staff') return member.staff_kind === 'office' ? 'office' : 'supervisor';
  if (member.role === 'technician') return 'technician';
  return member.client_kind === 'household' ? 'home_client' : member.client_kind === 'office' ? 'client_staff' : 'client_manager';
}

export const ROLE_NAME: Record<RoleGroup, string> = {
  owner: 'Owner', admin: 'Admin', supervisor: 'Supervisor', office: 'Office staff', technician: 'Technician',
  client_manager: 'Client manager', client_staff: 'Client staff', home_client: 'Home client',
};

/** One line on what this role can do. Shown in the demo bar and on the demo picker. */
export const ROLE_CAN_DO: Record<RoleGroup, string> = {
  owner: 'Runs the company. Sees everything, approves the day plan, sets up the company.',
  admin: 'Same as the owner, except closing the company.',
  supervisor: 'Plans the day, gives jobs to technicians, checks prices.',
  office: 'Adds jobs and answers clients.',
  technician: 'Sees his jobs for today and reports when done.',
  client_manager: 'Asks for work at his buildings and approves prices.',
  client_staff: 'Asks for work and follows it.',
  home_client: 'Asks for work at his home.',
};

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Other routes that count as this item, so the highlight always follows the screen. */
  also?: string[];
  /** Short word for the phone bar, chosen per language so it fits. */
  tab?: TabKey;
  badge?: 'approve' | 'messages';
};

const HOME: NavItem = { href: '/dashboard', label: 'Home', icon: House, also: ['/overview'], tab: 'home' };
const JOBS: NavItem = { href: '/work-orders', label: 'Jobs', icon: ClipboardList, also: ['/queue', '/suggestions', '/import', '/supplier'], tab: 'jobs', badge: 'approve' };
const SCHEDULE: NavItem = { href: '/schedule', label: 'Schedule', icon: CalendarDays, tab: 'schedule' };
const CLIENTS: NavItem = { href: '/clients', label: 'Clients', icon: Building2 };
const TEAM: NavItem = { href: '/team', label: 'Team', icon: Users };
const MESSAGES: NavItem = { href: '/messages', label: 'Messages', icon: MessageSquare, also: ['/team-space'], badge: 'messages' };
const SETTINGS: NavItem = { href: '/settings', label: 'Settings', icon: Settings, also: ['/documents', '/audit'] };
const HELP: NavItem = { href: '/help', label: 'Help', icon: CircleHelp, also: ['/how-agent-works'] };
const TODAY: NavItem = { href: '/today', label: 'Today', icon: CalendarCheck, tab: 'today' };
const MY_JOBS: NavItem = { href: '/work-orders', label: 'My jobs', icon: ClipboardList, tab: 'myjobs' };
const REQUESTS: NavItem = { href: '/home', label: 'Requests', icon: ClipboardList, also: ['/work-orders'], tab: 'requests' };
const SITES: NavItem = { href: '/sites', label: 'Sites', icon: MapPin };
const MY_RECORD: NavItem = { href: '/my-record', label: 'My record', icon: FileCheck };
const TIME_OFF: NavItem = { href: '/time-off', label: 'Time off', icon: CalendarOff };

export type Nav = {
  /** The person's own Home inside the app. The logo goes here, never to the public site. */
  home: string;
  /** Laptop sidebar, top. At most six. */
  sidebar: NavItem[];
  /** Phone bottom bar, before More. At most three. */
  tabs: NavItem[];
  /** Phone More sheet. */
  more: NavItem[];
};

export function navFor(member: MemberLike): Nav {
  switch (roleGroup(member)) {
    case 'owner':
    case 'admin':
      return { home: '/dashboard', sidebar: [HOME, JOBS, SCHEDULE, CLIENTS, TEAM, MESSAGES], tabs: [HOME, JOBS, SCHEDULE], more: [MESSAGES, CLIENTS, TEAM, SETTINGS, HELP] };
    case 'supervisor':
      return { home: '/dashboard', sidebar: [HOME, JOBS, SCHEDULE, TEAM, CLIENTS, MESSAGES], tabs: [HOME, JOBS, SCHEDULE], more: [MESSAGES, CLIENTS, TEAM, SETTINGS, HELP] };
    case 'office':
      return { home: '/dashboard', sidebar: [HOME, JOBS, SCHEDULE, CLIENTS, MESSAGES], tabs: [HOME, JOBS, SCHEDULE], more: [MESSAGES, CLIENTS, SETTINGS, HELP] };
    case 'technician':
      return { home: '/today', sidebar: [TODAY, MY_JOBS, MESSAGES], tabs: [TODAY, MY_JOBS, MESSAGES], more: [MY_RECORD, TIME_OFF, SETTINGS, HELP] };
    case 'client_manager':
      return { home: '/home', sidebar: [REQUESTS, SITES, MESSAGES], tabs: [REQUESTS, MESSAGES], more: [SITES, SETTINGS, HELP] };
    case 'client_staff':
    case 'home_client':
      return { home: '/home', sidebar: [REQUESTS, MESSAGES], tabs: [REQUESTS, MESSAGES], more: [SETTINGS, HELP] };
    default:
      return { home: '/onboarding', sidebar: [], tabs: [], more: [SETTINGS, HELP] };
  }
}

export const SETTINGS_ITEM = SETTINGS;
export const HELP_ITEM = HELP;

const under = (path: string, base: string) => path === base || path.startsWith(base + '/');
export function isCurrent(item: NavItem, path: string) {
  return under(path, item.href) || !!item.also?.some(base => under(path, base));
}

/** A detail page shows a back arrow in place of the logo. Returns where it goes, or null on a top level screen. */
export function parentOf(path: string, nav: Nav): string | null {
  const top = [...nav.sidebar, ...nav.more, SETTINGS, HELP].some(item => item.href === path);
  if (top || path === nav.home) return null;
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const parent = '/' + parts.slice(0, -1).join('/');
  // /work-orders/123/edit goes back to the job, /work-orders/123 to the list.
  return parent;
}
