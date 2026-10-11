import type { ReactNode } from 'react';
import { PublicFooter } from '../../components/public/chrome';
import { SessionHeader } from '../../components/public/session-header';
export default function Layout({ children }: { children: ReactNode }) { return <><SessionHeader /><main id="main" className="route-content">{children}</main><PublicFooter /></>; }
