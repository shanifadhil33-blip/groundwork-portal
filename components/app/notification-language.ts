'use client';
import { useSyncExternalStore } from 'react';

type NotificationLanguage = { language: string; words: Record<string,string> | null };
let current: NotificationLanguage = { language: '', words: null };
const listeners = new Set<()=>void>();
/** The translator publishes the static file before scanning dynamic page text. */
export function setNotificationLanguage(language: string, words: Record<string,string> | null) {
 current = {language,words};
 for(const listener of listeners)listener();
}
const subscribe = (listener:()=>void) => {listeners.add(listener);return ()=>{listeners.delete(listener);};};
const snapshot = () => current;
const initial: NotificationLanguage = {language:'',words:null};
export const useNotificationLanguage = () => useSyncExternalStore(subscribe,snapshot,()=>initial);
