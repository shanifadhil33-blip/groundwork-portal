'use client';
import { createContext, useContext } from 'react';
export type Membership = { workspace_id: string; workspace_name: string; role: 'admin' | 'staff' | 'client'; client_id: string | null; client_name: string | null };
export type Me = { user: { id: string; name: string | null; email: string; image: string | null }; memberships: Membership[] };
export type Workspace = { id: string; name: string; is_demo: boolean; timezone: string; country: string; region: string | null; currency: string };
export const AppContext = createContext<{ me: Me; member: Membership | null; workspace: Workspace | null; reload: () => void; updateName: (name: string) => void } | null>(null);
export function useApp() { const value = useContext(AppContext); if (!value) throw new Error('App context required'); return value; }
