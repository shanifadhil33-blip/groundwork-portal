import type { Adapter } from 'next-auth/adapters';
export function maySignIn({ email, isDemo, provider, emailVerified }: { email?: string | null; isDemo?: boolean; provider?: string; emailVerified?: unknown }) {
  return !isDemo && !email?.toLowerCase().endsWith('@demo.groundwork.invalid') && (provider !== 'google' || emailVerified === true);
}
export function guardDemoAccountLinking(adapter: Adapter, isDemo: (id: string) => Promise<boolean>): Adapter {
  return { ...adapter, async linkAccount(account) {
    if (await isDemo(account.userId)) throw new Error('Demo accounts cannot link sign-in providers');
    return (await adapter.linkAccount!(account)) ?? undefined;
  } };
}
