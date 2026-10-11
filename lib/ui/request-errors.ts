export function requestErrorCopy(status: number) {
  if (status === 0) return 'We couldn’t connect. Check your connection and try again.';
  if (status === 403) return 'You don’t have access to this action. Ask your workspace admin for help.';
  if (status === 429) return 'Please wait a little before trying again. You can also sign in to your workspace.';
  return 'We couldn’t complete that. Please try again.';
}
export function reportRequestFailure(status: number) {
  if (typeof window !== 'undefined' && (status === 0 || status === 403 || status === 429 || status >= 500)) window.dispatchEvent(new CustomEvent('groundwork-request-error', { detail: status }));
}
