import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
it('never gates a job on setup: admins type a new client and site in the job form', () => {
  const form = read('components/app/work-order-form.tsx');
  expect(form).toContain('Enter the site name.'); expect(form).toContain('Enter the client name.');
  expect(form).not.toContain('before creating a job');
});
it('never blocks Done on a photo, and never labels extras as optional', () => {
  expect(read('components/app/my-day.tsx')).not.toMatch(/disabled=\{needs/);
  expect(read('lib/services/work-orders.ts')).not.toContain('need_photo');
  for (const f of ['components/app/dashboard.tsx', 'components/app/documents.tsx', 'components/app/my-day.tsx']) expect(read(f)).not.toMatch(/\(optional\)|Optional:/);
});
