'use client';
import { PRACTICE_NOTICE, practiceJoinUrl } from '../../lib/identity-rehearsal';
import { useApp } from './context';
import { useState } from 'react';
import { Copy, MessageCircle, UserPlus } from 'lucide-react';
import { Button, Dialog, Dropdown, useToast } from '../ui';
import { post, RequestError } from '../../lib/ui/api';
import { labelsFor } from '../../lib/roles';

type Link = { simulated?: boolean; user_id?: string; name: string; role: string; token: string; code: string; expires_at: string };
const pretty = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;
const linkUrl = (token: string) => `${window.location.origin}/join/${token}`;
export const shareText = (l: Pick<Link, 'name' | 'token' | 'code'>, origin: string) => `Hi ${l.name}, this is your Groundwork sign in.\nTap: ${origin}/join/${l.token}\nOr open ${origin}/join and type ${pretty(l.code)}\nIt works once and ends in 7 days.`;

/** Shows the link and code once, with WhatsApp and Copy. The app never sends anything itself. */
function LinkResult({ link, phone, onClose }: { link: Link | null; phone?: string; onClose: () => void }) {
  const toast = useToast();
  if (!link) return null;
  if (link.simulated) return <Dialog open onClose={onClose} title="New sign in" footer={<Button onClick={onClose}>Done</Button>}><div className="stack"><p>{PRACTICE_NOTICE}</p><p data-no-translate>{link.name}</p><p className="field-code" data-no-translate>{link.code}</p><details><summary>Sharing preview</summary><p>{PRACTICE_NOTICE}</p><p data-no-translate>{link.name}: {link.code}</p></details><a className="button secondary" href={practiceJoinUrl}>Sign in preview</a></div></Dialog>;
  const text = shareText(link, window.location.origin), wa = `https://wa.me/${(phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
  return <Dialog open onClose={onClose} title={`Sign in for ${link.name}`} footer={<Button onClick={onClose}>Done</Button>}>
    <div className="stack field-link">
      <p>Send this to {link.name}. It works once and ends in 7 days.</p>
      <p className="field-code" aria-label={`Code ${link.code.split('').join(' ')}`}>{pretty(link.code)}</p>
      <a className="button primary big-action" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden="true" />Send on WhatsApp</a>
      <Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(linkUrl(link.token)).then(() => toast('Link copied.')); }}><Copy size={16} aria-hidden="true" />Copy link</Button>
    </div>
  </Dialog>;
}
export function AddFieldWorker({ base, admin, demo, onDone }: { base: string; admin: boolean; demo: boolean; onDone: () => void }) {
 const roleLabels = labelsFor(useApp().workspace?.role_names);
  const [open, setOpen] = useState(false), [name, setName] = useState(''), [phone, setPhone] = useState(''), [role, setRole] = useState('technician'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [link, setLink] = useState<Link | null>(null);
  async function add() {
    if (!name.trim()) { setError('Write a name.'); return; }
    setBusy(true); setError('');
    try { const l = await post<Link>(`${base}/field-workers`, { name: name.trim(), phone: phone.trim(), role }); setOpen(false); setLink(l); onDone(); }
    catch (e) { setError(e instanceof RequestError && e.status === 422 ? e.message : 'We couldn’t add them. Please try again.'); }
    finally { setBusy(false); }
  }
  return <>
    <Button className="big-action" onClick={() => { setOpen(true); setName(''); setPhone(''); setError(''); }}><UserPlus size={18} aria-hidden="true" />Add field worker</Button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Add field worker" busy={busy} footer={<><Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button busy={busy} onClick={() => void add()}>Add</Button></>}>
      <form className="stack" noValidate onSubmit={e => { e.preventDefault(); void add(); }}>
        {demo && <p>{PRACTICE_NOTICE}</p>}
        <label htmlFor="fw-name">Name</label><input id="fw-name" value={name} maxLength={120} onChange={e => setName(e.target.value)} autoFocus />
        <label htmlFor="fw-phone">Phone (for WhatsApp)</label><input id="fw-phone" type="tel" inputMode="tel" value={phone} maxLength={30} placeholder="+971 50 123 4567" onChange={e => setPhone(e.target.value)} />
        {admin && <><span className="field-label">Role</span><Dropdown label="Role" value={role} onChange={setRole} options={[{ value: 'technician', label: roleLabels.technician }, { value: 'staff', label: roleLabels.staff }]} /></>}
        {error && <p className="inline-error" role="alert">{error}</p>}
      </form>
    </Dialog>
    <LinkResult link={link} phone={phone} onClose={() => setLink(null)} />
  </>;
}
export function NewLinkButton({ base, userId, name, phone }: { base: string; userId: string; name: string; phone?: string | null }) {
  const [busy, setBusy] = useState(false), [link, setLink] = useState<Link | null>(null), toast = useToast();
  return <><Button variant="secondary" busy={busy} onClick={async () => { setBusy(true); try { setLink(await post<Link>(`${base}/field-workers/${userId}/link`)); } catch { toast(`We couldn’t make a new sign in for ${name}.`); } finally { setBusy(false); } }}>New sign in</Button><LinkResult link={link} phone={phone ?? undefined} onClose={() => setLink(null)} /></>;
}
