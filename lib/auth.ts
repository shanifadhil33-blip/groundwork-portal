import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import PostgresAdapter from '@auth/pg-adapter';
import { ownerPool } from './db';
import { ApiError } from './http';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(ownerPool),
  providers: [Google],
  session: { strategy: 'database' },
  callbacks: { session({ session, user }) { session.user.id = user.id; return session; } },
});
type Resolver = (req: Request) => Promise<string | null>;
let testResolver: Resolver | undefined;
export function setAuthResolverForTests(resolver?: Resolver) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test auth resolver is unavailable');
  testResolver = resolver;
}
export async function getSessionUserId(): Promise<string | null> {
  return (await auth())?.user?.id ?? null;
}
export async function requireUser(req: Request): Promise<string> {
  const id = process.env.NODE_ENV === 'test' && testResolver ? await testResolver(req) : await getSessionUserId();
  if (!id) throw new ApiError(401, 'unauthenticated', 'Sign in to continue.');
  return id;
}
