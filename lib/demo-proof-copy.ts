// Only these seeded words may be translated inside otherwise verbatim job data.
import { DEMO_JOB_TITLES, DEMO_JOB_COMMENTS, demoJobDescription } from './demo-job-copy';
import { DEMO_QUOTE_COPY } from './demo-quote-copy';

export const DEMO_PROOF_COPY = new Set([
  ...Object.values(DEMO_QUOTE_COPY),
  ...DEMO_JOB_TITLES,
  ...Object.values(DEMO_JOB_COMMENTS),
  ...Array.from({ length: 66 }, (_, index) => demoJobDescription(index + 1)),
  'Sample tap repair',
  'Sample drawings',
  'The tap was leaking.',
  'Replaced the seal and tested the tap.',
  'Thank you for fixing the tap.',
  'Please check this repair again.',
  'Follow up: Sample tap repair',
  'Seal',
  'Capacitor',
  'Washer',
  'Cable clip',
  'Used during the visit',
]);
