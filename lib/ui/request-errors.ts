/**
 * One plain message per cause. The server message is kept when it explains a form or a conflict;
 * otherwise each status has one sentence with the next step. "Sign in again" is only ever for 401.
 */
export function statusCopy(status: number, serverMessage?: string | null): string {
  if (status === 401) return 'Your session ended. Sign in again to continue.';
  if (status === 403) return serverMessage && !/workspace admin/i.test(serverMessage) ? serverMessage : 'You don’t have permission to do this. Ask the owner if you need it.';
  if (status === 404) return 'We couldn’t find that. It may have been removed.';
  if (status === 408) return 'This is taking too long. Please try again.';
  if (status === 409) return serverMessage ?? 'This changed since you opened it. We loaded the new version.';
  if (status === 422) return serverMessage ?? 'Check the highlighted fields and try again.';
  if (status === 429) return 'Too many tries. Please wait a minute and try again.';
  if (status >= 500) return 'Something went wrong on our side. Please try again.';
  return serverMessage ?? 'We couldn’t complete that. Please try again.';
}
/** Kept for older callers: the message for a failed request with no server message. */
export function requestErrorCopy(status: number) {
  if (status === 0) return typeof navigator !== 'undefined' && navigator.onLine === false ? 'You are offline. Changes will be sent when you are back online.' : 'We couldn’t reach Groundwork. Please try again.';
  return statusCopy(status);
}
