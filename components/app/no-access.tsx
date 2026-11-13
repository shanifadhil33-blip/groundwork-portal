'use client';
import { useContext } from 'react';
import { AppContext } from './context';
import { PageError } from '../ui/page-error';
import { navFor } from '../../lib/ui/nav';

/** Blocked page inside the app: says who can open it and offers the way Home. No second logo, no public footer. */
export function NoAccess() {
  const member = useContext(AppContext)?.member;
  const message = member?.role === 'client' ? 'This page is for your maintenance company’s team.'
    : member?.role === 'technician' ? 'Only the office can open this page.'
    : 'Only the owner or an admin can open this page.';
  return <PageError title="You can’t open this page." message={message} home={member ? navFor(member).home : '/sign-in'} homeLabel={member ? 'Go to Home' : 'Sign in'} footer={false} brand={false} />;
}
