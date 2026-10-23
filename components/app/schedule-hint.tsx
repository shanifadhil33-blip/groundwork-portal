'use client';
import { scheduleHourLabel } from '../../lib/date-lang';
import { SystemSummary } from './system-summary';
import { useUiLang } from './use-ui-lang';
export const SCHEDULE_HINT = 'Visits are scheduled for {time} in the workspace timezone. Scheduling an Open job moves it to Scheduled.';
export const CHANGE_SCHEDULE_HINT = 'Changing the date sets the visit to {time} in the workspace timezone. Scheduling Open work moves it to Scheduled.';
export function ScheduleHint({changing = false}: {changing?: boolean}) {
  const lang = useUiLang();
  return <SystemSummary messages={[{key: changing ? CHANGE_SCHEDULE_HINT : SCHEDULE_HINT, values: {time: scheduleHourLabel(9, lang)}}]}/>;
}
