'use client';
import { useState, type ComponentProps } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDate } from '../../lib/dates';
import type { DatePicker as Picker } from './date-picker';
export function DatePicker(props:ComponentProps<typeof Picker>) {
  const [LoadedPicker,setPicker]=useState<typeof Picker|null>(null);
  if(LoadedPicker)return <LoadedPicker {...props} initiallyOpen/>;
  return <button id={props.id} disabled={props.disabled} type="button" className="dropdown-trigger date-trigger" aria-label={props.label} aria-expanded={false} aria-haspopup="dialog" onClick={async()=>{const {DatePicker}=await import('./date-picker');setPicker(()=>DatePicker);}}><CalendarDays size={18}/>{props.value?formatDate(props.value):props.label}</button>;
}
