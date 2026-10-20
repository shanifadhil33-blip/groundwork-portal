import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Manrope, IBM_Plex_Sans_Arabic, Noto_Sans_Tamil, Noto_Sans_Malayalam, Noto_Sans_Devanagari, Noto_Sans_Bengali, Noto_Sans_Sinhala, Noto_Sans_SC, Noto_Sans_Ethiopic, Noto_Sans } from 'next/font/google';
import { ThemeProvider } from '../components/ui/theme';
import { ToastProvider } from '../components/ui/toast';
import { RequestRecovery } from '../components/ui/request-recovery';
import { languageHintScript, sessionHintScript, themeScript } from '../lib/head-scripts';
import './globals.css';
import './desert-stone.css';
// Desert Stone (Oct 21 2026): Manrope for Latin, IBM Plex Sans Arabic 400 and 600 for Arabic.
const geist = Manrope({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });
// Real faces for each script at weight 400 (no fake bold). Each only downloads when its characters are on screen.
const tamil = Noto_Sans_Tamil({ weight: '400', display: 'swap', preload: false, subsets: ['tamil'], variable: '--font-tamil' });
const malayalam = Noto_Sans_Malayalam({ weight: '400', display: 'swap', preload: false, subsets: ['malayalam'], variable: '--font-malayalam' });
const devanagari = Noto_Sans_Devanagari({ weight: '400', display: 'swap', preload: false, subsets: ['devanagari'], variable: '--font-devanagari' });
const bengali = Noto_Sans_Bengali({ weight: '400', display: 'swap', preload: false, subsets: ['bengali'], variable: '--font-bengali' });
const arabic = IBM_Plex_Sans_Arabic({ weight: ['400', '600'], display: 'swap', preload: false, subsets: ['arabic'], variable: '--font-arabic' });
const sinhala = Noto_Sans_Sinhala({ weight: '400', display: 'swap', preload: false, subsets: ['sinhala'], variable: '--font-sinhala' });
const chinese = Noto_Sans_SC({ weight: '400', display: 'swap', preload: false, variable: '--font-chinese' });
const ethiopic = Noto_Sans_Ethiopic({ weight: '400', display: 'swap', preload: false, subsets: ['ethiopic'], variable: '--font-ethiopic' });
const notoLatin = Noto_Sans({ weight: '400', display: 'swap', preload: false, subsets: ['latin-ext'], variable: '--font-noto' });
const fontVars = [geist, tamil, malayalam, devanagari, bengali, arabic, sinhala, chinese, ethiopic, notoLatin].map(f => f.variable).join(' ');
export const metadata: Metadata = { title: { default: 'Groundwork: client portal and back office', template: '%s · Groundwork' }, description: 'A client portal and back office for service companies. Jobs, private client views, spreadsheet approval, supplier sync, and AI agent access through MCP.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function Layout({ children }: { children: ReactNode }) { return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript + ';' + sessionHintScript + ';' + languageHintScript }} /></head><body className={fontVars}><ThemeProvider><ToastProvider><RequestRecovery />{children}</ToastProvider></ThemeProvider></body></html>; }
