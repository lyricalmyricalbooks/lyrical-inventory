import { describe, expect, it } from 'vitest';
import { DAY, dayMs } from '../src/lib/calendar-day.js';

describe('dayMs', () => {
  it('reads a plain date as midnight UTC', () => {
    expect(dayMs('2026-04-10')).toBe(Date.UTC(2026, 3, 10));
  });

  it('drops the time of day from a full timestamp', () => {
    expect(dayMs('2026-04-10T23:59:00-04:00')).toBe(Date.UTC(2026, 3, 10));
  });

  it('is NaN for anything it cannot read', () => {
    for (const value of [undefined, null, '', 'soon', 'not-a-date']) {
      expect(dayMs(value)).toBeNaN();
    }
  });

  it('keeps whole days apart by DAY', () => {
    expect(dayMs('2026-04-11') - dayMs('2026-04-10')).toBe(DAY);
  });
});
