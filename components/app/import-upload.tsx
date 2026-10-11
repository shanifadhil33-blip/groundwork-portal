'use client';
import { plural } from '../../lib/ui/polish';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, LocalTime } from '../ui';
import { post, RequestError } from '../../lib/ui/api';
import { duplicateImport, importError, type ImportRecord } from '../../lib/ui/imports';
import { useApp } from './context';
import { useResource } from './resource';
import { ImportSkeleton } from './import-shared';
export function ImportUpload() {
  const { member } = useApp(), router = useRouter(), base = `/api/workspaces/${member?.workspace_id}/imports`, recent = useResource<ImportRecord[]>(member && member.role !== 'client' ? base : null);
  const input = useRef<HTMLInputElement>(null), [source, setSource] = useState<File | 'sample' | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [duplicate, setDuplicate] = useState<ReturnType<typeof duplicateImport>>(null), [drag, setDrag] = useState(false);
  async function upload(value: File | 'sample', force = false) {
    if (busy) return; setSource(value); setError(null); setDuplicate(null);
    if (value !== 'sample' && (value.size > 2 * 1024 * 1024 || !/\.(csv|xlsx)$/i.test(value.name))) { setError('Choose a CSV or XLSX file no larger than 2 MB, with no more than 500 rows.'); return; }
    setBusy(true);
    try {
      const url = `${base}${force ? '?force=true' : ''}`;
      let result: { id: string };
      if (value === 'sample') result = await post(url, { sample: true });
      else {
        const body = new FormData(); body.append('file', value);
        const response = await fetch(url, { method: 'POST', body, cache: 'no-store' }), data = await response.json().catch(() => null);
        if (!response.ok) throw new RequestError(response.status, data?.error?.message ?? '', data?.error?.fields, data?.error?.code);
        result = data;
      }
      router.push(`/import/${result.id}`);
    } catch (e) { const existing = duplicateImport(e); if (existing) setDuplicate(existing); else setError(importError(e, 'upload')); setBusy(false); }
  }
  return <div className="page stack import-page"><div><h1>Import work orders</h1><p>Map your columns, check the rows, then send them for approval.</p></div><Card className="stack"><div className={`import-drop ${drag ? 'drag-over' : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={event => { event.preventDefault(); setDrag(false); const file = event.dataTransfer.files[0]; if (file && !busy) void upload(file); }}><Upload size={28} aria-hidden="true" /><h2>Drop a CSV or XLSX file</h2><p>Up to 2 MB · 500 data rows · unique column headings</p><input ref={input} className="sr-only" type="file" accept=".csv,.xlsx" disabled={busy} aria-label="Choose spreadsheet" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} /><Button busy={busy && source !== 'sample'} busyLabel="Uploading…" disabled={busy} onClick={() => input.current?.click()}>Choose file</Button>{source && source !== 'sample' && <span className="small preserve">{source.name}</span>}</div><div className="heading-row"><p className="small">Try the flow with 40 fictional work orders.</p><Button variant="secondary" busy={busy && source === 'sample'} busyLabel="Loading sample…" disabled={busy} onClick={() => upload('sample')}>Use sample file</Button></div>{error && <div role="alert" className="stack compact"><p className="inline-error">{error}</p>{source && <Button variant="secondary" onClick={() => upload(source)}>Retry</Button>}</div>}{duplicate && <div className="conflict" role="status"><p>{duplicate.message}</p><Link className="button secondary" href={`/import/${duplicate.id}`}>Open that import</Link><Button disabled={!source} busy={busy} busyLabel="Uploading…" onClick={() => source && upload(source, true)}>Import again anyway</Button></div>}</Card><Card className="stack"><h2>Recent imports</h2>{recent.loading ? <ImportSkeleton /> : recent.error ? <ErrorState message="We couldn’t load recent imports." retry={recent.reload} /> : recent.data?.length ? <ul className="import-list">{recent.data.map(item => <li key={item.id}><Link href={`/import/${item.id}`} className="import-link"><strong>{item.filename}</strong><span className="row"><Badge>{item.status.charAt(0).toUpperCase() + item.status.slice(1)}</Badge><span>{plural(item.row_count,'row')} · <LocalTime value={item.created_at} /></span></span><span>Open import →</span></Link></li>)}</ul> : <EmptyState title="No imports yet">Choose a file or use the sample to get started.</EmptyState>}</Card></div>;
}
