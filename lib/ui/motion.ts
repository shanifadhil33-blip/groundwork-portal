/** Read a duration token from app/tokens.css so scripts never hold their own timing numbers. */
export function motionMs(token: `--dur-${string}`): number {
  if (typeof document === 'undefined') return 0;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const amount = parseFloat(value);
  if (!Number.isFinite(amount)) return 0;
  return value.endsWith('ms') ? amount : amount * 1000;
}
