// When the app should go and ask Stripe what its fees came to — the fortnightly
// clock, and the year-end obligation that does not depend on anyone being there
// on the 31st.
import { describe, expect, it } from 'vitest';
import {
  STRIPE_FEE_INTERVAL_MS,
  describeFeeSweep,
  dueForFeeSweep,
  feeSweepFromYear,
  isYearEndDay,
  sameDay,
  startOfYear,
  yearOf,
} from '../src/lib/stripe-fee-schedule.js';

// Local-time constructors throughout: a tax year is a local year, not a UTC one.
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('the fortnightly clock', () => {
  it('is two weeks, because that is what was asked for', () => {
    expect(STRIPE_FEE_INTERVAL_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('comes due a fortnight after the last run', () => {
    const last = at(2026, 6, 1);
    expect(dueForFeeSweep({ lastRunAt: last, now: at(2026, 6, 14) }).due).toBe(false);
    expect(dueForFeeSweep({ lastRunAt: last, now: at(2026, 6, 15) })).toEqual({
      due: true, reason: 'interval',
    });
  });

  it('runs immediately the very first time', () => {
    expect(dueForFeeSweep({ lastRunAt: 0, now: at(2026, 6, 1) })).toEqual({
      due: true, reason: 'first-run',
    });
  });

  it('stays quiet in between', () => {
    expect(dueForFeeSweep({ lastRunAt: at(2026, 6, 1), now: at(2026, 6, 5) })).toEqual({
      due: false, reason: '',
    });
  });
});

describe('closing off a year', () => {
  it('is owed the moment the year turns, however recent the last run', () => {
    // The heart of it. A run on the 28th of December does NOT close the year:
    // the filing code only re-dates a year's row to the 31st and re-prices the
    // currency conversion at the year-end rate once that year is in the past.
    const judged = dueForFeeSweep({ lastRunAt: at(2026, 12, 28), now: at(2027, 1, 3) });
    expect(judged).toEqual({ due: true, reason: 'year-boundary' });
  });

  it('is still owed if nobody opened the app until March', () => {
    // A web page cannot run on a day nobody opens it, so "always on the 31st"
    // has to mean "never let a year end without a run covering it".
    expect(dueForFeeSweep({ lastRunAt: at(2026, 12, 30), now: at(2027, 3, 9) }).reason)
      .toBe('year-boundary');
  });

  it('closes on the day when the app happens to be open', () => {
    expect(dueForFeeSweep({ lastRunAt: at(2026, 12, 29), now: at(2026, 12, 31) })).toEqual({
      due: true, reason: 'year-end-day',
    });
  });

  it('does not run twice on the 31st', () => {
    // Morning run, then the afternoon poll finds nothing left to do.
    expect(dueForFeeSweep({ lastRunAt: at(2026, 12, 31, 9), now: at(2026, 12, 31, 16) }).due)
      .toBe(false);
  });

  it('reports the year-end reason ahead of the fortnightly one', () => {
    // Owed for both reasons at once. An accountant cares which.
    expect(dueForFeeSweep({ lastRunAt: at(2026, 11, 1), now: at(2027, 1, 5) }).reason)
      .toBe('year-boundary');
  });

  it('knows the last day of the year from any other day', () => {
    expect(isYearEndDay(at(2026, 12, 31))).toBe(true);
    expect(isYearEndDay(at(2026, 12, 30))).toBe(false);
    expect(isYearEndDay(at(2027, 1, 1))).toBe(false);
    // Not simply "the 31st".
    expect(isYearEndDay(at(2026, 1, 31))).toBe(false);
  });
});

describe('how far back to ask Stripe', () => {
  it('rebuilds the current year, not all of history', () => {
    // A year's total has to be rebuilt from the whole year, so the window
    // cannot be "since the last run" — but it need not be "since the account
    // opened" either, which is what the manual tool does.
    expect(feeSweepFromYear({ lastRunAt: at(2026, 6, 1), now: at(2026, 6, 20) })).toBe(2026);
  });

  it('reaches back over a year boundary to close the old one', () => {
    expect(feeSweepFromYear({ lastRunAt: at(2026, 12, 28), now: at(2027, 1, 3) })).toBe(2026);
  });

  it('reaches back a year when it has never run', () => {
    // Covers a boundary that passed before this was ever switched on.
    expect(feeSweepFromYear({ lastRunAt: 0, now: at(2027, 3, 1) })).toBe(2026);
  });

  it('never asks for a year later than the one we are in', () => {
    // A clock skewed into the future must not make the window start after today
    // and silently return nothing.
    expect(feeSweepFromYear({ lastRunAt: at(2028, 1, 1), now: at(2026, 6, 1) })).toBe(2026);
  });

  it('turns a year into the instant it began', () => {
    const start = new Date(startOfYear(2026));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
  });
});

describe('reading a moment', () => {
  it('reads the year locally', () => {
    expect(yearOf(at(2026, 7, 4))).toBe(2026);
    expect(yearOf(0)).toBe(1970);
  });

  it('tells one day from another', () => {
    expect(sameDay(at(2026, 6, 1, 9), at(2026, 6, 1, 23))).toBe(true);
    expect(sameDay(at(2026, 6, 1), at(2026, 6, 2))).toBe(false);
    expect(sameDay(at(2026, 6, 1), at(2027, 6, 1))).toBe(false);
  });
});

describe('what the publisher is told', () => {
  it('says nothing at all when a run filed nothing', () => {
    // The ordinary fortnightly outcome for a quiet shop. A card every two weeks
    // saying "no change" is how a notification corner stops being read.
    expect(describeFeeSweep({ inserted: 0, updated: 0 })).toBeNull();
    expect(describeFeeSweep({})).toBeNull();
  });

  it('says what it filed on an ordinary run', () => {
    const said = describeFeeSweep({ inserted: 1, updated: 0, totalCad: 42.5, reason: 'interval' });
    expect(said.title).toBe('Stripe fees updated');
    expect(said.detail).toContain('42.50 CAD');
    expect(said.detail).toContain('1 added');
    expect(said.yearEnd).toBe(false);
  });

  it('counts an update separately from a new row', () => {
    expect(describeFeeSweep({ inserted: 0, updated: 2, totalCad: 10, reason: 'interval' }).detail)
      .toContain('2 brought up to date');
    expect(describeFeeSweep({ inserted: 1, updated: 2, totalCad: 10, reason: 'interval' }).detail)
      .toContain('1 added, 2 brought up to date');
  });

  it('says plainly when a year has been closed off', () => {
    // Different news, and the one worth checking before filing taxes.
    const said = describeFeeSweep({ inserted: 0, updated: 1, totalCad: 812.34, reason: 'year-boundary' });
    expect(said.title).toBe('Stripe fees closed off for the year');
    expect(said.detail).toContain('last year');
    expect(said.detail).toContain('31st of December');
    expect(said.yearEnd).toBe(true);
  });

  it('says "this year" when it closes on the day itself', () => {
    expect(describeFeeSweep({ updated: 1, totalCad: 5, reason: 'year-end-day' }).detail)
      .toContain('this year');
  });
});
