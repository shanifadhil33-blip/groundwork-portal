'use client';
import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Tabs inside a page (at most four). The underline slides to the chosen tab; cached content swaps at once. */
export function Tabs({ tabs, value, onChange }: { tabs: { value: string; label: ReactNode; content: ReactNode }[]; value: string; onChange: (value: string) => void }) {
  const id = useId(), list = useRef<HTMLDivElement>(null), activeIndex = tabs.findIndex(t => t.value === value);
  useIsoLayoutEffect(() => {
    const el = list.current, tab = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !tab) return;
    const place = () => {
      const rtl = getComputedStyle(el).direction === 'rtl';
      el.style.setProperty('--tab-w', `${tab.offsetWidth}px`);
      el.style.setProperty('--tab-x', `${rtl ? tab.offsetLeft + tab.offsetWidth - el.offsetWidth : tab.offsetLeft}px`);
    };
    place();
    tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [activeIndex, tabs.length]);
  function keys(event: KeyboardEvent) {
    const next = event.key === 'ArrowRight' ? (activeIndex + 1) % tabs.length : event.key === 'ArrowLeft' ? (activeIndex - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(tabs[next].value);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }
  return <>
    <div className="tabs-scroll">
      <div ref={list} className="tabs" role="tablist" onKeyDown={keys}>
        {tabs.map((tab, i) => <button key={tab.value} type="button" role="tab" id={`${id}-tab-${i}`} aria-controls={`${id}-panel-${i}`} aria-selected={tab.value === value} tabIndex={tab.value === value ? 0 : -1} onClick={() => onChange(tab.value)}>{tab.label}</button>)}
      </div>
    </div>
    {tabs.map((tab, i) => <div key={tab.value} role="tabpanel" tabIndex={0} id={`${id}-panel-${i}`} aria-labelledby={`${id}-tab-${i}`} hidden={value !== tab.value}>{tab.content}</div>)}
  </>;
}
