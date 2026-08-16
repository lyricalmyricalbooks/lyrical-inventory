import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECURRING_FREQUENCIES,
  amountOnDate,
  currentAmount,
  frequencyMonths,
  frequencyLabel,
  lastPostedChargeDate,
  monthlyEquivalent,
  monthlyEquivalentOn,
  nextRateChange,
  nextRecurringDate,
  normalizeRateChanges,
  normalizeRecurring,
  parseYmd,
  rateSchedule,
  recurringDueCharges,
  recurringStatus,
  relativeDayLabel,
  summarizeRecurring,
} from '../src/lib/recurring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// A fixed "now" so none of these assertions rot: mid-month, so a charge dated
// later in the month is unambiguously in the future.
const NOW = new Date(2026, 7, 9); // 9 Aug 2026, local time

const sub = (over = {}) => ({
  id: 'rec_test', desc: 'Hosting', cat: 'Software & Subscriptions',
  currency: 'CAD', amount: 15, startDate: '2026-01-05', lastInjected: '', ...over,
});

describe('normalizeRecurring', () => {
  it('fills the fields legacy records predate without mutating the input', () => {
    const legacy = { desc: 'Adobe', cat: 'Software & Subscriptions', currency: 'CAD', amount: 37.28, startDate: '2026-01-05', lastInjected: '2026-08' };
    const n = normalizeRecurring(legacy);
    expect(n.frequency).toBe('monthly');
    expect(n.paused).toBe(false);
    expect(n.endDate).toBe('');
    expect(n.lastInjected).toBe('2026-08');
    expect(legacy.frequency).toBeUndefined();
  });

  it('falls back to monthly for an unrecognised cadence', () => {
    expect(normalizeRecurring({ frequency: 'fortnightly' }).frequency).toBe('monthly');
    expect(frequencyMonths('fortnightly')).toBe(1);
  });

  it('labels every declared cadence', () => {
    RECURRING_FREQUENCIES.forEach(f => {
      expect(frequencyLabel(f.id)).toBeTruthy();
      expect(frequencyMonths(f.id)).toBe(f.months);
    });
  });
});

// The rent case this was built for: CA$300/mo from January, going to CA$350 on
// 1 Sep 2026. Everything before September has to stay at CA$300.
const rent = (over = {}) => sub({
  desc: 'Rent (30% of space)', amount: 300, startDate: '2026-01-01',
  rateChanges: [{ effectiveFrom: '2026-09-01', amount: 350, note: '2026 increase' }], ...over,
});

describe('normalizeRateChanges', () => {
  it('sorts, drops the unusable rows and keeps the last entry for a date', () => {
    const cleaned = normalizeRateChanges([
      { effectiveFrom: '2027-01-01', amount: 400 },
      { effectiveFrom: '2026-09-01', amount: 340 },
      { effectiveFrom: '2026-09-01', amount: 350 }, // a corrected figure wins
      { effectiveFrom: '', amount: 999 },           // undated — cannot price a charge
      { effectiveFrom: '2026-10-01', amount: 0 },   // no amount
      { effectiveFrom: 'later', amount: 500 },      // not a date
    ]);
    expect(cleaned.map(r => [r.effectiveFrom, r.amount]))
      .toEqual([['2026-09-01', 350], ['2027-01-01', 400]]);
  });

  it('normalizes onto the record, and leaves a record without changes empty', () => {
    expect(normalizeRecurring(rent()).rateChanges).toHaveLength(1);
    expect(normalizeRecurring(sub()).rateChanges).toEqual([]);
    expect(normalizeRecurring({ rateChanges: 'nonsense' }).rateChanges).toEqual([]);
  });
});

