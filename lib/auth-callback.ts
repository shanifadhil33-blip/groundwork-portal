/** Remove exactly the configured session cookie, preserving OAuth cookies verbatim. */
export function stripSessionCookie(cookie: string | null, name: string) {
  const tokens: string[] = [];
  const kept = (cookie ?? '').split(';').filter(part => {
    const trimmed = part.trim();
    if (trimmed.slice(0, trimmed.indexOf('=')) !== name) return true;
    tokens.push(trimmed.slice(trimmed.indexOf('=') + 1));
    return false;
  });
  return { cookie: cookie === null ? null : kept.join(';'), tokens };
}
export function withoutSessionCookie(request: Request, name: string) {
  const stripped = stripSessionCookie(request.headers.get('cookie'), name);
  const headers = new Headers(request.headers);
  if (stripped.cookie?.trim()) headers.set('cookie', stripped.cookie);
  else headers.delete('cookie');
  return { request: new Request(request.clone(), { headers }), tokens: stripped.tokens };
}
