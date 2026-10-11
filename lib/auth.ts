import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import PostgresAdapter from '@auth/pg-adapter';
import { ownerPool } from './db';
import { ApiError } from './http';
import { guardDemoAccountLinking, maySignIn } from './auth-guards';

export const sessionCookie = {name:process.env.NODE_ENV==='production'?'__Secure-authjs.session-token':'authjs.session-token',options:{httpOnly:true,sameSite:'lax' as const,path:'/',secure:process.env.NODE_ENV==='production'}};
export const authAdapter=guardDemoAccountLinking(PostgresAdapter(ownerPool), async id => Boolean((await ownerPool.query('SELECT is_demo FROM users WHERE id=$1',[id])).rows[0]?.is_demo));
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: authAdapter,
  cookies: { sessionToken: sessionCookie },
  providers: [Google({ allowDangerousEmailAccountLinking: true })],
  pages: { signIn: '/sign-in', error: '/auth/error' },
  session: { strategy: 'database' },
  callbacks: { async signIn({user,account,profile}) { const found=await ownerPool.query('SELECT is_demo FROM users WHERE lower(email)=lower($1)',[user.email??'']); return maySignIn({email:user.email,isDemo:found.rows[0]?.is_demo,provider:account?.provider,emailVerified:profile?.email_verified}); }, session({ session, user }) { session.user.id = user.id; return session; } },
});
type Resolver = (req: Request) => Promise<string | null>;
let testResolver: Resolver | undefined;
export function setAuthResolverForTests(resolver?: Resolver) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test auth resolver is unavailable');
  testResolver = resolver;
}
export async function getSessionUserId(req?:Request): Promise<string | null> {
  if(!req)return (await auth())?.user?.id ?? null;
  const token=req.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(sessionCookie.name+'='))?.slice(sessionCookie.name.length+1);
  if(!token)return null;
  const found=await authAdapter.getSessionAndUser!(token);
  if(!found || new Date(found.session.expires)<=new Date())return null;
  const demo=(await ownerPool.query('SELECT u.is_demo,w.demo_expires_at FROM users u LEFT JOIN workspaces w ON w.id=u.demo_workspace_id WHERE u.id=$1',[found.user.id])).rows[0];
  if(demo?.is_demo && (!demo.demo_expires_at || new Date(demo.demo_expires_at)<=new Date()))return null;
  return found.user.id;
}
export async function requireUser(req: Request): Promise<string> {
  const id = process.env.NODE_ENV === 'test' && testResolver ? await testResolver(req) : await getSessionUserId(req);
  if (!id) {
    const cookie=req.headers.get('cookie');
    const token=cookie?.split(';').map(part=>part.trim()).find(part=>part.startsWith(sessionCookie.name+'='))?.slice(sessionCookie.name.length+1);
    const demo=cookie?.split(';').some(part=>part.trim()==='groundwork-demo=1') || (token && Boolean((await ownerPool.query('SELECT u.is_demo FROM sessions s JOIN users u ON u.id=s."userId" WHERE s."sessionToken"=$1',[token])).rows[0]?.is_demo));
    throw new ApiError(401, demo ? 'demo_ended' : 'unauthenticated', demo ? 'This demo has ended. Start a new demo to continue.' : 'Your session ended. Sign in again to continue.');
  }
  return id;
}
