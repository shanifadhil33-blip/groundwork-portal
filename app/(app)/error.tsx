'use client';
import Link from 'next/link';
import { ErrorState } from '../../components/ui/states';
export default function ErrorPage({ retry }: { retry: () => void }) { return <div className="page error-page"><Link href="/" className="back-link">Back to home</Link><h1>We couldn’t open this page.</h1><ErrorState retry={retry} /></div>; }
