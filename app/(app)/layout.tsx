import type { ReactNode } from 'react';
import { AppShell } from '../../components/app/shell';
import { getAppPageData } from '../../lib/server-page-data';
import { appLanguageScript, validatedAppLanguage } from '../../lib/head-scripts';
import { DEFAULT_LANGUAGE } from '../../lib/languages';
import { isEnglish, languageFileUrl } from '../../lib/i18n';
export default async function Layout({ children }: { children: ReactNode }) {
  const initial=await getAppPageData();
  const preferences=initial?.resources['/api/me/preferences'];
  const lang=preferences&&'data' in preferences?validatedAppLanguage((preferences.data as {language?:unknown})?.language??DEFAULT_LANGUAGE):undefined;
  const languageSetup=lang?<><script dangerouslySetInnerHTML={{__html:appLanguageScript(lang)}}/>{!isEnglish(lang)&&<link rel="preload" href={languageFileUrl(lang)} as="fetch" crossOrigin="anonymous"/>}</>:undefined;
  return <AppShell initial={initial} serverLanguage={lang} languageSetup={languageSetup}>{children}</AppShell>;
}
