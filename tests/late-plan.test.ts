import { expect, it } from 'vitest';
import { latePlan, nextSlot } from '../lib/late-plan';
it('next working day at 9 in Dubai, skipping the weekend', () => {
  expect(nextSlot(new Date('2026-10-14T12:00:00Z'), 'Asia/Dubai')).toBe('2026-10-15T05:00:00.000Z'); // Thu 09:00 Dubai
  expect(nextSlot(new Date('2026-10-16T12:00:00Z'), 'Asia/Dubai')).toBe('2026-10-19T05:00:00.000Z'); // Fri to Mon
});
it('main and backup skip the current person and anyone off', () => {
  const p = latePlan([{ user_id: 'a', name: 'Ravi' }, { user_id: 'b', name: 'Anil', off: 'leave' }, { user_id: 'c', name: 'Bilal', trade_match: true, today: 2 }, { user_id: 'd', name: 'Hamid' }], 'a');
  expect(p?.main.name).toBe('Bilal'); expect(p?.backup?.name).toBe('Hamid'); expect(p?.why).toBe('right trade, 2 jobs today');
  expect(latePlan([{ user_id: 'a', name: 'Ravi' }], 'a')).toBeNull();
});
it('backup prefers a technician and is never the supervisor looking', () => {
  const p = latePlan([{ user_id: 's', name: 'Sam', role: 'staff', trade_match: true }, { user_id: 'b', name: 'Bilal', role: 'technician' }, { user_id: 'n', name: 'Nabil', role: 'staff' }, { user_id: 'h', name: 'Hamid', role: 'technician' }], 'r', 's');
  expect(p?.main.name).toBe('Bilal'); expect(p?.backup?.name).toBe('Hamid');
  expect(latePlan([{ user_id: 's', name: 'Sam', role: 'staff' }], null, 's')).toBeNull();
});
