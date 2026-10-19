'use client';
import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type { Dialog as DialogComponent, BottomSheet as SheetComponent, ConfirmDialog as ConfirmComponent } from './dialog';
const loadDialog=()=>import('./dialog');
const LoadedDialog=dynamic(()=>loadDialog().then(m=>m.Dialog),{ssr:false});
const LoadedSheet=dynamic(()=>loadDialog().then(m=>m.BottomSheet),{ssr:false});
const LoadedConfirm=dynamic(()=>loadDialog().then(m=>m.ConfirmDialog),{ssr:false});
export function Dialog(props:ComponentProps<typeof DialogComponent>) {return props.open?<LoadedDialog {...props}/>:null;}
export function BottomSheet(props:ComponentProps<typeof SheetComponent>) {return props.open?<LoadedSheet {...props}/>:null;}
export function ConfirmDialog(props:ComponentProps<typeof ConfirmComponent>) {return props.open?<LoadedConfirm {...props}/>:null;}
// Sheets and dialogs open on the first tap with no wait (Oct 19: the first More sheet took about 400 ms to appear while
// its code downloaded). The code loads when the browser is idle after the page is up.
// The idle load goes through the same loader and uses the module: a bare `void import()` compiled to a loader that never fetched (live check, Oct 19).
if(typeof window!=='undefined'){const load=()=>{void loadDialog().then(m=>m.BottomSheet).catch(()=>{});};const w=window as Window&{requestIdleCallback?:(cb:()=>void,o?:{timeout:number})=>number};if(w.requestIdleCallback)w.requestIdleCallback(load,{timeout:3000});else setTimeout(load,1500);}
