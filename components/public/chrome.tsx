'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { usePublicCopy } from './language';
export function Mark() { return <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor" /><path d="M8 10h16v4H12v8h8v-4h-4" fill="none" stroke="var(--ink-fg)" strokeWidth="3" strokeLinejoin="round" /></svg>; }
export function Brand({ href = '/', label = true }: { href?: string; label?: boolean }) { const t = usePublicCopy(); return <Link href={href} className="brand" aria-label={t(href === '/' ? 'Groundwork home' : 'Home')}><Mark />{label && <span className="brand-label">Groundwork</span>}</Link>; }
/**
 * signedIn known (server rendered pages): render that state. Unknown (static pages): render both, and let the
 * html data-session hint (set before paint from the last known state, then confirmed) pick one. The swap is a
 * plain display change, never animated; until the state is known the signed out set holds its space invisibly.
 */
/** quiet: the logo only, for Sign in and the demo picker, where the page itself is the one door. */
export function PublicHeader({signedIn,quiet:quietProp=false}:{signedIn?:boolean;quiet?:boolean}={}) {
  const t = usePublicCopy(), quiet = quietProp;
  const signedOut=<><Link href="/sign-in" className="link-button ghost">{t('Sign in')}</Link><Link href="/demo" className="link-button primary">{t('Try the demo')}</Link></>;
  const dashboard=<Link href="/dashboard" className="link-button primary">{t('Open the app')}</Link>;
  return <header className="public-header"><Brand />{quiet?null:<nav aria-label={t('Public navigation')} className="row">{signedIn===undefined?<><span className="session-variant" data-variant="out">{signedOut}</span><span className="session-variant" data-variant="in">{dashboard}</span></>:signedIn?dashboard:signedOut}</nav>}</header>;
}
export function PublicFooter() { const t = usePublicCopy(); return <footer className="public-footer"><div className="footer-brand"><Brand /><small>© 2026 Groundwork</small></div><nav aria-label={t('Legal')} className="row"><Link href="/privacy">{t('Privacy')}</Link><Link href="/terms">{t('Terms')}</Link></nav></footer>; }
export function BackLink({ href = '/', label = 'Home' }: { href?: string; label?: string }) { const t = usePublicCopy(); return <Link href={href} className="back-link"><ArrowLeft className="directional-icon" size={16} />{t(label)}</Link>; }
