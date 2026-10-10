import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import { ThemeProvider, themeScript } from '../components/ui/theme';
import { ToastProvider } from '../components/ui/toast';
import './globals.css';
const geist = Geist({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });
export const metadata: Metadata = { title: { default: 'Groundwork — client portal & back office', template: '%s · Groundwork' }, description: 'A client portal and back office for service companies. Work orders, private client views, spreadsheet approval, supplier sync, and AI agent access through MCP.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function Layout({ children }: { children: ReactNode }) { return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body className={geist.variable}><ThemeProvider><ToastProvider>{children}</ToastProvider></ThemeProvider></body></html>; }
