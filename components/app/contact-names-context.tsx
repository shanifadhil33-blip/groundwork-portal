'use client';
import { createContext,useContext,useEffect,type ReactNode } from 'react';
import { useApp } from './context';
import { useResource } from './resource';
import type { Contact } from '../../lib/contact-names';
const NamesContext=createContext<{people:Contact[];reload:()=>Promise<void>;base:string}|null>(null);
export function ContactNamesProvider({children}:{children:ReactNode}){
 const {member}=useApp(),base=`/api/workspaces/${member?.workspace_id}/contact-names`,resource=useResource<Contact[]>(member?base:null);
 useEffect(()=>{const refresh=()=>void resource.reload();window.addEventListener('groundwork-contact-names',refresh);return()=>window.removeEventListener('groundwork-contact-names',refresh);},[resource.reload]);
 return <NamesContext.Provider value={{people:Array.isArray(resource.data)?resource.data:[],reload:resource.reload,base}}>{children}</NamesContext.Provider>;
}
export function useContactNames(){return useContext(NamesContext);}
