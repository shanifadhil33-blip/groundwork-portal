'use client';
import { useEffect, useState } from 'react';
import { Button } from './button';

/**
 * One thin line at the top of every screen for the two states that are about the connection, not one screen:
 * offline, and a request that takes longer than 8 seconds. Load errors show inside their screen and action
 * errors as one toast, so a failure is never shown twice (bug 91).
 */
export function RequestRecovery() {
  const [offline, setOffline] = useState(false), [slow, setSlow] = useState(false);
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    const back = () => { update(); window.dispatchEvent(new Event('groundwork-retry-resources')); };
    const slowly = (event: Event) => setSlow(!!(event as CustomEvent<boolean>).detail);
    update();
    window.addEventListener('offline', update); window.addEventListener('online', back); window.addEventListener('groundwork-slow', slowly);
    return () => { window.removeEventListener('offline', update); window.removeEventListener('online', back); window.removeEventListener('groundwork-slow', slowly); };
  }, []);
  if (offline) return <div className="status-line" role="status">You are offline. Changes will be sent when you are back online.</div>;
  if (slow) return <div className="status-line" role="status"><span>This is taking longer than usual.</span><Button variant="ghost" size="sm" onClick={() => window.dispatchEvent(new Event('groundwork-retry-resources'))}>Try again</Button></div>;
  return null;
}
