import { describe, expect, it } from 'vitest';
import { heatOrder, heatWarning, heatWindow, isOutdoor } from '../lib/heat';
const tz = 'Asia/Dubai';
describe('CMP07 summer midday heat break', () => {
  it('spots outdoor jobs and leaves indoor ones', () => {
    expect(isOutdoor({ title: 'AC outdoor unit not cooling' })).toBe(true);
    expect(isOutdoor({ title: 'Roof leak over store' })).toBe(true);
    expect(isOutdoor({ title: 'Kitchen tap dripping' })).toBe(false);
  });
  it('UAE window is 12:30 to 15:00 from June 15 to September 15', () => {
    expect(heatWindow('AE', 7, 1)?.label).toBe('12:30 to 15:00'); expect(heatWindow('AE', 10, 1)).toBeNull(); expect(heatWindow('GB', 7, 1)).toBeNull();
  });
  it('warns only for outdoor jobs inside the window', () => {
    expect(heatWarning({ title: 'Roof leak', scheduled_for: '2026-07-10T09:00:00Z' }, tz, 'AE')).toMatch(/heat break/); // 13:00 Dubai
    expect(heatWarning({ title: 'Roof leak', scheduled_for: '2026-07-10T05:00:00Z' }, tz, 'AE')).toBeNull(); // 09:00
    expect(heatWarning({ title: 'Tap', scheduled_for: '2026-07-10T09:00:00Z' }, tz, 'AE')).toBeNull();
    expect(heatWarning({ title: 'Roof leak', scheduled_for: '2026-10-10T09:00:00Z' }, tz, 'AE')).toBeNull();
  });
  it('copy has no dashes', () => { expect(heatWarning({ title: 'Roof', scheduled_for: '2026-07-10T09:00:00Z' }, tz, 'AE')).not.toMatch(/[-–—]/); expect(heatOrder([{ title: 'Pool pump' }], tz, 'AE')[0].outdoor).toBe(true); });
});
