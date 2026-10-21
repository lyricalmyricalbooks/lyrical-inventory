import { describe, expect, it } from 'vitest';
import { describeCopyAge } from '../src/lib/device-copy.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = Date.UTC(2026, 9, 21, 12);

describe('how old the device\'s copy is', () => {
  it('reads like a person would say it', () => {
    expect(describeCopyAge(now - 30 * 1000, now)).toBe('from a moment ago');
    expect(describeCopyAge(now - 5 * MIN, now)).toBe('from 5 minutes ago');
    expect(describeCopyAge(now - 90 * MIN, now)).toBe('from an hour ago');
    expect(describeCopyAge(now - 5 * HOUR, now)).toBe('from 5 hours ago');
    expect(describeCopyAge(now - 30 * HOUR, now)).toBe('from yesterday');
    expect(describeCopyAge(now - 6 * DAY - HOUR, now)).toBe('from 6 days ago');
  });

  it('says nothing rather than something wrong', () => {
    expect(describeCopyAge(null, now)).toBe('');
    expect(describeCopyAge('junk', now)).toBe('');
    expect(describeCopyAge(now + HOUR, now)).toBe('');
  });
});
