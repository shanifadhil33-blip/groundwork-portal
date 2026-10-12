'use client';
import { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { Button, Dialog, useToast } from '../ui';
import { request, RequestError } from '../../lib/ui/api';
import { useResource } from './resource';

export type Photo = { id: string; kind: 'before' | 'after'; width: number; height: number; created_at: string; mine: boolean };
const LIMIT = 600 * 1024;

/** Shrink on the phone: max 1600px, JPEG. Drawing to a canvas also drops location and other EXIF data. */
async function shrinkPhoto(file: File): Promise<{ data: string; mime: 'image/jpeg'; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  for (const [max, q] of [[1600, 0.72], [1280, 0.62], [1024, 0.55]] as const) {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height)), width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= LIMIT) { const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return { data: btoa(s), mime: 'image/jpeg', width, height }; }
  }
  throw new Error('too_big');
}

export function AddPhoto({ base, id, kind, onAdded, primary = false }: { base: string; id: string; kind: 'before' | 'after'; onAdded: () => void; primary?: boolean }) {
  const input = useRef<HTMLInputElement>(null), [busy, setBusy] = useState(false), toast = useToast();
  async function pick(file?: File) {
    if (!file) return; setBusy(true);
    try { const p = await shrinkPhoto(file); await request(`${base}/work-orders/${id}/photos`, { method: 'POST', body: JSON.stringify({ kind, ...p }) }); toast('Photo added.'); onAdded(); }
    catch (e) { toast(e instanceof RequestError ? e.message : 'That photo did not work. Try another.'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return <><input ref={input} type="file" accept="image/*" capture="environment" hidden aria-hidden="true" tabIndex={-1} onChange={e => void pick(e.target.files?.[0])} data-photo-input={kind} />
    <Button variant={primary ? 'primary' : 'secondary'} busy={busy} busyLabel="Adding…" onClick={() => input.current?.click()}><Camera size={18} aria-hidden="true" />{kind === 'before' ? 'Before photo' : 'After photo'}</Button></>;
}

function Thumbs({ list, base, id, canRemove, onChange }: { list: Photo[]; base: string; id: string; canRemove: (p: Photo) => boolean; onChange: () => void }) {
  const [open, setOpen] = useState<Photo | null>(null), [busy, setBusy] = useState(false), toast = useToast();
  async function remove(p: Photo) { setBusy(true); try { await request(`${base}/work-orders/${id}/photos/${p.id}`, { method: 'DELETE' }); setOpen(null); onChange(); } catch (e) { toast(e instanceof RequestError ? e.message : 'That did not work. Try again.'); } finally { setBusy(false); } }
  return <><div className="photo-row">{list.map(p => <button key={p.id} type="button" className="photo-thumb" onClick={() => setOpen(p)} aria-label={`Open ${p.kind} photo`}><img src={`${base}/work-orders/${id}/photos/${p.id}`} alt="" loading="lazy" width={p.width} height={p.height} /></button>)}</div>
    <Dialog open={!!open} onClose={() => setOpen(null)} busy={busy} title={open?.kind === 'before' ? 'Before' : 'After'} footer={open && canRemove(open) ? <Button variant="danger" busy={busy} onClick={() => void remove(open)}><Trash2 size={16} aria-hidden="true" />Remove photo</Button> : undefined}>
      {open && <img className="photo-full" src={`${base}/work-orders/${id}/photos/${open.id}`} alt={`${open.kind} photo`} width={open.width} height={open.height} />}</Dialog></>;
}

/** Before and after photos on a job. Clients only look. */
export function JobPhotos({ base, id, role, status }: { base: string; id: string; role: string; status: string }) {
  const photos = useResource<Photo[]>(`${base}/work-orders/${id}/photos`), list = Array.isArray(photos.data) ? photos.data : [];
  const office = role === 'admin' || role === 'staff', canAdd = role !== 'client' && status !== 'cancelled' && (office || status !== 'done');
  const canRemove = (p: Photo) => office || (role === 'technician' && p.mine && status !== 'done');
  if (photos.loading || photos.error) return null;
  if (role === 'client' && !list.length) return null;
  const before = list.filter(p => p.kind === 'before'), after = list.filter(p => p.kind === 'after'), reload = () => void photos.reload();
  return <section className="stack compact job-photos"><h2>Photos</h2>
    {!list.length && canAdd && <p className="small muted">Take a photo before you start and after you finish. It shows the work is done.</p>}
    {(['before', 'after'] as const).map(kind => { const l = kind === 'before' ? before : after; return (l.length > 0 || canAdd) && <div key={kind} className="stack compact"><span className="field-label">{kind === 'before' ? 'Before' : 'After'} ({l.length})</span>{l.length > 0 && <Thumbs list={l} base={base} id={id} canRemove={canRemove} onChange={reload} />}{canAdd && l.length < 4 && <div><AddPhoto base={base} id={id} kind={kind} onAdded={reload} /></div>}</div>; })}
  </section>;
}
