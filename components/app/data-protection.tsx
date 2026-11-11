'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useApp } from './context';
import { useResource } from './resource';
import { Button, ErrorState } from '../ui';
import { request, RequestError } from '../../lib/ui/api';

type DeletionRequest = { user_id:string; name:string; status:string; created_at:string };
export function DataProtection() {
  const { member, workspace, me } = useApp();
  const base = `/api/workspaces/${member?.workspace_id}`;
  const feed = useResource<{requests:DeletionRequest[];practice:boolean}>(member ? `${base}/deletion-requests` : null);
  const [confirm, setConfirm] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const admin = member?.role === 'admin' || member?.is_owner;
  async function download(company = false) {
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await request(company ? `${base}/data?scope=company` : '/api/me/data', {headers:{'groundwork-user':me.user.id}});
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}));
      const link = document.createElement('a'); link.href=url; link.download=company?'groundwork_company.json':'groundwork_personal.json';
      document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      setNotice('Your download is ready. Keep the file somewhere private.');
    } catch (e) { setError(e instanceof RequestError ? e.message : 'We could not prepare your download. Try again.'); }
    finally { setBusy(false); }
  }
  async function act() {
    if (!confirm || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const url = confirm === 'request' ? '/api/me/deletion-request' : confirm === 'close' ? `${base}/privacy-close` : `${base}/deletion-requests/${confirm}`;
      const result = await request<{practice?:boolean;completed?:boolean}>(url, {method:'POST', body:JSON.stringify({confirm:true}),headers:{'groundwork-user':me.user.id}});
      if ((confirm === 'close' || confirm === 'request' && result.completed) && !result.practice) { window.location.assign('/'); return; }
      setNotice(result.practice && confirm === 'close' ? 'Practice complete. The workspace would close. Your sandbox still works.' : result.practice && confirm !== 'request' ? 'Practice complete. The name would become Deleted person and sign in would stop. Your sandbox still works.' : confirm === 'request' ? 'Your deletion request is saved. Each company must approve before your account closes.' : result.completed ? 'Account deleted. Job history is kept with the name Deleted person.' : 'Approved for this company. Waiting for the other companies to handle the request.');
      setConfirm(null); await feed.reload();
    } catch (e) { setError(e instanceof RequestError ? e.message : 'We could not save this request. Try again.'); }
    finally { setBusy(false); }
  }
  const ownRequest = feed.data?.requests?.find(r => r.user_id === me.user.id);
  return <section className="stack data-protection"><h2>Your data</h2><Link className="text-link" href="/privacy">Read the privacy notice</Link>
    <p>Download your profile, preferences and your own work records as JSON. Company downloads exclude private chats, preferences and personal Agent memory.</p>
    <div className="row"><Button variant="secondary" busy={busy} onClick={() => void download()}>Export my data</Button>{admin && <Button variant="secondary" disabled={busy} onClick={() => void download(true)}>Export company data</Button>}</div>
    {workspace?.is_demo && <p className="badge">Practice only. Deletion and closure leave this sandbox usable and reset with it.</p>}
    <><h3>Ask to delete my account</h3>{!member && <p>Without a company, Yes deletes your account now.</p>}<p>Your companies handle the request. Personal account fields are cleared and sign in stops after all companies approve. Job history keeps the name Deleted person.</p>
      {member?.is_owner ? <p>Choose another owner or close your company before asking to delete your account.</p> : ownRequest ? <p>{ownRequest.status === 'completed' ? 'Practice deletion completed.' : 'Your deletion request is saved. Each company must approve before your account closes.'}</p> : <Button variant="danger" disabled={busy} onClick={() => setConfirm('request')}>Ask to delete my account</Button>}
    </>
    {admin && <><h3>Deletion requests</h3>{feed.error ? <ErrorState retry={feed.reload}/> : feed.loading ? <p>Loading requests</p> : !feed.data?.requests?.length ? <p>No deletion requests.</p> : <ul className="action-list">{(feed.data?.requests ?? []).map(r => <li className="stack compact" key={r.user_id}><strong data-no-translate>{r.name}</strong><span>{r.status === 'completed' ? 'Completed' : r.status === 'approved' ? 'Waiting for other companies' : 'Waiting for review'}</span>{r.status === 'pending' && <Button variant="danger" disabled={busy} onClick={() => setConfirm(r.user_id)}>Handle deletion request</Button>}</li>)}</ul>}</>}
    {member?.is_owner && <><h3>Close company workspace</h3><p>This removes the company workspace and its work records. Personal accounts used in other companies stay open.</p><Button variant="danger" disabled={busy} onClick={() => setConfirm('close')}>Close company workspace</Button></>}
    {confirm && <div className="card stack" role="group" aria-label="Confirm data request"><h3>{confirm === 'request' ? 'Send your deletion request?' : confirm === 'close' ? 'Close this company workspace?' : 'Approve this deletion request?'}</h3><p>{confirm === 'close' ? 'Company work records will be removed. Download a copy first if you need one.' : !member ? 'Without a company, Yes deletes your account now.' : 'Personal account fields will be cleared after all companies approve. Company job history will remain.'}</p><div className="row"><Button variant="danger" busy={busy} onClick={() => void act()}>Yes</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>Change</Button></div></div>}
    {error && <p role="alert" className="inline-error">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
