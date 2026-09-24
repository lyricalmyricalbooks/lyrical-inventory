import { describe, it, expect } from 'vitest';
import { DAY_MS, dayMs } from '../src/lib/calendar-day.js';

describe('calendar-day', () => {
  it('is one day in milliseconds', () => {
    expect(DAY_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('reads the calendar day and ignores any time after it', () => {
    expect(dayMs('2026-09-24')).toBe(Date.UTC(2026, 8, 24));
    expect(dayMs('2026-09-24T18:45:00Z')).toBe(Date.UTC(2026, 8, 24));
  });

  it('returns NaN when there is no usable date', () => {
    expect(dayMs('')).toBeNaN();
    expect(dayMs(null)).toBeNaN();
    expect(dayMs(undefined)).toBeNaN();
    expect(dayMs('not a date')).toBeNaN();
  });
});
