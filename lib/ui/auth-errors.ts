const fallback = { title: 'We couldn’t complete your sign in', message: 'Please try again. If this keeps happening, ask your workspace admin for help.' };
export const authErrors = {
  AccessDenied: { title: 'This account can’t sign in here', message: 'Demo accounts and Google accounts without a verified email can’t sign in. Use your verified Google account.' },
  OAuthAccountNotLinked: { title: 'Try signing in again', message: 'This Google account belongs to a different workspace login. We’ve ended your previous session. Please try again.' },
  Configuration: { title: 'Sign in is temporarily unavailable', message: 'Please try again later or ask your workspace admin for help.' },
  Verification: { title: 'This sign in link has expired', message: 'Start again to get a new sign in link.' },
};
export function authErrorCopy(code: unknown) {
  return typeof code === 'string' && Object.hasOwn(authErrors, code) ? authErrors[code as keyof typeof authErrors] : fallback;
}
