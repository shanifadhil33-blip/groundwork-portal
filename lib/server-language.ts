import 'server-only';
import { readFile } from 'node:fs/promises';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { DEFAULT_LANGUAGE, isRtl } from './languages';
import { validatedAppLanguage } from './head-scripts';
import { LANGUAGE_COOKIE } from './language-cookie';
import { isEnglish, readTranslationCache } from './i18n';
import { getAppPageData } from './server-page-data';
export const getServerLanguage = cache(async () => {
  const hint = validatedAppLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value);
  // A cookie can belong to the previous account. A signed in preference is authoritative.
  const app = await getAppPageData();
  const pref = app?.resources['/api/me/preferences'];
  const language = pref && 'data' in pref
    ? validatedAppLanguage((pref.data as {language?:unknown}).language) ?? DEFAULT_LANGUAGE
    : hint ?? DEFAULT_LANGUAGE;
  const words = isEnglish(language) ? {} : readTranslationCache(await readFile(`${process.cwd()}/public/i18n/${language}.json`, 'utf8'), language);
  return { language, dir: isRtl(language) ? 'rtl' as const : 'ltr' as const, words: {...words} };
});