describe('amountOnDate', () => {
  it('prices a charge by the day it falls on', () => {
    expect(amountOnDate(rent(), '2026-08-01')).toBe(300);
    expect(amountOnDate(rent(), '2026-08-31')).toBe(300);
    expect(amountOnDate(rent(), '2026-09-01')).toBe(350); // effective from, inclusive
    expect(amountOnDate(rent(), '2027-06-01')).toBe(350);
  });

  it('steps through several changes in order', () => {
    const s = rent({ rateChanges: [
      { effectiveFrom: '2027-01-01', amount: 400 },
      { effectiveFrom: '2026-09-01', amount: 350 },
    ] });
    expect(amountOnDate(s, '2026-12-31')).toBe(350);
    expect(amountOnDate(s, '2027-01-01')).toBe(400);
  });

  it('reports today’s price and the coming one separately', () => {
    expect(currentAmount(rent(), NOW)).toBe(300);
    const change = nextRateChange(rent(), NOW);
    expect(change).toMatchObject({ effectiveFrom: '2026-09-01', from: 300, to: 350, delta: 50 });
    // Once it has taken effect it is no longer "next".
    expect(nextRateChange(rent(), new Date(2026, 8, 2))).toBeNull();
    expect(currentAmount(rent(), new Date(2026, 8, 2))).toBe(350);
    expect(nextRateChange(sub(), NOW)).toBeNull();
  });

  it('lists the opening amount alongside the changes', () => {
    expect(rateSchedule(rent()).map(r => [r.effectiveFrom, r.amount, r.opening]))
      .toEqual([['2026-01-01', 300, true], ['2026-09-01', 350, false]]);
  });
});

describe('recurringDueCharges with a price change', () => {
  it('posts each backfilled month at the price in force that month', () => {
    // Entered late: the whole year lands at once, and the ledger must not get
    // twelve charges at the new rate.
    const due = recurringDueCharges(rent(), new Date(2026, 10, 15)); // 15 Nov 2026
    const bySeptember = Object.fromEntries(due.map(d => [d.date, d.amount]));
    expect(bySeptember['2026-08-01']).toBe(300);
    expect(bySeptember['2026-09-01']).toBe(350);
    expect(bySeptember['2026-10-01']).toBe(350);
    expect(bySeptember['2026-11-01']).toBe(350);
  });

  it('leaves charges already posted alone when the change is entered in advance', () => {
    // August is logged; entering the September rise now owes nothing today.
    expect(recurringDueCharges(rent({ lastInjected: '2026-08' }), NOW)).toEqual([]);
  });

  it('still bills when the starting amount is zero but a later price is set', () => {
    const due = recurringDueCharges(
      sub({ amount: 0, startDate: '2026-06-01', rateChanges: [{ effectiveFrom: '2026-07-01', amount: 20 }] }),
      NOW,
    );
    expect(due.map(d => [d.date, d.amount])).toEqual([['2026-07-01', 20], ['2026-08-01', 20]]);
  });
});

describe('parseYmd', () => {
  // The whole reason this exists: new Date('2026-01-05') is UTC midnight, which
  // is 4 Jan in every Canadian timezone. Charges were landing a day early.
  it('reads the calendar day regardless of timezone', () => {
    expect(parseYmd('2026-01-05')).toEqual({ y: 2026, m: 1, d: 5 });
  });

  it('rejects malformed and impossible dates', () => {
    ['', null, '2026-1-5', '2026-13-01', '2026-02-30', 'yesterday'].forEach(v => {
      expect(parseYmd(v)).toBeNull();
    });
  });

  it('accepts a real leap day and rejects a fake one', () => {
    expect(parseYmd('2028-02-29')).not.toBeNull();
    expect(parseYmd('2026-02-29')).toBeNull();
  });
});

