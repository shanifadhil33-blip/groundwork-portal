import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
process.env.INBOX_PASS_SECRET ||= 'test-secret-'.repeat(4);
// Capture what goes to Google, and the cookies the route sets, without a browser.
const calls: { provider: string; options: unknown; params: Record<string, string> }[] = [];
const jar = new Map<string, { value: string; maxAge?: number }>();
vi.mock('next/headers', () => ({ cookies: async () => ({ set: (n: string, v: string, o: { maxAge?: number }) => jar.set(n, { value: v, maxAge: o?.maxAge }) }) }));
let session: string | null = null; // user id behind the session cookie
vi.mock('../lib/auth', () => ({
  sessionCookie: { name: 'authjs.session-token' },
  signIn: async (provider: string, options: unknown, params: Record<string, string>) => { calls.push({ provider, options, params }); return new Response(null, { status: 302, headers: { Location: 'https://accounts.google.com/o/oauth2/v2/auth?prompt=' + params.prompt } }); },
  getSessionUserId: async (req: Request) => (req.headers.get('cookie')?.includes('authjs.session-token=tok') ? session : null),
}));
import { withSystem, closePools } from '../lib/db';
import { GET as pass } from '../app/api/inbox-pass/route';
import { GET as signout } from '../app/api/inbox-pass/signout/route';
let owner = '';
const req = (path: string, cookie = '') => new Request('https://groundwork-portal.vercel.app' + path, { headers: cookie ? { cookie } : {} });
const sessions = async () => (await withSystem(db => db.query('SELECT 1 FROM sessions WHERE "sessionToken"=\'tok\''))).rowCount;
beforeEach(async () => {
  calls.length = 0; jar.clear();
  owner = (await withSystem(db => db.query("INSERT INTO users(name,email) VALUES('Inbox QA',$1) ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id", ['shanifadhil33@gmail.com']))).rows[0].id;
  await withSystem(async db => { await db.query("INSERT INTO accounts(\"userId\",type,provider,\"providerAccountId\") VALUES($1,'oidc','google','qa-inbox') ON CONFLICT DO NOTHING", [owner]); await db.query("DELETE FROM sessions WHERE \"sessionToken\"='tok'"); await db.query("INSERT INTO sessions(\"sessionToken\",\"userId\",expires) VALUES('tok',$1,now()+interval '1 day')", [owner]); });
  session = owner;
});
afterAll(async () => { await withSystem(async db => { await db.query("DELETE FROM sessions WHERE \"sessionToken\"='tok'"); await db.query("DELETE FROM accounts WHERE \"providerAccountId\"='qa-inbox'"); await db.query("DELETE FROM users WHERE id=$1 AND name='Inbox QA'", [owner]); }); await closePools(); });
describe('inbox sign in always shows the Google account picker', () => {
  it('sign in, sign out, sign in again: Google with prompt=select_account every time', async () => {
    // 1 sign in while already signed in as the owner: still Google, with the picker, and the old session is ended first
    let r = await pass(req('/api/inbox-pass', 'authjs.session-token=tok'));
    expect(calls.at(-1)).toMatchObject({ provider: 'google', params: { prompt: 'select_account' } });
    expect(r.headers.get('location')).toContain('prompt=select_account');
    expect(await sessions()).toBe(0); expect(jar.get('authjs.session-token')?.maxAge).toBe(0);
    const flow = jar.get('inbox-flow')!.value; expect(flow).toBeTruthy();
    // back from Google with a fresh session and the flow cookie: the owner gets a pass
    await withSystem(db => db.query("INSERT INTO sessions(\"sessionToken\",\"userId\",expires) VALUES('tok',$1,now()+interval '1 day')", [owner]));
    r = await pass(req('/api/inbox-pass?back=1', `authjs.session-token=tok; inbox-flow=${flow}`));
    expect(r.headers.get('location')).toMatch(/^https:\/\/adhilshanif\.vercel\.app\/inbox\/callback\?t=/);
    expect(jar.get('inbox-flow')?.maxAge).toBe(0); // one use
    // 2 sign out ends the Groundwork session too, and goes home on the fixed address
    r = await signout(req('/api/inbox-pass/signout', 'authjs.session-token=tok'));
    expect(r.status).toBe(303); expect(r.headers.get('location')).toBe('https://adhilshanif.vercel.app/');
    expect(await sessions()).toBe(0); expect(r.headers.getSetCookie().join('\n')).toMatch(/authjs\.session-token=; Path=\/; Max-Age=0/);
    // 3 sign in again: Google with the picker
    calls.length = 0; session = null;
    r = await pass(req('/api/inbox-pass'));
    expect(calls).toHaveLength(1); expect(calls[0].params).toEqual({ prompt: 'select_account' });
  });
  it('back=1 without the flow cookie never skips Google, even with an owner session', async () => {
    const r = await pass(req('/api/inbox-pass?back=1', 'authjs.session-token=tok'));
    expect(calls.at(-1)?.params.prompt).toBe('select_account'); expect(r.headers.get('location')).toContain('accounts.google.com'); expect(await sessions()).toBe(0);
  });
  it('a non owner coming back from Google gets the private page', async () => {
    session = null;
    const r = await pass(req('/api/inbox-pass?back=1', 'inbox-flow=x'));
    expect(r.headers.get('location')).toBe('https://adhilshanif.vercel.app/inbox?denied=1');
  });
});
