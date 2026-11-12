'use client';
import { PageHeader, ResponsiveTable } from '../ui/layout';
import { plural } from '../../lib/ui/polish';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Badge, Button, EmptyState, ErrorState, LocalTime } from '../ui';
import { post, request } from '../../lib/ui/api';
import { duplicateImport, importError, type ImportRecord } from '../../lib/ui/imports';
import { useApp } from './context';
import { useResource } from './resource';
import { ImportSkeleton } from './import-shared';
import { isOffice } from '../../lib/roles';
export function ImportUpload() {
  const { member } = useApp(), router = useRouter(), base = `/api/workspaces/${member?.workspace_id}/imports`, recent = useResource<ImportRecord[]>(member && isOffice(member?.role) ? base : null);
  const input = useRef<HTMLInputElement>(null), [source, setSource] = useState<File | 'sample' | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [duplicate, setDuplicate] = useState<ReturnType<typeof duplicateImport>>(null), [drag, setDrag] = useState(false);
  async function upload(value: File | 'sample', force = false) {
    if (busy) return; setSource(value); setError(null); setDuplicate(null);
    if (value !== 'sample' && value.size === 0) { setError('This file is empty. Choose a file with column headings and one row per job.'); return; }
    if (value !== 'sample' && (value.size > 2 * 1024 * 1024 || !/\.(csv|xlsx)$/i.test(value.name))) { setError('Choose a CSV or XLSX file no larger than 2 MB, with no more than 500 rows.'); return; }
    setBusy(true);
    try {
      const url = `${base}${force ? '?force=true' : ''}`;
      let result: { id: string };
      if (value === 'sample') result = await post(url, { sample: true });
      else {
        const body = new FormData(); body.append('file', value);
        result = await request(url, { method: 'POST', body });
      }
      router.push(`/import/${result.id}`);
    } catch (e) { const existing = duplicateImport(e); if (existing) setDuplicate(existing); else setError(importError(e, 'upload')); setBusy(false); }
  }
  return <div className="page stack import-page"><PageHeader><div><h1>Add from Excel</h1><p>Excel or CSV file, up to 500 rows</p></div></PageHeader><section className="stack"><div className={`import-drop ${drag ? 'drag-over' : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={event => { event.preventDefault(); setDrag(false); const file = event.dataTransfer.files[0]; if (file && !busy) void upload(file); }}><Upload size={20} aria-hidden="true" /><h2>Drop a CSV or XLSX file</h2><p>Up to 2 MB, 500 rows and one heading per column</p><input ref={input} className="sr-only" type="file" accept=".csv,.xlsx" disabled={busy} aria-label="Choose spreadsheet" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} /><Button busy={busy && source !== 'sample'} busyLabel="Uploading…" disabled={busy} onClick={() => input.current?.click()}>Choose file</Button>{source && source !== 'sample' && <span className="small preserve">{source.name}</span>}</div><div className="heading-row"><p className="small">Try the flow with a sample file of 40 jobs.</p><Button variant="secondary" busy={busy && source === 'sample'} busyLabel="Loading sample…" disabled={busy} onClick={() => upload('sample')}>Use sample file</Button></div>{error && <div role="alert" className="stack compact"><p className="inline-error">{error}</p>{source && <Button variant="secondary" onClick={() => upload(source)}>Try again</Button>}<Button variant="secondary" onClick={() => input.current?.click()}>Choose another file</Button></div>}{duplicate && <div className="conflict" role="status"><p>{duplicate.message}</p><Link className="button secondary" href={`/import/${duplicate.id}`}>Open that import</Link><Button disabled={!source} busy={busy} busyLabel="Uploading…" onClick={() => source && upload(source, true)}>Import again anyway</Button></div>}</section><section className="stack"><h2>Recent imports</h2>{recent.loading ? <ImportSkeleton /> : recent.error ? <ErrorState message="We couldn’t load recent imports." retry={recent.reload} /> : recent.data?.length ? <ResponsiveTable><table><thead><tr><th>File</th><th>Status</th><th>Rows</th><th>Uploaded</th></tr></thead><tbody>{recent.data.map(item => <tr className="clickable-row" key={item.id} onClick={event=>{if(!(event.target as HTMLElement).closest('a,button'))router.push(`/import/${item.id}`);}}><td><Link href={`/import/${item.id}`}>{item.filename}</Link></td><td><Badge>{item.status.charAt(0).toUpperCase() + item.status.slice(1)}</Badge></td><td className="num">{item.row_count}</td><td><LocalTime short value={item.created_at}/></td></tr>)}</tbody></table></ResponsiveTable> : <EmptyState title="No imports yet" action={<Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>Choose file</Button>}>Uploaded spreadsheets and their review status will appear here.</EmptyState>}</section></div>;
}
