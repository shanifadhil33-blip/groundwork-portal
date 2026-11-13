import 'server-only';
import { cache } from 'react';
import { getSessionUserId } from './auth';
import { getPreferences } from './services/settings';
import { notificationLanguage, notificationWords } from './notification-words';
import { replaceTranslation } from './i18n';

const chromeCopy = ['Groundwork home', 'Public navigation', 'Sign in', 'Try the demo', 'Go to dashboard', 'Open the app', 'Home', 'Back', 'Legal', 'Privacy', 'Terms'];

// Like app page data, deduplicate only within the request. Never cache a user's preference globally.
export const getPublicPageData = cache(async () => {
  const user = await getSessionUserId();
  const preferences = user ? await getPreferences(user, false) : undefined;
  const language = typeof preferences?.language === 'string' ? notificationLanguage(preferences.language) : undefined;
  // These helpers read the same checked in language files used by the app, without a translation service.
  const words = language ? notificationWords(language) : {};
  const translations = Object.fromEntries(chromeCopy.map(source => [source, replaceTranslation(source, words)]));
  return { signedIn: !!user, language, translations };
});
