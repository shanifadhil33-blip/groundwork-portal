import type { HTMLAttributes, ReactNode } from 'react';
import { AlertCircle, Inbox } from 'lucide-react';
import { Button } from './button';
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={`card ${className}`} />; }
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) { return <span className={`badge ${tone}`}>{children}</span>; }
const labels: Record<string, string> = { open: 'Open', scheduled: 'Scheduled', in_progress: 'In progress', waiting_on_parts: 'Waiting on parts', done: 'Done', cancelled: 'Cancelled' };
export function StatusBadge({ status, children }: { status: string; children?: ReactNode }) { return <Badge tone={status === 'done' ? 'success' : status === 'waiting_on_parts' ? 'warning' : 'neutral'}>{children ?? labels[status] ?? status}</Badge>; }
export function Skeleton({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} aria-hidden="true" className={`skeleton ${className}`} />; }
export function PageSkeleton() { return <div className="page stack" role="status" aria-label="Loading page"><Skeleton className="skeleton-title" /><Skeleton className="skeleton-line" /><div className="stats-grid">{[1, 2, 3, 4].map(n => <Skeleton key={n} className="skeleton-card" />)}</div></div>; }
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) { return <div className="empty-state"><Inbox size={28} /><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>; }
export function ErrorState({ retry, message = 'We couldn’t load this. Please try again.' }: { retry: () => void; message?: string }) { return <div className="error-state" role="alert"><AlertCircle size={22} /><p>{message}</p><Button variant="secondary" onClick={retry}>Retry</Button></div>; }
