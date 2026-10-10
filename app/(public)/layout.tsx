import type { ReactNode } from 'react';
import { PublicHeader, PublicFooter } from '../../components/public/chrome';
export default function Layout({ children }: { children: ReactNode }) { return <><PublicHeader /><main id="main" className="route-content">{children}</main><PublicFooter /></>; }
