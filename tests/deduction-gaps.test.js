import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SNOOZE_DAYS,
  MIN_GAP_AMOUNT,
  findDeductionGaps,
  gapNoteState,
  snoozeUntil,
} from '../src/lib/deduction-gaps.js';

// This looks for costs that were never entered, which means it cannot look at
// expenses — it has to infer from activity that costs money. Most of what
// follows is about that inference being sound, and about the figures it offers
// coming from the publisher's own history rather than anywhere else.

const TODAY = '2026-09-10';

function fixture(over = {}) {
  return {
    today: TODAY,
    books: {
      hound: { title: 'The Hound', isbn: '9780306406157', maxPrint: 300, productionCost: 12000 },
    },
    states: {
      hound: { hist: [], ledger: [], expenses: [], stores: [] },
    },
    taxCenter: { businessExpenses: [], settings: { baseCurrency: 'CAD' } },
    tripsSummary: {},
    ...over,
  };
}
const sale = (over = {}) => ({ num: 'n', chan: 'Fair', qty: 1, price: 65, date: '2026-06-14', notes: '', ...over });
const expense = (over = {}) => ({ id: 'e', desc: 'x', cat: 'Other', amount: 10, baseAmount: 10, currency: 'CAD', date: '2026-01-05', ...over });
const trip = (over = {}) => ({ total: 0, count: 0, categories: {}, items: [], record: {}, ...over });
const kinds = (ctx) => findDeductionGaps(ctx).gaps.map(g => g.kind);

describe('a fair that earned money and cost nothing', () => {
  const ctx = () => fixture({
    states: { hound: { hist: [sale({ notes: 'Toronto Word Fair', qty: 6 })], ledger: [], expenses: [], stores: [] } },
    tripsSummary: {
      'Toronto Word Fair': trip({ record: { startDate: '2026-06-13', endDate: '2026-06-15' } }),
      'Vancouver Fair': trip({ total: 340, categories: { 'Events & Exhibitions': 200, 'Travel & Meals': 140 } }),
      'Ottawa Small Press': trip({ total: 180, categories: { 'Events & Exhibitions': 180 } }),
    },
  });

  it('is found, because a table does not pay for itself', () => {
    const gap = findDeductionGaps(ctx()).gaps.find(g => g.kind === 'event-without-costs');
    expect(gap.title).toMatch(/Toronto Word Fair/);
    expect(gap.evidence.salesTotal).toBe(390);
  });

  it('is estimated from what their OWN fairs cost, not an industry figure', () => {
    // Their other two fairs cost 340 and 180. The middle is 260.
    const gap = findDeductionGaps(ctx()).gaps.find(g => g.kind === 'event-without-costs');
    expect(gap.estimate).toBe(260);
    expect(gap.estimateBasis).toMatch(/your other fairs/i);
  });

  it('offers no figure at all when there is no history to draw one from', () => {
    const bare = fixture({
      states: { hound: { hist: [sale({ notes: 'First Fair' })], ledger: [], expenses: [], stores: [] } },
      tripsSummary: { 'First Fair': trip({ record: { startDate: '2026-06-13', endDate: '2026-06-15' } }) },
    });
    const gap = findDeductionGaps(bare).gaps.find(g => g.kind === 'event-without-costs');
    expect(gap.estimate).toBeNull();
    expect(gap.estimateBasis).toBeNull();
  });

  it('matches a sale to an event by its dates as well as by name', () => {
    const dated = fixture({
      states: { hound: { hist: [sale({ date: '2026-06-14', notes: '' })], ledger: [], expenses: [], stores: [] } },
      tripsSummary: { 'Toronto Word Fair': trip({ record: { startDate: '2026-06-13', endDate: '2026-06-15' } }) },
    });
    expect(kinds(dated)).toContain('event-without-costs');
  });

  it('says nothing about a fair that already has costs', () => {
    const paid = fixture({
      states: { hound: { hist: [sale({ notes: 'Vancouver Fair' })], ledger: [], expenses: [], stores: [] } },
      tripsSummary: { 'Vancouver Fair': trip({ total: 340, categories: { 'Events & Exhibitions': 200, 'Travel & Meals': 140 } }) },
    });
    expect(kinds(paid)).not.toContain('event-without-costs');
  });

  it('says nothing about a fair with no takings either', () => {
    // No sales and no costs is a fair they did not do, not a gap.
    const quiet = fixture({ tripsSummary: { 'Cancelled Fair': trip() } });
    expect(kinds(quiet)).not.toContain('event-without-costs');
  });
});

