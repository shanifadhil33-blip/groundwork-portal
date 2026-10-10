'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './context';
import { request } from '../../lib/ui/api';
import { Card, EmptyState, ErrorState, LocalTime, PageSkeleton, StatusBadge } from '../ui';
type Data = { by_status: Record<string, number>; overdue: number; waiting_on_parts: number; pending_queue_rows: number; last_supplier_sync_at: string | null };
export function Dashboard({ client = false }: { client?: boolean }) {
  const { member } = useApp(), [data, setData] = useState<Data | null>(null), [error, setError] = useState(false);
  const ws = member?.workspace_id;
  const load = useCallback(async () => { if (!ws) return; setError(false); setData(null); try { setData(await request<Data>(`/api/workspaces/${ws}/dashboard`)); } catch { setError(true); } }, [ws]);
  useEffect(() => { void load(); }, [load]);
  if (!member) return <PageSkeleton />;
  if (member.role === 'client' && !client) return <PageSkeleton />;
  if (!data && !error) return <PageSkeleton />;
  return <div className="page"><div className="page-heading"><span className="eyebrow">{client ? member.client_name : 'Workspace overview'}</span><h1>{client ? 'Your requests, at a glance.' : 'Dashboard'}</h1><p>{client ? 'Status and progress for your company’s requests.' : 'A clear view of the work across your workspace.'}</p></div>{error ? <ErrorState message="We couldn’t load your overview. Please try again." retry={load} /> : data && <><div className="stats-grid"><Card><span className="stat-label">{client ? 'Open requests' : 'Open work orders'}</span><strong className="stat-value">{data.by_status.open.toLocaleString()}</strong></Card><Card><span className="stat-label">In progress</span><strong className="stat-value">{data.by_status.in_progress.toLocaleString()}</strong></Card><Card><span className="stat-label">Overdue</span><strong className="stat-value">{data.overdue.toLocaleString()}</strong></Card><Card><span className="stat-label">{client ? 'Waiting on parts' : 'Awaiting approval'}</span><strong className="stat-value">{(client ? data.waiting_on_parts : data.pending_queue_rows).toLocaleString()}</strong></Card></div><Card className="status-list"><h2>{client ? 'Request status' : 'Work order status'}</h2><div className="status-counts">{Object.entries(data.by_status).map(([status, count]) => <div key={status}><StatusBadge status={status} /><strong>{count.toLocaleString()}</strong></div>)}</div></Card>{Object.values(data.by_status).every(count => count === 0) && <EmptyState title={client ? 'No requests yet' : 'Your workspace is ready'}>{client ? 'Your company’s requests will appear here.' : 'This overview will reflect work orders in your workspace.'}</EmptyState>}{!client && <p className="dashboard-bottom">Last supplier sync: <LocalTime value={data.last_supplier_sync_at} /> · Simulated supplier: Cobalt Parts Supply</p>}</>}</div>;
}
