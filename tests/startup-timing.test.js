import { describe, expect, it } from 'vitest';
import { STARTUP_HISTORY_MAX, describeStartup, formatSeconds, recordStartup } from '../src/lib/startup-timing.js';

describe('startup timing', () => {
  it('keeps the newest starts, up to the cap', () => {
    let h = [];
    for (let i = 0; i < STARTUP_HISTORY_MAX + 5; i++) h = recordStartup(h, 1000 + i, i);
    expect(h).toHaveLength(STARTUP_HISTORY_MAX);
    expect(h[h.length - 1].ms).toBe(1000 + STARTUP_HISTORY_MAX + 4);
  });

  it('ignores junk times and junk storage', () => {
    expect(recordStartup('nonsense', 1200, 1)).toEqual([{ ms: 1200, at: 1 }]);
    expect(recordStartup([{ ms: 900, at: 1 }], NaN, 2)).toEqual([{ ms: 900, at: 1 }]);
    expect(recordStartup([], -5, 2)).toEqual([]);
    expect(recordStartup([], 11 * 60 * 1000, 2)).toEqual([]);
  });

  it('formats seconds the way the owner reads them', () => {
    expect(formatSeconds(2400)).toBe('2.4 s');
    expect(formatSeconds(450)).toBe('0.5 s');
    expect(formatSeconds(75000)).toBe('75 s');
  });

  it('says only the last start until there are three earlier ones', () => {
    expect(describeStartup([])).toBe('');
    expect(describeStartup([{ ms: 1000 }, { ms: 3100 }])).toBe('Opened in 3.1 s');
  });

  it('compares with the middle of the earlier starts, so one bad day does not skew it', () => {
    const h = [{ ms: 1500 }, { ms: 30000 }, { ms: 1700 }, { ms: 1600 }, { ms: 1800 }, { ms: 2200 }];
    expect(describeStartup(h)).toBe('Opened in 2.2 s · usually 1.7 s on this device');
  });
});