describe('getting there', () => {
  it('is flagged when an event has costs but nothing for travel', () => {
    const ctx = fixture({
      tripsSummary: {
        'Ottawa Small Press': trip({ total: 180, categories: { 'Events & Exhibitions': 180 } }),
        'Vancouver Fair': trip({ total: 340, categories: { 'Events & Exhibitions': 200, 'Travel & Meals': 140 } }),
      },
    });
    const gap = findDeductionGaps(ctx).gaps.find(g => g.kind === 'event-missing-travel');
    expect(gap.title).toMatch(/Ottawa/);
    expect(gap.estimate).toBe(140);          // what travel to their other event cost
  });

  it('is not flagged when travel is already there', () => {
    const ctx = fixture({
      tripsSummary: { 'Vancouver Fair': trip({ total: 340, categories: { 'Events & Exhibitions': 200, 'Travel & Meals': 140 } }) },
    });
    expect(kinds(ctx)).not.toContain('event-missing-travel');
  });
});

describe('a regular cost that skipped a month', () => {
  const monthly = (months) => months.map((m, i) => expense({
    id: `s${i}`, cat: 'Software & Subscriptions', amount: 30, baseAmount: 30, date: `2026-${m}-05`,
  }));

  it('is found, because a subscription does not stop for one month', () => {
    const ctx = fixture({ taxCenter: { businessExpenses: monthly(['01', '02', '03', '05', '06', '08', '09']) } });
    const gap = findDeductionGaps(ctx).gaps.find(g => g.kind === 'month-gap');
    expect(gap.evidence.missingMonths).toEqual(['2026-04', '2026-07']);
    expect(gap.estimate).toBe(60);           // their own 30 a month, across the two
  });

  it('names the months the way a person would say them', () => {
    // "2026-04" is how the data stores it and how nobody reads it. Somebody
    // deciding whether they paid a bill in April should not decode a date
    // format on the way to answering.
    const ctx = fixture({ taxCenter: { businessExpenses: monthly(['01', '02', '03', '05', '06', '08', '09']) } });
    const gap = findDeductionGaps(ctx).gaps.find(g => g.kind === 'month-gap');
    expect(gap.detail).toContain('April and July');
    expect(gap.detail).toContain('January 2026');
    expect(gap.prompt).toContain('April 2026');
    expect(gap.detail).not.toMatch(/\d{4}-\d{2}/);
    expect(gap.prompt).not.toMatch(/\d{4}-\d{2}/);
  });

  it('needs a real run before an absence means anything', () => {
    const ctx = fixture({ taxCenter: { businessExpenses: monthly(['01', '03']) } });
    expect(kinds(ctx)).not.toContain('month-gap');
  });

  it('leaves a seasonal cost alone', () => {
    // Present in 4 of 12 months is a pattern, not a steady cost with holes.
    const ctx = fixture({ taxCenter: { businessExpenses: monthly(['01', '04', '08', '12']) } });
    expect(kinds(ctx)).not.toContain('month-gap');
  });

  it('folds an old category spelling in rather than treating it as a second thing', () => {
    const mixed = [
      ...monthly(['01', '02', '03']),
      expense({ id: 'x', cat: 'software', amount: 30, baseAmount: 30, date: '2026-05-05' }),
      expense({ id: 'y', cat: 'Software & Subscriptions', amount: 30, baseAmount: 30, date: '2026-06-05' }),
    ];
    const gap = findDeductionGaps(fixture({ taxCenter: { businessExpenses: mixed } })).gaps
      .find(g => g.kind === 'month-gap');
    expect(gap.category).toBe('Software & Subscriptions');
    expect(gap.evidence.missingMonths).toEqual(['2026-04']);
  });
});

