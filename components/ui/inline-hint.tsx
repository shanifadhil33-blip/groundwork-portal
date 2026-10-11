'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Button } from './button';
export function InlineHint({name,children}:{name:string;children:ReactNode}) {const [visible,setVisible]=useState(false);useEffect(()=>{try{setVisible(localStorage.getItem(`groundwork-hint:${name}`)!=='dismissed');}catch{setVisible(true);}},[name]);if(!visible)return null;return <div className="inline-hint"><Info size={16} aria-hidden="true"/><p>{children}</p><Button variant="ghost" size="sm" onClick={()=>{try{localStorage.setItem(`groundwork-hint:${name}`,'dismissed');}catch{}setVisible(false);}}>Got it</Button></div>;}
