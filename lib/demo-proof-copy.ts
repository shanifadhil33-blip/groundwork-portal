// Only these seeded words may be translated inside otherwise verbatim job data.
import { DEMO_QUOTE_COPY } from './demo-quote-copy';

export const DEMO_PROOF_COPY = new Set([
  ...Object.values(DEMO_QUOTE_COPY),
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
