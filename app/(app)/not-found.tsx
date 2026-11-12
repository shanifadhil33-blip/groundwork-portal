'use client';
import { useContext } from 'react';
import { AppContext } from '../../components/app/context';
import { PageError } from '../../components/ui/page-error';
import { navFor } from '../../lib/ui/nav';

/** A missing record or page inside the app keeps the menu and offers Home. */
export default function NotFound() {
  const member = useContext(AppContext)?.member;
  return <PageError title="We couldn’t find that page." message="It may have been moved or removed." home={member ? navFor(member).home : '/'} homeLabel="Go to Home" footer={false} brand={false} />;
}
