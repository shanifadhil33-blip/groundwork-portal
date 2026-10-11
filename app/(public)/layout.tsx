import type { ReactNode } from 'react';
import { PublicFooter } from '../../components/public/chrome';
import { StaticSessionHeader } from '../../components/public/static-session-header';
export default function Layout({ children }: { children: ReactNode }) { return <><StaticSessionHeader /><main id="main" className="route-content">{children}</main><PublicFooter /></>; }
