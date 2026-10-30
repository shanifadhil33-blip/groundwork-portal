import { DEFAULT_LANGUAGE } from './languages';
import { validatedAppLanguage } from './head-scripts';
export const LANGUAGE_COOKIE = 'gw-lang';
export function languageCookie(value: unknown): string {
  return `${LANGUAGE_COOKIE}=${validatedAppLanguage(value) ?? DEFAULT_LANGUAGE}; Path=/; SameSite=Lax; Max-Age=31536000`;
}
