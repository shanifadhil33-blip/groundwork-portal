'use client';
import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type { Dialog as DialogComponent, BottomSheet as SheetComponent, ConfirmDialog as ConfirmComponent } from './dialog';
const LoadedDialog=dynamic(()=>import('./dialog').then(m=>m.Dialog),{ssr:false});
const LoadedSheet=dynamic(()=>import('./dialog').then(m=>m.BottomSheet),{ssr:false});
const LoadedConfirm=dynamic(()=>import('./dialog').then(m=>m.ConfirmDialog),{ssr:false});
export function Dialog(props:ComponentProps<typeof DialogComponent>) {return props.open?<LoadedDialog {...props}/>:null;}
export function BottomSheet(props:ComponentProps<typeof SheetComponent>) {return props.open?<LoadedSheet {...props}/>:null;}
export function ConfirmDialog(props:ComponentProps<typeof ConfirmComponent>) {return props.open?<LoadedConfirm {...props}/>:null;}