describe('costs the app can infer from what it shipped and sold', () => {
  it('notices online sales with no processing fee ever recorded', () => {
    const ctx = fixture({
      states: { hound: { hist: [sale({ chan: 'Website', qty: 4 })], ledger: [], expenses: [], stores: [] } },
    });
    const gap = findDeductionGaps(ctx).gaps.find(g => g.kind === 'missing-processing-fees');
    expect(gap.evidence.onlineRevenue).toBe(260);
    // No invented percentage: what they were charged is on the payout statement.
    expect(gap.estimate).toBeNull();
  });

  it('notices things posted with barely any postage recorded', () => {
    const ctx = fixture({
      states: { hound: {
        hist: Array.from({ length: 6 }, (_, i) => sale({ chan: 'Website', num: `w${i}` })),
        ledger: [], expenses: [], stores: [],
      } },
    });
    expect(kinds(ctx)).toContain('missing-postage');
  });

  it('stays quiet when postage is being logged', () => {
    const ctx = fixture({
      states: { hound: {
        hist: Array.from({ length: 6 }, (_, i) => sale({ chan: 'Website', num: `w${i}` })),
        ledger: [],
        expenses: Array.from({ length: 3 }, (_, i) => expense({ id: `p${i}`, cat: 'Shipping & Postage', amount: 12 })),
        stores: [],
      } },
    });
    expect(kinds(ctx)).not.toContain('missing-postage');
  });

  it('notices a print run with no printing cost, which makes a book look free to make', () => {
    const ctx = fixture({ books: { hound: { title: 'The Hound', maxPrint: 300, productionCost: 0 } } });
    const gap = findDeductionGaps(ctx).gaps.find(g => g.kind === 'missing-production-cost');
    expect(gap.title).toMatch(/The Hound/);
  });

  it('stays quiet when the book already carries its production cost', () => {
    expect(kinds(fixture())).not.toContain('missing-production-cost');
  });

  it('notices ISBNs that were never paid for', () => {
    const ctx = fixture({
      books: {
        a: { title: 'A', isbn: '9780306406157', maxPrint: 10, productionCost: 1 },
        b: { title: 'B', isbn: '9788862345674', maxPrint: 10, productionCost: 1 },
      },
    });
    expect(kinds(ctx)).toContain('missing-isbn-costs');
  });

  it('treats the app own "not set" placeholder as no ISBN', () => {
    const ctx = fixture({
      books: { a: { title: 'A', isbn: '—', maxPrint: 10, productionCost: 1 }, b: { title: 'B', isbn: '—', maxPrint: 10, productionCost: 1 } },
    });
    expect(kinds(ctx)).not.toContain('missing-isbn-costs');
  });
});

describe('putting something off', () => {
  const ctx = (notes) => fixture({
    books: { hound: { title: 'The Hound', maxPrint: 300, productionCost: 0 } },
    taxCenter: { businessExpenses: [], deductionNotes: notes },
  });

  it('hides a snoozed item until its date passes', () => {
    const snoozed = findDeductionGaps(ctx({ 'no-production-cost:hound': { status: 'snoozed', until: '2026-10-10' } }));
    expect(snoozed.gaps.map(g => g.kind)).not.toContain('missing-production-cost');
    expect(snoozed.hidden).toBe(1);
  });

  it('brings it back once the snooze has run out', () => {
    const expired = findDeductionGaps(ctx({ 'no-production-cost:hound': { status: 'snoozed', until: '2026-08-01' } }));
    expect(expired.gaps.map(g => g.kind)).toContain('missing-production-cost');
  });

  it('keeps a dismissed item out for good', () => {
    const gone = findDeductionGaps(ctx({ 'no-production-cost:hound': { status: 'dismissed' } }));
    expect(gone.gaps.map(g => g.kind)).not.toContain('missing-production-cost');
  });

  it('identifies a gap by what it is about, so a snooze survives a rescan', () => {
    // An id derived from list position would let a snoozed item reappear as a
    // new one the next time anything else changed.
    const first = findDeductionGaps(fixture({ books: { hound: { title: 'The Hound', maxPrint: 300, productionCost: 0 } } }));
    const later = findDeductionGaps(fixture({
      books: { hound: { title: 'The Hound', maxPrint: 300, productionCost: 0 }, other: { title: 'Other', maxPrint: 50, productionCost: 0 } },
    }));
    const idOf = (r) => r.gaps.find(g => g.evidence?.bookId === 'hound').id;
    expect(idOf(later)).toBe(idOf(first));
  });

  it('reads a note the way the panel will', () => {
    expect(gapNoteState(undefined, TODAY)).toBe('open');
    expect(gapNoteState({ status: 'snoozed', until: '2026-12-01' }, TODAY)).toBe('snoozed');
    expect(gapNoteState({ status: 'snoozed', until: '2026-01-01' }, TODAY)).toBe('open');
    expect(gapNoteState({ status: 'dismissed' }, TODAY)).toBe('dismissed');
  });

  it('counts a snooze forward from today', () => {
    expect(snoozeUntil(DEFAULT_SNOOZE_DAYS, new Date('2026-09-10T00:00:00Z'))).toBe('2026-10-10');
  });
});

