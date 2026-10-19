'use client';
import dynamic from 'next/dynamic';
import { useState, type ComponentProps } from 'react';
import type { Dialog as DialogComponent, BottomSheet as SheetComponent, ConfirmDialog as ConfirmComponent } from './dialog';
// Once the code is here, dialogs render it directly: a lazy component suspends on its first render even with the code cached,
// and React holds a revealed Suspense boundary for about 300 ms (live: the first More sheet and Agent took 310 to 340 ms).
let loaded:typeof import('./dialog')|null=null;
const loadDialog=()=>import('./dialog').then(m=>(loaded=m));
const LoadedDialog=dynamic(()=>loadDialog().then(m=>m.Dialog),{ssr:false});
const LoadedSheet=dynamic(()=>loadDialog().then(m=>m.BottomSheet),{ssr:false});
const LoadedConfirm=dynamic(()=>loadDialog().then(m=>m.ConfirmDialog),{ssr:false});
// The choice is made once per opening (useState), so a dialog never remounts while it is open.
function OpenDialog(props:ComponentProps<typeof DialogComponent>){const [m]=useState(()=>loaded);return m?<m.Dialog {...props}/>:<LoadedDialog {...props}/>;}
function OpenSheet(props:ComponentProps<typeof SheetComponent>){const [m]=useState(()=>loaded);return m?<m.BottomSheet {...props}/>:<LoadedSheet {...props}/>;}
function OpenConfirm(props:ComponentProps<typeof ConfirmComponent>){const [m]=useState(()=>loaded);return m?<m.ConfirmDialog {...props}/>:<LoadedConfirm {...props}/>;}
export function Dialog(props:ComponentProps<typeof DialogComponent>) {return props.open?<OpenDialog {...props}/>:null;}
export function BottomSheet(props:ComponentProps<typeof SheetComponent>) {return props.open?<OpenSheet {...props}/>:null;}
export function ConfirmDialog(props:ComponentProps<typeof ConfirmComponent>) {return props.open?<OpenConfirm {...props}/>:null;}
// Sheets and dialogs open on the first tap with no wait (Oct 19: the first More sheet took about 400 ms to appear while
// its code downloaded). The code loads when the browser is idle after the page is up.
// The idle load goes through the same loader and uses the module: a bare `void import()` compiled to a loader that never fetched (live check, Oct 19).
if(typeof window!=='undefined'){const load=()=>{void loadDialog().then(m=>m.BottomSheet).catch(()=>{});};const w=window as Window&{requestIdleCallback?:(cb:()=>void,o?:{timeout:number})=>number};if(w.requestIdleCallback)w.requestIdleCallback(load,{timeout:3000});else setTimeout(load,1500);}
