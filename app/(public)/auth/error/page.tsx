import Link from 'next/link';
import type { Metadata } from 'next';
import { BackLink } from '../../../../components/public/chrome';
import { authErrorCopy } from '../../../../lib/ui/auth-errors';
export const metadata: Metadata = { title: 'Sign-in problem' };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const copy = authErrorCopy((await searchParams).error);
  return <div className="auth-page"><BackLink /><div className="card auth-card"><h1>{copy.title}</h1><p>{copy.message}</p><Link href="/sign-in" className="button primary">Try again</Link><Link href="/" className="button secondary">Back to home</Link></div></div>;
}
