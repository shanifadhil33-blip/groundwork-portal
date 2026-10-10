'use client';
import { useFormStatus } from 'react-dom';
import { Button } from '../ui/button';
import { googleSignIn } from '../../app/(public)/sign-in/actions';
function Submit() { const { pending } = useFormStatus(); return <Button type="submit" busy={pending} busyLabel="Connecting to Google…">Sign in with Google</Button>; }
export function SignInForm({ redirectTo }: { redirectTo: string }) { return <form action={googleSignIn}><input type="hidden" name="redirectTo" value={redirectTo} /><Submit /></form>; }
