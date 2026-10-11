'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
export type InitialResource = { data: unknown } | { error: { status: number; message: string; code?: string; fields?: Record<string,string[]> } };
export type InitialResources = Record<string,InitialResource>;
const Resources = createContext<InitialResources>({});
export function resourceKey(url: string) {
  const [path,query] = url.split('?');
  const params = new URLSearchParams(query); params.sort();
  return path + (params.size ? `?${params}` : '');
}
export function InitialResourceProvider({resources,children}:{resources:InitialResources;children:ReactNode}) {
  const parent=useContext(Resources);
  const value=useMemo(()=>({...parent,...Object.fromEntries(Object.entries(resources).map(([key,value])=>[resourceKey(key),value]))}),[parent,resources]);
  return <Resources.Provider value={value}>{children}</Resources.Provider>;
}
export function useInitialResource(url:string|null) {const resources=useContext(Resources);return url?resources[resourceKey(url)]:undefined;}
