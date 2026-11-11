'use client';
import { useRef, useState } from 'react';
import { formatInLang } from '../../lib/date-lang';
import { FileText, Plus, Upload } from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, Dialog, Dropdown, EmptyState, ErrorState, Skeleton, useToast } from '../ui';
import { DatePicker } from '../ui/lazy-date-picker';
import { request, RequestError } from '../../lib/ui/api';
import { useApp } from './context';
import { useResource } from './resource';

export type Doc = { id: string; doc_type: string; title: string; issued_on: string | null; expires_on: string | null; responsible_id: string | null; responsible_name: string | null; file_name: string; mime: string; size: number; days_left: number | null; updated_at: string };
type Member = { user_id: string; name: string | null; email: string | null; role: string };
const DOC_TYPE_LABELS: Record<string, string> = { trade_licence: 'Trade licence', insurance: 'Insurance', permit: 'Permit', certificate: 'Certificate', contract: 'Contract', other: 'Other' };
const LIMIT = 1024 * 1024, ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

/** Plain words for how close a document is to expiry. */
function expiryBadge(d: Pick<Doc, 'days_left'>) {
  if (d.days_left === null) return <Badge>No expiry</Badge>;
  if (d.days_left < 0) return <Badge tone="danger">Expired</Badge>;
  if (d.days_left === 0) return <Badge tone="danger">Expires today</Badge>;
  if (d.days_left <= 30) return <Badge tone="warning">{d.days_left === 1 ? 'Expires tomorrow' : `Expires in ${d.days_left} days`}</Badge>;
  return <Badge tone="success">Valid</Badge>;
}
const show = (iso: string | null) => iso ? <span data-no-translate>{formatInLang(new Date(iso + 'T00:00:00'), { day: 'numeric', month: 'short', year: 'numeric' })}</span> : 'Not set';

