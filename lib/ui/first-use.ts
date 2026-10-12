/** The getting started checklist's state, in a cookie too so the dashboard renders it on the server in the first paint. */
export const firstUseCookie = (ws: string) => `groundwork-first-use-${ws}`;
export function rememberFirstUse(ws: string, state: 'started' | 'dismissed') {
  try { localStorage.setItem(`first-use:${ws}`, state); } catch {}
  document.cookie = `${firstUseCookie(ws)}=${state}; Path=/; SameSite=Lax; Max-Age=31536000`;
}
