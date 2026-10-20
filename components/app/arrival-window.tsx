'use client';
import { DAY_REPLIES, hourInZone } from '../../lib/day-plan';
import { WindowText } from './window-text';

/** The promise is a window. The start hour stays on the job. */
export function ArrivalWindow({ iso, tz, span = 2 }: { iso: string; tz: string; span?: number }) {
  return <span className="arrival-window"><span>{DAY_REPLIES.arrival}</span>{' '}<WindowText hour={hourInZone(iso, tz)} span={span} /></span>;
}
