'use client';
import { useEffect, useRef, useState, type PointerEvent, type MouseEvent } from 'react';
import { usePhoneLayer } from '../../lib/ui/phone-back';
import { Button } from '../ui/button';
export type SelectionAction = { label: string; run: (ids: string[]) => Promise<void> | void; available?: (ids: string[]) => boolean };
export function useSelection(ids: string[], actions: SelectionAction[]) {
 const [selected,setSelected]=useState<string[]>([]),[coarse,setCoarse]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 usePhoneLayer(selected.length>0,()=>setSelected([]));
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),origin=useRef({x:0,y:0}),held=useRef(false);
 const clear=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
 useEffect(()=>{if(typeof matchMedia!=='function')return;const media=matchMedia('(pointer: coarse)');const update=()=>{setCoarse(media.matches);if(!media.matches)setSelected([]);};update();media.addEventListener('change',update);return()=>{clear();media.removeEventListener('change',update);};},[]);
 const key=ids.join(',');
 useEffect(()=>setSelected(old=>old.filter(id=>ids.includes(id))),[key]);
 useEffect(()=>{if(!selected.length)return;const back=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();setSelected([]);}};document.addEventListener('keydown',back,true);return()=>document.removeEventListener('keydown',back,true);},[selected.length]);
 function toggle(id:string){setSelected(old=>old.includes(id)?old.filter(v=>v!==id):[...old,id]);}
 function row(id:string){return {
  'data-selected':selected.includes(id)||undefined,
  onPointerDown:(e:PointerEvent<HTMLElement>)=>{clear();held.current=false;if(!coarse||e.button!==0||(e.target as HTMLElement).closest('input,textarea,select,button:not([data-selection-open]),.record-actions'))return;origin.current={x:e.clientX,y:e.clientY};timer.current=setTimeout(()=>{held.current=true;toggle(id);navigator.vibrate?.(20);},450);},
  onPointerMove:(e:PointerEvent<HTMLElement>)=>{if(Math.hypot(e.clientX-origin.current.x,e.clientY-origin.current.y)>10)clear();},
  onPointerUp:clear,onPointerCancel:clear,
  onContextMenu:(e:MouseEvent)=>{if(coarse)e.preventDefault();},
  onClickCapture:(e:MouseEvent)=>{if(!coarse)return;if(held.current){held.current=false;e.preventDefault();e.stopPropagation();return;}if(selected.length){e.preventDefault();e.stopPropagation();toggle(id);}}
 };}
 const mark=(id:string)=><button type="button" className="selection-mark" aria-label={selected.includes(id)?'Deselect item':'Select item'} aria-pressed={selected.includes(id)} onClick={e=>{e.preventDefault();e.stopPropagation();toggle(id);}}>{selected.includes(id)?'✓':'○'}</button>;
 const bar=selected.length?<div className="selection-bar" role="toolbar" aria-label="Selected items"><Button variant="ghost" disabled={busy} onClick={()=>setSelected([])} aria-label="Leave selection">×</Button><strong aria-live="polite">{selected.length} selected</strong>{actions.filter(a=>!a.available||a.available(selected)).map(a=><Button key={a.label} variant="secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await a.run(selected);setSelected([]);}catch(e){setError(e instanceof Error?e.message:'Could not save. Try again.');}finally{setBusy(false);}}}>{a.label}</Button>)}<Button variant="ghost" disabled={busy} onClick={()=>setSelected(ids)}>Select all</Button>{error&&<p role="alert">{error}</p>}</div>:null;
 return {row,mark,bar,selected,close:()=>setSelected([])};
}
