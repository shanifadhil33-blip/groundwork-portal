'use client';
import { DAY_REPLIES, arrivalLabel } from '../../lib/day-plan';

/** The promise is a window. The start hour stays on the job. */
export function ArrivalWindow({ iso, tz, span = 2 }: { iso: string; tz: string; span?: number }) {
  return <span className="arrival-window"><span>{DAY_REPLIES.arrival}</span>{' '}<bdi dir="ltr" data-no-translate>{arrivalLabel(iso, tz, span)}</bdi></span>;
}
