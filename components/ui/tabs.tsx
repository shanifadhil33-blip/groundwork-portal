'use client';
import { useId, type ReactNode } from 'react';
export function Tabs({ tabs, value, onChange }: { tabs: { value: string; label: string; content: ReactNode }[]; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return <><div className="tabs" role="tablist" onKeyDown={event => { const index = tabs.findIndex(t => t.value === value); const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1; if (next >= 0) { event.preventDefault(); onChange(tabs[next].value); document.getElementById(`${id}-tab-${next}`)?.focus(); } }}>{tabs.map((tab, i) => <button key={tab.value} role="tab" id={`${id}-tab-${i}`} aria-controls={`${id}-panel-${i}`} aria-selected={tab.value === value} tabIndex={tab.value === value ? 0 : -1} onClick={() => onChange(tab.value)}>{tab.label}</button>)}</div>{tabs.map((tab, i) => <div key={tab.value} role="tabpanel" tabIndex={0} id={`${id}-panel-${i}`} aria-labelledby={`${id}-tab-${i}`} hidden={value !== tab.value}>{tab.content}</div>)}</>;
}
