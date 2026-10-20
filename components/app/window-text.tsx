'use client';
import { formatInLang } from '../../lib/date-lang';
import { arrivalWindow } from '../../lib/day-plan';
import { useUiLang } from './use-ui-lang';

/** A two hour window in the reader's language. Times sit in their own left to right box so Arabic never reorders them. */
export function WindowText({ hour, span = 2 }: { hour: number; span?: number }) {
  const lang = useUiLang(), w = arrivalWindow(hour, span);
  const at = (h: number) => formatInLang(Date.UTC(2026, 0, 1, h), { hour: 'numeric', timeZone: 'UTC' }, lang);
  return <span className="window-text"><bdi dir="ltr" data-no-translate>{at(w.start)}</bdi> <span>to</span> <bdi dir="ltr" data-no-translate>{at(w.end)}</bdi></span>;
}
