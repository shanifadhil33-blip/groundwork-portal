'use client';
import { createContext, useContext } from 'react';
import type { Role } from '../../lib/roles';
export type Membership = { workspace_id: string; workspace_name: string; role: Role; extra_roles?: string[]; staff_kind?: string | null; client_kind?:string|null;is_owner?:boolean;is_manager?:boolean; client_id: string | null; client_name: string | null };
export type Me = { household_preview?: {workspace_id:string;address:string;simulated:true}|null; user: { id: string; name: string | null; email: string | null; image: string | null; phone?:string|null; is_demo?:boolean }; onboarding_started?:boolean; memberships: Membership[] };
export type Workspace = { id: string; name: string; is_demo: boolean; timezone: string; country: string; region: string | null; currency: string; approval_mode?: 'important'|'every'; owner_handover?:string[]; role_names?: Record<string,string>;company_size?:'small'|'big';enabled_roles?:string[];enabled_dashboards?:string[] };
export const AppContext = createContext<{ me: Me; member: Membership | null; workspace: Workspace | null; homeDocked?: boolean; reload: () => void; updateName: (name: string) => void; askAssistant?: (text: string) => void } | null>(null);
export function useApp() { const value = useContext(AppContext); if (!value) throw new Error('App context required'); return value; }
