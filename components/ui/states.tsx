import { Translated } from '../app/app-words';
import { statusLabels } from '../../lib/ui/work-orders';
import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './button';
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={`card ${className}`} />; }
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) { return <span className={`badge ${tone}${tone === 'danger' && children === 'Late' ? ' late' : ''}`}>{children}</span>; }

export function StatusBadge({ status, children }: { status: string; children?: ReactNode }) { return <Badge tone={status === 'done' ? 'success' : status === 'waiting_on_parts' ? 'warning' : status === 'in_progress' || status === 'scheduled' ? 'info' : 'neutral'}>{children ?? statusLabels[status] ?? status}</Badge>; }
export function Skeleton({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} aria-hidden="true" className={`skeleton ${className}`} />; }
export function PageSkeleton() { return <div className="page stack" role="status" aria-label="Loading page"><Translated><p>Loading page</p></Translated><Skeleton className="skeleton-title" /><Skeleton className="skeleton-line" /><div className="stack compact">{[1, 2, 3, 4, 5].map(n => <Skeleton key={n} className="skeleton-row" />)}</div></div>; }
export function EmptyState({ title, action }: { title: string; children?: ReactNode; action?: ReactNode }) { return <div className="empty-state"><p>{title}</p>{action ?? <Link href="/work-orders" className="button secondary">View jobs</Link>}</div>; }
export function ErrorState({ retry, messageLocalized = false, message = 'We couldn’t load this. Please try again.' }: { retry: () => void; message?: string; messageLocalized?: boolean }) { return <div className="error-state" role="alert"><AlertCircle size={20} /><p data-no-translate={messageLocalized || undefined}>{message}</p><Button variant="secondary" onClick={retry}>Try again</Button><Link href="/" className="button secondary">Back to home</Link><Link href="/sign-in" className="text-link">Sign in again</Link></div>; }
