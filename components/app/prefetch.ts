'use client';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { request } from '../../lib/ui/api';
import { prefetchResource } from '../../lib/ui/resource-cache';

/**
 * DESIGN-SPEC 6.3: on pointer enter, focus and touch start, fetch the page and its first data request,
 * so the job opens with its content instead of a skeleton.
 */
export function usePrefetch() {
  const router = useRouter();
  return useCallback((href: string, api?: string) => {
    const warm = () => { router.prefetch(href); if (api) prefetchResource(api, () => request(api)); };
    return { onPointerEnter: warm, onFocus: warm, onTouchStart: warm };
  }, [router]);
}
