'use client';
import { useContext } from 'react';
import { AppContext } from '../../components/app/context';
import { PageError } from '../../components/ui/page-error';
import { navFor } from '../../lib/ui/nav';

/** A page that failed to render, inside the app: one line, Try again and the way to this person's Home. */
export default function ErrorPage({ reset, retry }: { reset?: () => void; retry?: () => void }) {
  const member = useContext(AppContext)?.member;
  return <PageError title="We couldn’t open this page." message="Something went wrong on our side. Please try again." retry={reset ?? retry} home={member ? navFor(member).home : '/'} homeLabel="Go to Home" footer={false} brand={false} />;
}
