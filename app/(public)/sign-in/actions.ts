'use server';
import { signIn } from '../../../lib/auth';
import { safeRedirect } from '../../../lib/ui/helpers';
export async function googleSignIn(form: FormData) { await signIn('google', { redirectTo: safeRedirect(String(form.get('redirectTo') ?? '')) }); }
