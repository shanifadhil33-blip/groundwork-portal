'use client';
import Link from 'next/link';
import { Brand, PublicFooter } from '../public/chrome';
import { Button } from './button';
export function PageError({title='We couldn’t open this page.',message='Please try again. If this keeps happening, come back later.',home='/',homeLabel='Back to home',retry,footer=true}:{title?:string;message?:string;home?:string;homeLabel?:string;retry?:()=>void;footer?:boolean}) {
  return <><div className="page stack error-page"><Brand href={home}/><h1>{title}</h1><p>{message}</p><div className="row error-actions">{retry?<Button onClick={retry}>Try again</Button>:<Button variant="secondary" onClick={()=>{if(window.history.length>1)window.history.back();else window.location.assign(home);}}>Go back</Button>}<Link className="button secondary" href={home}>{homeLabel}</Link></div></div>{footer&&<PublicFooter/>}</>;
}
