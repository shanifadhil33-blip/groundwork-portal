'use client';
import './globals.css';
import { PageError } from '../components/ui/page-error';
export default function GlobalError({retry}:{retry:()=>void}) {
 return <html lang="en"><body style={{margin:0,background:'#FFFFFF',color:'#000000',fontFamily:'Arial, sans-serif'}}><title>Page unavailable · Groundwork</title><main style={{maxWidth:640,margin:'12vh auto',padding:24}}><PageError retry={retry}/></main></body></html>;
}
