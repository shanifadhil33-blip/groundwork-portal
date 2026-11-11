'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, ConfirmDialog, ErrorState } from '../ui';
import { request } from '../../lib/ui/api';
import { useApp } from './context';
import { useResource } from './resource';
import { LessonsWaiting } from './lessons-waiting';

type Lesson = {
  id: string; body: string; created_at: string; recorded_by: string | null;
  context_uses: number;
};
export function CompanyMemory({ embedded = false }: { embedded?: boolean } = {}) {
  const { member } = useApp();
  const allowed = member?.role === 'admin' || (member?.role === 'staff' && member.staff_kind !== 'office');
  const base = member ? `/api/workspaces/${member.workspace_id}` : null;
  const memory = useResource<{ data: Lesson[]; can_edit: boolean }>(allowed && base ? `${base}/company-memory` : null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [removing, setRemoving] = useState<Lesson | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [queueVersion, setQueueVersion] = useState(0);
  async function run(change: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await change(); setEditing(null); setRemoving(null); setNotice(message);
      await memory.reload(); setQueueVersion(v => v + 1);
    } catch { setError('We couldn’t save that. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className={embedded ? 'stack company-memory' : 'page stack company-memory'}>
    {embedded ? <h2>What the Agent has learned</h2> : <h1>What the Agent has learned</h1>}
    {!allowed ? <p>Only the owner, an admin or a supervisor can see this.</p> : <>
      <p>Things your team told the Agent to remember.</p>
      <p className="small">Uses count when a lesson is included in Agent context. Earlier uses were not recorded.</p>
      {!memory.data?.can_edit && <p>Supervisors can read these lessons. Owners and admins can correct them.</p>}
      {memory.loading ? <p role="status">Loading…</p> : memory.error ? <ErrorState retry={memory.reload}/> :
        !memory.data?.data.length ? <p>No company lessons yet.</p> :
          <ul className="stack company-memory-list">{memory.data.data.map(lesson => <li key={lesson.id} className="stack compact company-memory-lesson">
            {editing?.id === lesson.id ? <form className="stack compact" onSubmit={e => {
              e.preventDefault();
              void run(() => request(`${base}/company-memory/${lesson.id}`, { method: 'PATCH', body: JSON.stringify({ body: editing.body }) }), 'Correction waiting for approval. The old lesson is no longer used.');
            }}>
              <label className="form-field">Change this line<textarea dir="auto" value={editing.body} maxLength={300} disabled={busy} onChange={e => setEditing({ id: lesson.id, body: e.target.value })}/></label>
              <p>Saving removes the old lesson. The correction waits for approval before use.</p>
              <div className="row"><Button type="submit" busy={busy} disabled={!editing.body.trim() || editing.body.trim() === lesson.body}>Save</Button><Button variant="secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button></div>
            </form> : <p className="company-memory-body" dir="auto" data-no-translate>{lesson.body}</p>}
            <dl className="company-memory-evidence">
              <div><dt>Evidence</dt><dd><span>Recorded instruction</span><p dir="auto" data-no-translate>{lesson.recorded_by ?? ''}</p><time data-no-translate dateTime={lesson.created_at}>{lesson.created_at.slice(0, 10)}</time></dd></div>
              <div><dt>Included in Agent context</dt><dd data-no-translate>{lesson.context_uses}</dd></div>
            </dl>
            {memory.data?.can_edit && editing?.id !== lesson.id && <div className="row"><Button variant="secondary" disabled={busy} onClick={() => { setEditing({ id: lesson.id, body: lesson.body }); setNotice(''); }}>Edit</Button><Button variant="secondary" disabled={busy} onClick={() => setRemoving(lesson)}>Delete</Button></div>}
          </li>)}</ul>}
      {memory.data?.can_edit && <p>You can also ask your Agent to correct or delete a company lesson.</p>}
      {memory.data?.can_edit && base && <LessonsWaiting key={queueVersion} base={base} onDecision={() => void memory.reload()}/>}
    </>}
    {notice && <p role="status">{notice}</p>}{error && !removing && <p role="alert">{error}</p>}
    <ConfirmDialog open={!!removing} title="Delete this company lesson?" confirmLabel="Delete" busy={busy} error={error} onClose={() => { if (!busy) { setRemoving(null); setError(''); } }} onConfirm={() => void run(() => request(`${base}/company-memory/${removing!.id}`, { method: 'DELETE' }), 'Lesson deleted. The next Agent plan will not use it.')}>
      <span className="company-memory-body" dir="auto" data-no-translate>{removing?.body}</span><br/><span>The next Agent plan will not use this lesson.</span>
    </ConfirmDialog>
  </div>;
}
