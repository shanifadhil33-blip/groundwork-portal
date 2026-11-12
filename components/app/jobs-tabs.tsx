'use client';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useApp } from './context';
import { useResource } from './resource';
import { isOffice } from '../../lib/roles';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Jobs: All and To approve, for office roles. Each tab is its own address, so Back works. */
export function JobsTabs({ current }: { current: 'all' | 'approve' }) {
  const { member } = useApp(), list = useRef<HTMLDivElement>(null);
  const summary = useResource<{ pending_queue_rows?: number; pending_suggestions?: number }>(member && isOffice(member.role) ? `/api/workspaces/${member.workspace_id}/to-approve-count` : null);
  useIsoLayoutEffect(() => {
    const el = list.current, tab = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !tab) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    el.style.setProperty('--tab-w', `${tab.offsetWidth}px`);
    el.style.setProperty('--tab-x', `${rtl ? tab.offsetLeft + tab.offsetWidth - el.offsetWidth : tab.offsetLeft}px`);
  }, [current]);
  if (!member || !isOffice(member.role)) return null;
  const waiting = (summary.data?.pending_queue_rows ?? 0) + (summary.data?.pending_suggestions ?? 0);
  return (
    <nav className="tabs-scroll" aria-label="Jobs">
      <div className="tabs" ref={list}>
        <Link href="/work-orders" role="tab" aria-selected={current === 'all'} aria-current={current === 'all' ? 'page' : undefined}>All</Link>
        <Link href="/work-orders?tab=approve" role="tab" aria-selected={current === 'approve'} aria-current={current === 'approve' ? 'page' : undefined}>
          <span>To approve</span>{waiting > 0 && <> <span className="nav-count num" data-no-translate>{waiting}</span></>}
        </Link>
      </div>
    </nav>
  );
}
