import type { ReactNode } from 'react';
import { PublicHeader, PublicFooter } from '../../components/public/chrome';
import { StaticSessionHeader } from '../../components/public/static-session-header';
import { PublicLanguage } from '../../components/public/language';
import { getPublicPageData } from '../../lib/public-page-data';
import { appLanguageScript } from '../../lib/head-scripts';

export default async function Layout({ children }: { children: ReactNode }) {
  const { signedIn, language, translations } = await getPublicPageData();
  return <PublicLanguage language={language} translations={translations}>
    {language && <script dangerouslySetInnerHTML={{ __html: appLanguageScript(language) }} />}
    {signedIn ? <PublicHeader signedIn /> : <StaticSessionHeader />}
    <main id="main" className="route-content">{children}</main><PublicFooter />
  </PublicLanguage>;
}
