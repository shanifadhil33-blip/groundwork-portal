import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
export function Mark() { return <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor" /><path d="M8 10h16v4H12v8h8v-4h-4" fill="none" stroke="var(--primary-fg)" strokeWidth="3" strokeLinejoin="round" /></svg>; }
export function Brand({ href = '/' }: { href?: string }) { return <Link href={href} className="brand" aria-label="Groundwork home"><Mark /><span className="brand-label">Groundwork</span></Link>; }
export function PublicHeader() { return <header className="public-header"><Brand /><nav aria-label="Public navigation" className="row"><Link href="/sign-in" className="link-button ghost">Sign in</Link><Link href="/demo" className="link-button primary">Try the demo</Link></nav></header>; }
export function PublicFooter() { return <footer className="public-footer"><div className="footer-brand"><Brand /><small>© 2026 Groundwork</small></div><nav aria-label="Legal" className="row"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav></footer>; }
export function BackLink({ href = '/', label = 'Home' }: { href?: string; label?: string }) { return <Link href={href} className="back-link"><ArrowLeft size={16} />{label}</Link>; }
