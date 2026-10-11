// Plain strings for <head>, kept out of 'use client' modules: a client module export reaches a server component
// as a client reference, and the inline script would render as a throwing stub instead of the code.
export const themeScript = `try{var t=localStorage.getItem('groundwork-theme')||'system';document.documentElement.dataset.theme=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}`;
export const SESSION_HINT_KEY = 'gw-session';
/** Pre-paint: apply the last known signed in state, so a static public page does not swap its header after load. */
export const sessionHintScript = `try{var s=localStorage.getItem('${SESSION_HINT_KEY}');if(s==='in'||s==='out')document.documentElement.dataset.session=s}catch(e){}`;
