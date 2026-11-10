'use client';
import './tokens.css';
import './globals.css';
import { PageError } from '../components/ui/page-error';
export default function GlobalError({retry}:{retry:()=>void}) {
 return <html lang="en"><body><title>Page unavailable · Groundwork</title><main className="global-error"><PageError retry={retry}/></main></body></html>;
}
