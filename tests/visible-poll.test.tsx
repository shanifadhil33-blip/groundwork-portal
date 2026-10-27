// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVisiblePoll } from '../lib/hooks/use-visible-poll';
let root: Root;
let host: HTMLDivElement;
const refresh = vi.fn();
function Poll({ enabled = true, callback = refresh }) { useVisiblePoll(callback, 60000, enabled); return null; }
const hidden = (value: boolean) => Object.defineProperty(document, 'hidden', { configurable: true, value });
beforeEach(() => {
 vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); refresh.mockClear(); hidden(false);
 host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('skips hidden intervals and refreshes once when visible, merging focus and visibility', () => {
 hidden(true); act(() => root.render(<Poll/>));
 act(() => vi.advanceTimersByTime(180000)); expect(refresh).not.toHaveBeenCalled();
 act(() => { hidden(false); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
 expect(refresh).toHaveBeenCalledTimes(1);
 act(() => vi.advanceTimersByTime(60000)); expect(refresh).toHaveBeenCalledTimes(2);
});
it('polls visible tabs every interval and clears timers and listeners on unmount', () => {
 act(() => root.render(<Poll/>)); act(() => vi.advanceTimersByTime(180000)); expect(refresh).toHaveBeenCalledTimes(3);
 act(() => root.unmount());
 act(() => { vi.advanceTimersByTime(180000); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
 expect(refresh).toHaveBeenCalledTimes(3); expect(vi.getTimerCount()).toBe(0);
 root = createRoot(host);
});
it('uses the latest callback without restarting the interval and respects enabled', () => {
 const next = vi.fn(); act(() => root.render(<Poll/>)); act(() => vi.advanceTimersByTime(30000));
 act(() => root.render(<Poll callback={next}/>)); act(() => vi.advanceTimersByTime(30000));
 expect(next).toHaveBeenCalledTimes(1); expect(refresh).not.toHaveBeenCalled();
 act(() => root.render(<Poll enabled={false}/>));
 act(() => { vi.advanceTimersByTime(120000); window.dispatchEvent(new Event('focus')); });
 expect(refresh).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it('merges focus before visibility and ignores focus while hidden', () => {
 act(() => root.render(<Poll/>)); hidden(true); act(() => window.dispatchEvent(new Event('focus'))); expect(refresh).not.toHaveBeenCalled();
 hidden(false); act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
 expect(refresh).toHaveBeenCalledTimes(1);
});
