export type Theme = 'light' | 'dark' | 'system';
export const themes: Theme[] = ['light', 'dark', 'system'];
export function safeRedirect(value?: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') && !/[\\\r\n]/.test(value) ? value : '/dashboard';
}
export function shouldDismissSheet(distance: number, velocity: number) { return distance > 100 || (distance > 24 && velocity > 0.6); }
export function homeForPersona(persona: string) { return persona === 'priya' || persona === 'omar' ? '/home' : '/dashboard'; }
export function relativeLabel(value: string, now: number) {
  const diff = new Date(value).getTime() - now;
  if (!Number.isFinite(diff)) return 'Unknown time';
  const seconds = Math.round(diff / 1000), abs = Math.abs(seconds);
  const unit = abs < 3600 ? 'minute' : abs < 86400 ? 'hour' : 'day';
  const divisor = unit === 'minute' ? 60 : unit === 'hour' ? 3600 : 86400;
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(seconds / divisor), unit);
}