describe('the scan as a whole', () => {
  it('puts the biggest first, and anything it cannot price below what it can', () => {
    const ctx = fixture({
      books: { hound: { title: 'The Hound', isbn: '9780306406157', maxPrint: 300, productionCost: 0 } },
      states: { hound: { hist: [sale({ notes: 'Toronto Word Fair', qty: 6 })], ledger: [], expenses: [], stores: [] } },
      tripsSummary: {
        'Toronto Word Fair': trip({ record: { startDate: '2026-06-13', endDate: '2026-06-15' } }),
        'Vancouver Fair': trip({ total: 340, categories: { 'Events & Exhibitions': 200, 'Travel & Meals': 140 } }),
      },
    });
    const out = findDeductionGaps(ctx);
    const priced = out.gaps.filter(g => g.estimate != null).map(g => g.estimate);
    expect(priced).toEqual([...priced].sort((a, b) => b - a));
    // Everything priced comes before everything unpriced.
    const lastPriced = out.gaps.findLastIndex(g => g.estimate != null);
    const firstUnpriced = out.gaps.findIndex(g => g.estimate == null);
    if (firstUnpriced !== -1) expect(lastPriced).toBeLessThan(firstUnpriced);
    expect(out.totalEstimate).toBe(priced.reduce((a, b) => a + b, 0));
  });

  it('does not interrupt anybody over small change', () => {
    const tiny = Array.from({ length: 6 }, (_, i) => expense({
      id: `t${i}`, cat: 'Office Supplies', amount: 1, baseAmount: 1,
      date: `2026-0${[1, 2, 3, 5, 6, 8][i]}-05`,
    }));
    const gap = findDeductionGaps(fixture({ taxCenter: { businessExpenses: tiny } })).gaps
      .find(g => g.kind === 'month-gap');
    expect(gap).toBeUndefined();
    expect(MIN_GAP_AMOUNT).toBeGreaterThan(0);
  });

  it('survives one broken detector rather than losing the other six', () => {
    // states being the wrong shape should not cost the publisher every finding.
    const out = findDeductionGaps(fixture({ states: null, books: { h: { title: 'H', maxPrint: 10, productionCost: 0 } } }));
    expect(out.gaps.map(g => g.kind)).toContain('missing-production-cost');
  });

  it('finds nothing to say about a business with no activity', () => {
    expect(findDeductionGaps(fixture({ books: {} })).gaps).toEqual([]);
  });

  it('never presents itself as tax advice', () => {
    // Deductibility depends on where they file and is an accountant's call.
    // Saying otherwise in a tool that also holds the ledger would be believed.
    const out = findDeductionGaps(fixture({
      books: { hound: { title: 'The Hound', isbn: '9780306406157', maxPrint: 300, productionCost: 0 } },
    }));
    const text = JSON.stringify(out).toLowerCase();
    for (const word of ['deduct', 'claimable', 'write-off', 'tax saving', 'refund', 'hmrc', 'cra', 'irs']) {
      expect(text, `mentions "${word}"`).not.toContain(word);
    }
    expect(out.note).toMatch(/not tax advice/i);
  });
});
