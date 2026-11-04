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

describe('sheetDay: the day a Google Sheet date cell names', () => {
  it('reads a Rome sheet midnight as that day, not the day before', async () => {
    const { sheetDay } = await import('../src/lib/calendar-day.js');
    expect(sheetDay('2026-03-14T23:00:00.000Z')).toBe('2026-03-15');
    expect(sheetDay('2026-07-14T22:00:00.000Z')).toBe('2026-07-15');
  });
  it('reads a Toronto or Vancouver sheet midnight as that day', async () => {
    const { sheetDay } = await import('../src/lib/calendar-day.js');
    expect(sheetDay('2026-03-15T04:00:00.000Z')).toBe('2026-03-15');
    expect(sheetDay('2026-03-15T07:00:00.000Z')).toBe('2026-03-15');
    expect(sheetDay('2026-03-15T05:30:00.000Z')).toBe('2026-03-15');
  });
  it('passes a plain date through and refuses junk', async () => {
    const { sheetDay } = await import('../src/lib/calendar-day.js');
    expect(sheetDay('2026-03-15')).toBe('2026-03-15');
    expect(sheetDay('not a date')).toBe('');
  });
});
