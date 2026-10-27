"use client";
import { useEffect, useRef } from 'react';

/** Poll only visible pages and merge focus and visibility events on return. */
export function useVisiblePoll(refresh: () => unknown, intervalMs: number, enabled = true) {
 const latest = useRef(refresh);
 latest.current = refresh;
 useEffect(() => {
  if (!enabled) return;
  let lastReturn = -Infinity;
  const onReturn = () => {
   if (document.hidden || Date.now() - lastReturn < 1000) return;
   lastReturn = Date.now();
   void latest.current();
  };
  const timer = setInterval(() => { if (!document.hidden) void latest.current(); }, intervalMs);
  document.addEventListener('visibilitychange', onReturn);
  window.addEventListener('focus', onReturn);
  return () => {
   clearInterval(timer);
   document.removeEventListener('visibilitychange', onReturn);
   window.removeEventListener('focus', onReturn);
  };
 }, [intervalMs, enabled]);
}