describe('recurringDueCharges', () => {
  it('posts one charge per elapsed month for a monthly subscription', () => {
    const due = recurringDueCharges(sub({ startDate: '2026-06-05' }), NOW);
    expect(due.map(d => d.date)).toEqual(['2026-06-05', '2026-07-05', '2026-08-05']);
  });

  it('resumes after lastInjected rather than re-posting history', () => {
    const due = recurringDueCharges(sub({ startDate: '2026-01-05', lastInjected: '2026-06' }), NOW);
    expect(due.map(d => d.monthKey)).toEqual(['2026-07', '2026-08']);
  });

  it('does not post a charge whose date has not arrived yet', () => {
    // Bills on the 28th; "now" is the 9th, so August is still owed nothing.
    const due = recurringDueCharges(sub({ startDate: '2026-06-28' }), NOW);
    expect(due.map(d => d.date)).toEqual(['2026-06-28', '2026-07-28']);
  });

  it('clamps a day-31 subscription to the last day of a short month', () => {
    const due = recurringDueCharges(sub({ startDate: '2026-01-31' }), NOW);
    expect(due.map(d => d.date)).toContain('2026-02-28');
    expect(due.map(d => d.date)).toContain('2026-04-30');
  });

  it('bills a quarterly subscription every third month', () => {
    const due = recurringDueCharges(sub({ startDate: '2026-01-15', frequency: 'quarterly' }), NOW);
    expect(due.map(d => d.date)).toEqual(['2026-01-15', '2026-04-15', '2026-07-15']);
  });

  it('bills a yearly subscription once a year', () => {
    const due = recurringDueCharges(sub({ startDate: '2025-03-01', frequency: 'annual' }), NOW);
    expect(due.map(d => d.date)).toEqual(['2025-03-01', '2026-03-01']);
  });

  it('stops at the end date', () => {
    const due = recurringDueCharges(sub({ startDate: '2026-01-05', endDate: '2026-03-31' }), NOW);
    expect(due.map(d => d.monthKey)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('owes nothing while paused', () => {
    expect(recurringDueCharges(sub({ paused: true }), NOW)).toEqual([]);
  });

  it('owes nothing without a usable start date or amount', () => {
    expect(recurringDueCharges(sub({ startDate: '' }), NOW)).toEqual([]);
    expect(recurringDueCharges(sub({ amount: 0 }), NOW)).toEqual([]);
  });

  it('does not run away on a start date in the distant past', () => {
    // The guard matters: a bad import once produced a 1970 start date.
    const due = recurringDueCharges(sub({ startDate: '1970-01-01' }), NOW);
    expect(due.length).toBeLessThanOrEqual(1200);
    expect(due[due.length - 1].date).toBe('2026-08-01');
  });
});

describe('nextRecurringDate', () => {
  it('skips a period already posted this month', () => {
    expect(nextRecurringDate(sub({ startDate: '2026-01-05', lastInjected: '2026-08' }), NOW))
      .toBe('2026-09-05');
  });

  it('returns the upcoming day when this month has not billed yet', () => {
    expect(nextRecurringDate(sub({ startDate: '2026-01-28', lastInjected: '2026-07' }), NOW))
      .toBe('2026-08-28');
  });

  it('returns null past the end date, and while paused', () => {
    expect(nextRecurringDate(sub({ endDate: '2026-05-01', lastInjected: '2026-05' }), NOW)).toBeNull();
    expect(nextRecurringDate(sub({ paused: true }), NOW)).toBeNull();
  });

  it('gives a future-dated subscription its first charge', () => {
    expect(nextRecurringDate(sub({ startDate: '2026-11-01' }), NOW)).toBe('2026-11-01');
  });
});

describe('lastPostedChargeDate', () => {
  it('re-derives the day of the last posted period from the schedule', () => {
    expect(lastPostedChargeDate(sub({ startDate: '2026-01-05', lastInjected: '2026-07' }))).toBe('2026-07-05');
    expect(lastPostedChargeDate(sub({ startDate: '2026-01-31', lastInjected: '2026-02' }))).toBe('2026-02-28');
    // A quarterly subscription's July is not a billing month; June is.
    expect(lastPostedChargeDate(sub({ startDate: '2026-03-10', frequency: 'quarterly', lastInjected: '2026-07' }))).toBe('2026-06-10');
  });

  it('is empty when nothing has been posted', () => {
    expect(lastPostedChargeDate(sub({ lastInjected: '' }))).toBe('');
  });
});

describe('recurringStatus', () => {
  it('classifies the lifecycle', () => {
    expect(recurringStatus(sub(), NOW)).toBe('active');
    expect(recurringStatus(sub({ paused: true }), NOW)).toBe('paused');
    expect(recurringStatus(sub({ endDate: '2026-05-01' }), NOW)).toBe('ended');
    expect(recurringStatus(sub({ startDate: '2026-12-01' }), NOW)).toBe('scheduled');
    expect(recurringStatus(sub({ startDate: '' }), NOW)).toBe('invalid');
  });

  it('treats an end date later today as still active', () => {
    expect(recurringStatus(sub({ endDate: '2026-08-09' }), NOW)).toBe('active');
  });
});

describe('monthlyEquivalent', () => {
  it('spreads a yearly price across twelve months', () => {
    expect(monthlyEquivalent(sub({ amount: 120, frequency: 'annual' }))).toBe(10);
    expect(monthlyEquivalent(sub({ amount: 30, frequency: 'quarterly' }))).toBe(10);
    expect(monthlyEquivalent(sub({ amount: 15 }))).toBe(15);
  });

  it('costs a scheduled rise only from the day it takes effect', () => {
    expect(monthlyEquivalent(rent(), NOW)).toBe(300);
    expect(monthlyEquivalent(rent(), new Date(2026, 8, 1))).toBe(350);
    expect(monthlyEquivalentOn(rent(), '2026-09-01')).toBe(350);
  });
});

describe('summarizeRecurring', () => {
  const rates = { USD_CAD: 1.37 };

  it('totals live subscriptions in the base currency', () => {
    const s = summarizeRecurring([
      sub({ id: 'a', amount: 15, currency: 'USD' }),
      sub({ id: 'b', amount: 300, currency: 'CAD' }),
      sub({ id: 'c', amount: 120, currency: 'CAD', frequency: 'annual' }),
    ], rates, 'CAD', NOW);
    // 15*1.37 + 300 + 120/12
    expect(s.monthlyBase).toBeCloseTo(330.55, 2);
    expect(s.annualBase).toBeCloseTo(3966.6, 2);
    expect(s.activeCount).toBe(3);
  });

  it('excludes paused and ended subscriptions from the run rate', () => {
    const s = summarizeRecurring([
      sub({ id: 'a', amount: 100 }),
      sub({ id: 'b', amount: 999, paused: true }),
      sub({ id: 'c', amount: 999, endDate: '2026-01-31' }),
    ], rates, 'CAD', NOW);
    expect(s.monthlyBase).toBe(100);
    expect(s.pausedCount).toBe(1);
    expect(s.endedCount).toBe(1);
    expect(s.activeCount).toBe(1);
  });

  it('names currencies it could not convert instead of hiding them', () => {
    const s = summarizeRecurring([sub({ amount: 10, currency: 'GBP' })], rates, 'CAD', NOW);
    expect(s.unconverted).toEqual(['GBP']);
    expect(s.monthlyBase).toBe(10); // counted 1:1, and flagged
  });

  it('reports the soonest upcoming charge across all subscriptions', () => {
    const s = summarizeRecurring([
      sub({ id: 'a', desc: 'Later', startDate: '2026-01-20', lastInjected: '2026-07' }),
      sub({ id: 'b', desc: 'Sooner', startDate: '2026-01-11', lastInjected: '2026-07' }),
    ], rates, 'CAD', NOW);
    expect(s.nextUp.date).toBe('2026-08-11');
    expect(s.nextUp.sub.desc).toBe('Sooner');
  });

  it('handles an empty list', () => {
    const s = summarizeRecurring([], rates, 'CAD', NOW);
    expect(s.monthlyBase).toBe(0);
    expect(s.nextUp).toBeNull();
    expect(s.upcomingChange).toBeNull();
  });

  it('counts today’s price and names what the total becomes after a rise', () => {
    const s = summarizeRecurring([rent(), sub({ id: 'b', amount: 45.2 })], rates, 'CAD', NOW);
    expect(s.monthlyBase).toBe(345.2);              // still the old rent
    expect(s.upcomingChange).toMatchObject({ date: '2026-09-01', from: 300, to: 350, delta: 50 });
    expect(s.upcomingChange.sub.desc).toBe('Rent (30% of space)');
    expect(s.monthlyBaseAfterChange).toBe(395.2);   // what September looks like
  });

  it('ignores a change on a paused subscription in the run rate', () => {
    const s = summarizeRecurring([rent({ paused: true })], rates, 'CAD', NOW);
    expect(s.monthlyBase).toBe(0);
    expect(s.upcomingChange).toBeNull();
  });

  it('reports the next charge at the price it will actually bill', () => {
    const s = summarizeRecurring([rent({ lastInjected: '2026-08' })], rates, 'CAD', NOW);
    expect(s.nextUp.date).toBe('2026-09-01');
    expect(s.nextUp.amount).toBe(350);
  });
});

describe('relativeDayLabel', () => {
  it('reads as plain English around today', () => {
    expect(relativeDayLabel('2026-08-09', NOW)).toBe('today');
    expect(relativeDayLabel('2026-08-10', NOW)).toBe('tomorrow');
    expect(relativeDayLabel('2026-08-08', NOW)).toBe('yesterday');
    expect(relativeDayLabel('2026-08-21', NOW)).toBe('in 12 days');
    expect(relativeDayLabel('2026-08-04', NOW)).toBe('5 days ago');
  });

  it('switches to months once the count stops being useful', () => {
    expect(relativeDayLabel('2026-12-09', NOW)).toBe('in 4 months');
  });

  it('returns an empty string for an unusable date', () => {
    expect(relativeDayLabel('', NOW)).toBe('');
  });
});

// The panel's markup and its renderer have to agree on the column count, or the
// empty-state row spans the wrong width and the table visibly breaks.
describe('recurring subscriptions panel markup', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const taxcentre = fs.readFileSync(path.join(root, 'src/features/taxcentre.js'), 'utf8');

  it('renders a colspan matching the table header', () => {
    const head = html.slice(html.indexOf('id="tc-recurring-tbl-wrap"'));
    const headRow = head.slice(head.indexOf('<thead>'), head.indexOf('</thead>'));
    // `<th[ >]` so the opening `<thead>` itself isn't counted as a column.
    const columns = (headRow.match(/<th[ >]/g) || []).length;
    expect(columns).toBe(7);
    expect(taxcentre).toContain(`colspan="${columns}"`);
  });

  it('keeps every editor field wired to the form reader', () => {
    ['rec-edit-desc', 'rec-edit-vendor', 'rec-edit-cat', 'rec-edit-freq', 'rec-edit-cur',
      'rec-edit-amount', 'rec-edit-start', 'rec-edit-end', 'rec-edit-notes', 'rec-edit-paused']
      .forEach(id => {
        expect(html, `${id} missing from index.html`).toContain(`id="${id}"`);
        expect(taxcentre, `${id} never read`).toContain(`'${id}'`);
      });
  });

  // The price-change rows are built by the renderer and read back out of the
  // DOM, so the container id and the row classes have to agree across the two
  // files or a saved change silently reads as empty.
  it('keeps the price-change section wired to its renderer', () => {
    ['rec-edit-rates-wrap', 'rec-edit-rates'].forEach(id => {
      expect(html, `${id} missing from index.html`).toContain(`id="${id}"`);
      expect(taxcentre, `${id} never referenced`).toContain(id);
    });
    ['rec-rate-date', 'rec-rate-amount', 'rec-rate-note', 'rec-rate-row'].forEach(cls => {
      expect(taxcentre, `.${cls} written but never read`)
        .toContain(`.${cls}`);
    });
    expect(html).toContain('addRecurringRateChange()');
    expect(taxcentre).toContain('function addRecurringRateChange');
    expect(taxcentre).toContain('function removeRecurringRateChange');
  });
});
