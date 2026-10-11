import type { ReactNode } from 'react';
import { AppShell } from '../../components/app/shell';
import { getAppPageData } from '../../lib/server-page-data';
export default async function Layout({ children }: { children: ReactNode }) { const initial=await getAppPageData(); return <AppShell initial={initial}>{children}</AppShell>; }
