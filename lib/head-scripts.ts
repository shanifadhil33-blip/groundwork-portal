// Plain strings for <head>, kept out of 'use client' modules: a client module export reaches a server component
// as a client reference, and the inline script would render as a throwing stub instead of the code.
export const themeScript = `try{var t=localStorage.getItem('groundwork-theme')||'system';document.documentElement.dataset.theme=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}`;
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
