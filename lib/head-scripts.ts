// Plain strings for <head>, kept out of 'use client' modules: a client module export reaches a server component
// as a client reference, and the inline script would render as a throwing stub instead of the code.
import { LANGUAGES, isRtl } from './languages';
export const themeScript = `try{var t=localStorage.getItem('groundwork-theme')||'light';document.documentElement.dataset.theme=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}`;
const SESSION_HINT_KEY = 'gw-session';
/**
 * Pre-paint: apply the last known signed in state, so a static public page does not swap its header after load.
 * No hint means a first visit, which is almost always signed out, so the buttons show at once; the signed in app
 * records 'in' and sign out records 'out', and the session check corrects the rare stale hint.
 */
export const sessionHintScript = `try{document.documentElement.dataset.session=localStorage.getItem('${SESSION_HINT_KEY}')==='in'?'in':'out'}catch(e){document.documentElement.dataset.session='out'}`;
export function rememberSession(state: 'in' | 'out') {
  document.documentElement.dataset.session = state;
  try { localStorage.setItem(SESSION_HINT_KEY, state); } catch {}
}
/** Pre-paint: a person who reads the app in another language never sees English first. The Translator lifts this once
 * the screen is translated. RTL is set here too so the layout does not flip after load. */
export const LANG_HINT_KEY = 'groundwork-lang';
/** Only language codes from the app list may reach an inline script. */
export function validatedAppLanguage(value: unknown): string | undefined {
  return typeof value === 'string' && LANGUAGES.some(l => l.code === value) ? value : undefined;
}
/** The server preference takes precedence over a stale browser hint, including a switch back to English. */
export function appLanguageScript(value: unknown): string {
  const lang = validatedAppLanguage(value);
  if (!lang) return '';
  const cookie = `document.cookie='gw-lang=${lang}; Path=/; SameSite=Lax; Max-Age=31536000';`;
  if (/^en(-|$)/i.test(lang)) return `var d=document.documentElement;d.lang=${JSON.stringify(lang)};d.dir='ltr';${cookie}delete d.dataset.translating;try{localStorage.removeItem('${LANG_HINT_KEY}')}catch(e){}`;
  return `var d=document.documentElement;d.lang=${JSON.stringify(lang)};d.dir='${isRtl(lang) ? 'rtl' : 'ltr'}';${cookie}try{localStorage.setItem('${LANG_HINT_KEY}',${JSON.stringify(lang)})}catch(e){}`;
}
