'use client';
import { useEffect, useState, type SetStateAction } from 'react';
export function readDraft<T>(key:string,blank:T):T{
 try {const raw=localStorage.getItem(key);if(!raw)return blank;const value=JSON.parse(raw);if(!value||typeof value!=='object'||Object.keys(blank as object).some(k=>Array.isArray((blank as any)[k])?(!Array.isArray(value[k])||value[k].some((v:unknown)=>typeof v!=='string')):typeof value[k]!==typeof (blank as any)[k]))return blank;return {...blank,...value};}catch{return blank;}
}
export function useLocalDraft<T>(key:string,blank:T){
 const [entry,setEntry]=useState(()=>({key,value:readDraft(key,blank)}));
 const value=entry.key===key?entry.value:readDraft(key,blank);
 useEffect(()=>{if(entry.key!==key)setEntry({key,value:readDraft(key,blank)});},[key,entry.key]);
 useEffect(()=>{if(entry.key!==key)return;try{localStorage.setItem(key,JSON.stringify(entry.value));}catch{}},[entry,key]);
 function setValue(update:SetStateAction<T>){setEntry(old=>({key,value:typeof update==='function'?(update as (v:T)=>T)(old.key===key?old.value:readDraft(key,blank)):update}));}
 function clear(){try{localStorage.removeItem(key);}catch{}setEntry({key,value:blank});}
 return [value,setValue,clear] as const;
}
