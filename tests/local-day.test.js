import { describe, it, expect, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { localDay, localDayPlus } from '../src/lib/calendar-day.js';
import { snoozeUntil } from '../src/lib/deduction-gaps.js';
import { bigCartelOrderDate } from '../src/lib/bigcartel-ledger-gap.js';

afterEach(() => vi.useRealTimers());

// The process timezone cannot be changed reliably inside a test worker, so the
// America/Toronto cases run in a child Node process started with TZ set.
const root = resolve(import.meta.dirname, '..');
function inToronto(body) {
  const script = `
    import { localDay, localDayPlus } from ${JSON.stringify(resolve(root, 'src/lib/calendar-day.js'))};
    import { snoozeUntil } from ${JSON.stringify(resolve(root, 'src/lib/deduction-gaps.js'))};
    import { bigCartelOrderDate } from ${JSON.stringify(resolve(root, 'src/lib/bigcartel-ledger-gap.js'))};
    const out = {};
    ${body}
    console.log(JSON.stringify(out));
  `;
  const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: 'America/Toronto' }, encoding: 'utf8',
  });
  return JSON.parse(stdout.trim().split('\n').pop());
}

describe('local calendar day', () => {
  it('in Toronto at 21:30 on 31 Dec, today is still 31 Dec (UTC says 1 Jan)', () => {
    const r = inToronto(`
      const now = new Date('2027-01-01T02:30:00Z'); // 21:30 EST, 31 Dec 2026
      out.utc = now.toISOString().slice(0, 10);
      out.day = localDay(now);
      out.year = now.getFullYear();
      out.plus30 = localDayPlus(30, now);
      out.snooze = snoozeUntil(30, now);
      out.order = bigCartelOrderDate({ attributes: { created_at: '2027-01-01T02:30:00Z' } });
      out.bare = localDay('2026-10-08');
    `);
    expect(r.utc).toBe('2027-01-01');
    expect(r.day).toBe('2026-12-31');
    expect(r.year).toBe(2026);
    expect(r.plus30).toBe('2027-01-30');
    expect(r.snooze).toBe('2027-01-30');
    expect(r.order).toBe('2026-12-31');
    expect(r.bare).toBe('2026-10-08');
  });

  it('follows the faked clock, built from local fields', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 21, 30)); // 21:30 local, any zone
    expect(localDay()).toBe('2026-12-31');
    expect(localDayPlus(1)).toBe('2027-01-01');
    expect(snoozeUntil(30)).toBe('2027-01-30');
  });

  it('passes bare dates through and rejects junk', () => {
    expect(localDay('2026-10-08')).toBe('2026-10-08');
    expect(localDay('nope')).toBe('');
    expect(bigCartelOrderDate({ attributes: { created_at: '2026-10-08' } })).toBe('2026-10-08');
    expect(bigCartelOrderDate({})).toBe('');
  });
});
