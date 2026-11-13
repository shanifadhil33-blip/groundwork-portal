import { DUNE_HARBOUR_COPY } from './demo-dune-harbour-copy';
// Only these seeded words may be translated inside otherwise verbatim job data.
import { DEMO_ROUND_TWO_COPY } from './demo-round-two-copy';
import { DEMO_JOB_TITLES, DEMO_JOB_COMMENTS, demoJobDescription } from './demo-job-copy';
import { DEMO_QUOTE_COPY } from './demo-quote-copy';
import { DEMO_MEMORY_COPY } from './demo-memory-copy';

export const DEMO_PROOF_COPY = new Set([
  ...DEMO_ROUND_TWO_COPY,
  ...Object.values(DEMO_QUOTE_COPY),
  ...Object.values(DEMO_MEMORY_COPY),
  ...DEMO_JOB_TITLES,
  ...Object.values(DEMO_JOB_COMMENTS),
  ...Array.from({ length: 66 }, (_, index) => demoJobDescription(index + 1)),
  'Fix the leaking pantry tap',
  'The pantry tap drips all day.',
  'The tap was leaking.',
  'Replaced the seal and tested the tap.',
  'Thank you for fixing the tap.',
  'Please check this repair again.',
  'Follow up: Fix the leaking pantry tap',
  'Seal',
  'Capacitor',
  'Washer',
  'Cable clip',
  'Used during the visit',
]);

/** Both demo fixtures use LANG12 exact copy protection. Real workspaces still keep authored data verbatim. */
export const isDemoFixtureCopy = (value: string) => DEMO_PROOF_COPY.has(value) || DUNE_HARBOUR_COPY.has(value);