async function readFile(file: File) {
  if (file.size > LIMIT) throw new Error('This file is bigger than 1 MB. Try a smaller scan or a photo.');
  if (!ACCEPT.split(',').includes(file.type)) throw new Error('Use a PDF or a photo.');
  const buf = new Uint8Array(await file.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { data: btoa(s), mime: file.type, file_name: file.name.slice(0, 200) };
}

function DocForm({ base, doc, onClose, onSaved }: { base: string; doc: Doc | 'new'; onClose: () => void; onSaved: () => void }) {
  const isNew = doc === 'new', cur = isNew ? null : doc, toast = useToast(), input = useRef<HTMLInputElement>(null);
  const members = useResource<Member[]>(`${base}/members`);
  const [type, setType] = useState(cur?.doc_type ?? 'trade_licence'), [title, setTitle] = useState(cur?.title ?? ''), [issued, setIssued] = useState<string | undefined>(cur?.issued_on ?? undefined), [expires, setExpires] = useState<string | undefined>(cur?.expires_on ?? undefined), [who, setWho] = useState<string>(cur?.responsible_id ?? ''), [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const people = (Array.isArray(members.data) ? members.data : []).filter(m => m.role !== 'client').map(m => ({ value: m.user_id, label: m.name || m.email || 'Team member' }));
  async function save() {
    setError(null);
    if (!title.trim()) return setError('Give the document a name.');
    if (isNew && !file) return setError('Choose the file to upload.');
    setBusy(true);
    try {
      const fields = { doc_type: type, title: title.trim(), issued_on: issued ?? null, expires_on: expires ?? null, responsible_id: who || null };
      if (isNew) await request(`${base}/documents`, { method: 'POST', body: JSON.stringify({ ...fields, ...(await readFile(file!)) }) });
      else await request(`${base}/documents/${cur!.id}`, { method: 'PATCH', body: JSON.stringify(fields) });
      toast(isNew ? 'Document added.' : 'Changes saved.'); onSaved(); onClose();
    } catch (e) { setError(e instanceof RequestError || e instanceof Error ? e.message : 'That did not work. Try again.'); }
    finally { setBusy(false); }
  }
  return <Dialog open sheet onClose={onClose} busy={busy} dirty={!!file || title !== (cur?.title ?? '')} title={isNew ? 'Add a document' : 'Edit document'} footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" busy={busy} busyLabel="Saving…" onClick={() => void save()}>{isNew ? 'Add document' : 'Save'}</Button></>}>
    <div className="stack doc-form">
      <div className="form-field stack compact"><label htmlFor="doc-title">Name</label><input id="doc-title" value={title} maxLength={120} placeholder="For example, Trade licence 2026" onChange={e => setTitle(e.target.value)} /></div>
      <div className="form-field stack compact"><span className="field-label">Type</span><Dropdown label="Type" width={260} options={Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({ value, label }))} value={type} onChange={setType} /></div>
      <div className="doc-dates"><DatePicker label="Issue date" value={issued} onChange={setIssued} /><DatePicker label="Expiry date" value={expires} onChange={setExpires} min={issued} /></div>
      <div className="form-field stack compact"><span className="field-label">Person responsible</span><Dropdown label="Person responsible" width={260} placeholder="Nobody yet" clearable options={people} value={who || undefined} onChange={setWho} /><p className="small muted">He gets a reminder 30 days and 7 days before it expires, and on the day.</p></div>
      {isNew && <div className="form-field stack compact"><span className="field-label">File</span><input ref={input} type="file" accept={ACCEPT} hidden aria-hidden="true" tabIndex={-1} data-doc-input onChange={e => setFile(e.target.files?.[0] ?? null)} /><div className="row"><Button variant="secondary" onClick={() => input.current?.click()}><Upload size={16} aria-hidden="true" />{file ? 'Choose another file' : 'Choose file'}</Button>{file && <span className="small">{file.name}</span>}</div><p className="small muted">A PDF or a photo, up to 1 MB.</p></div>}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  </Dialog>;
}

export function Documents({ embedded = false }: { embedded?: boolean } = {}) {
  const { member } = useApp(), base = member ? `/api/workspaces/${member.workspace_id}` : null, office = member?.role === 'admin' || member?.role === 'staff';
  const r = useResource<Doc[]>(base && office ? `${base}/documents` : null), list = Array.isArray(r.data) ? r.data : [];
  const [edit, setEdit] = useState<Doc | 'new' | null>(null), [remove, setRemove] = useState<Doc | null>(null), [busy, setBusy] = useState(false), toast = useToast();
  if (!member || !base) return <div className="page"><Skeleton className="skeleton-row" /></div>;
  if (!office) return <div className="page"><EmptyState title="Only admins and supervisors see documents" /></div>;
  async function doRemove() { if (!remove) return; setBusy(true); try { await request(`${base}/documents/${remove.id}`, { method: 'DELETE' }); toast('Document removed.'); setRemove(null); void r.reload(); } catch (e) { toast(e instanceof RequestError ? e.message : 'That did not work. Try again.'); } finally { setBusy(false); } }
  return <div className={embedded ? 'stack documents-page' : 'page stack documents-page'}>
    <div className="heading-row"><div className="page-title">{embedded ? <h2>Company documents</h2> : <h1>Company documents</h1>}<p>Licences, insurance and permits, with a reminder 30 days before each expires.</p></div>{list.length > 0 && <Button variant="primary" onClick={() => setEdit('new')}><Plus size={18} aria-hidden="true" />Add document</Button>}</div>
    {r.loading ? <Skeleton className="skeleton-card" /> : r.error ? <ErrorState message="We couldn’t load your documents." retry={r.reload} /> : !list.length ?
      <Card><EmptyState title="Keep your company papers in one place" action={<Button variant="primary" onClick={() => setEdit('new')}><Plus size={18} aria-hidden="true" />Add your first document</Button>}>Add your trade licence, insurance and permits. Set the expiry date and Groundwork reminds you 30 days before.</EmptyState></Card> :
      <ul className="doc-list">{list.map(d => <li key={d.id} className="doc-item card">
        <div className="doc-main"><FileText size={20} aria-hidden="true" /><div className="stack compact"><strong>{d.title}</strong><span className="small muted">{DOC_TYPE_LABELS[d.doc_type] ?? 'Other'}</span></div>{expiryBadge(d)}</div>
        <dl className="doc-meta"><div><dt>Issued</dt><dd>{show(d.issued_on)}</dd></div><div><dt>Expires</dt><dd>{show(d.expires_on)}</dd></div><div><dt>Responsible</dt><dd>{d.responsible_name ?? 'Nobody yet'}</dd></div></dl>
        <div className="row doc-actions"><a className="button secondary sm" href={`${base}/documents/${d.id}/file`} target="_blank" rel="noopener">Open file</a><Button variant="secondary" size="sm" onClick={() => setEdit(d)}>Edit</Button><Button variant="ghost" size="sm" onClick={() => setRemove(d)}>Remove</Button></div>
      </li>)}</ul>}
    {edit && <DocForm base={base} doc={edit} onClose={() => setEdit(null)} onSaved={() => void r.reload()} />}
    <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} title="Remove this document?" confirmLabel="Remove" busyLabel="Removing…" busy={busy} danger onConfirm={() => void doRemove()}>{remove?.title} and its file will be deleted for good.</ConfirmDialog>
  </div>;
}

/** On Home for admins and supervisors: what has expired or expires in the next 30 days. Hidden when nothing is due. */
export function ExpiringDocuments({ base }: { base: string }) {
  const r = useResource<Doc[]>(`${base}/documents?expiring=true`), list = Array.isArray(r.data) ? r.data : [];
  if (r.loading || r.error || !list.length) return null;
  return <Card className="stack compact expiring-docs"><div className="section-header"><h2>Documents expiring soon</h2><a href="/documents">See all</a></div>
    <ul className="doc-soon">{list.slice(0, 5).map(d => <li key={d.id}><span>{d.title}</span>{expiryBadge(d)}</li>)}</ul></Card>;
}
