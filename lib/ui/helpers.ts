import { formatInLang } from '../date-lang';
export type Theme = 'light' | 'dark' | 'system';
export const themes: Theme[] = ['light', 'dark', 'system'];
export function safeRedirect(value?: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') && !/[\\\r\n]/.test(value) ? value : '/dashboard';
}
export function shouldDismissSheet(distance: number, velocity: number) { return distance > 100 || (distance > 24 && velocity > 0.6); }
export function homeForPersona(persona: string) { return persona === 'ravi' ? '/today' : ['pranav', 'omar', 'kevin', 'faisal'].includes(persona) ? '/home' : '/dashboard'; }
export function relativeLabel(value: string, now: number, language = 'en') {
  const locale=language === 'tw' ? 'ak' : language;
  if (!Intl.RelativeTimeFormat.supportedLocalesOf([locale]).length) return formatInLang(value, { day:'numeric',month:'short',hour:'2-digit',minute:'2-digit' }, language);
  const diff = new Date(value).getTime() - now;
  if (!Number.isFinite(diff)) return 'Unknown time';
  const seconds = Math.round(diff / 1000), abs = Math.abs(seconds);
  const unit = abs < 3600 ? 'minute' : abs < 86400 ? 'hour' : 'day';
  const divisor = unit === 'minute' ? 60 : unit === 'hour' ? 3600 : 86400;
  return new Intl.RelativeTimeFormat(new Intl.Locale(locale, { numberingSystem: 'latn' }).toString(), { numeric: 'auto' }).format(Math.round(seconds / divisor), unit);
}
