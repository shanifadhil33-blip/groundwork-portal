import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import PostgresAdapter from '@auth/pg-adapter';
import { ownerPool } from './db';
import { ApiError } from './http';

export const sessionCookie = {name:process.env.NODE_ENV==='production'?'__Secure-authjs.session-token':'authjs.session-token',options:{httpOnly:true,sameSite:'lax' as const,path:'/',secure:process.env.NODE_ENV==='production'}};
export const authAdapter=PostgresAdapter(ownerPool);
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: authAdapter,
  cookies: { sessionToken: sessionCookie },
  providers: [Google],
  session: { strategy: 'database' },
  callbacks: { async signIn({user}) { const found=await ownerPool.query('SELECT is_demo FROM users WHERE lower(email)=lower($1)',[user.email??'']); return !found.rows[0]?.is_demo && !user.email?.toLowerCase().endsWith('@demo.groundwork.invalid'); }, session({ session, user }) { session.user.id = user.id; return session; } },
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
  if (!id) throw new ApiError(401, 'unauthenticated', 'Sign in to continue.');
  return id;
}
