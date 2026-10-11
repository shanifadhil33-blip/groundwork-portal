'use client';
import { PageError } from '../components/ui/page-error';
export default function ErrorPage({retry}:{retry:()=>void}) {return <PageError retry={retry}/>;}
