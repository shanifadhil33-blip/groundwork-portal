import { Translated } from '../app/app-words';
import { statusLabels } from '../../lib/ui/work-orders';
import type { HTMLAttributes, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './button';

/** White surface, soft shadow, no border. Never put a card inside a card. */
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`card ${className}`} />;
}

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
/** Chip. Status only, always with the word. */
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export const Chip = Badge;

const STATUS_TONE: Record<string, Tone> = { done: 'success', waiting_on_parts: 'warning', waiting_on_client: 'warning', in_progress: 'info', late: 'danger' };
export function StatusBadge({ status, children }: { status: string; children?: ReactNode }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{children ?? statusLabels[status] ?? status}</Badge>;
}

export function Skeleton({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} aria-hidden="true" className={`skeleton ${className}`} />;
}
export function PageSkeleton() {
  return (
    <div className="page" role="status" aria-label="Loading page">
      <Translated><p className="sr-only">Loading page</p></Translated>
      <Skeleton className="skeleton-title" />
      <Skeleton className="skeleton-line" />
      <div className="stack compact">{[1, 2, 3, 4, 5].map(n => <Skeleton key={n} className="skeleton-row" />)}</div>
    </div>
  );
}

/**
 * Empty state. The title says what is missing ("No jobs yet."), the line says when it fills,
 * and the action is the next step for this role. A filtered list passes Clear filters instead.
 */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <p>{title}</p>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/** One sentence with the next step, and Try again. Load errors show here only, never as a toast too. */
export function ErrorState({ retry, messageLocalized = false, message = 'We couldn’t load this. Please try again.' }: { retry: () => void; message?: string; messageLocalized?: boolean }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle aria-hidden="true" />
      <p data-no-translate={messageLocalized || undefined}>{message}</p>
      <Button variant="secondary" onClick={retry}>Try again</Button>
    </div>
  );
}
