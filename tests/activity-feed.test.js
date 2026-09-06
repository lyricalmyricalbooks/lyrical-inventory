import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildActivityFeed, activityTimestamp, ACTIVITY_LIMIT } from '../src/lib/activity-feed.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const hound = { id: 'hound', title: 'The Hound', author: 'Ian Willms', currency: 'CA$', maxPrint: 300, accent: '#34579e' };
const altrove = { id: 'altrove', title: 'Un Fantastico Altrove', author: 'Silvia Clo Di Gregorio', currency: '€', maxPrint: 190, accent: '#b93368' };

describe('activityTimestamp', () => {
  it('pins a date-only string to local noon so it cannot slip a day', () => {
    expect(activityTimestamp('2026-03-01')).toBe(Date.parse('2026-03-01T12:00:00'));
  });

  it('parses a full ISO datetime', () => {
    expect(activityTimestamp('2026-03-01T08:30:00.000Z')).toBe(Date.parse('2026-03-01T08:30:00.000Z'));
  });

  it('passes an epoch number straight through', () => {
    expect(activityTimestamp(1772000000000)).toBe(1772000000000);
  });

  it('returns 0 for anything unusable rather than NaN', () => {
    for (const bad of ['', null, undefined, 'not a date', {}, NaN, Infinity]) {
      expect(activityTimestamp(bad)).toBe(0);
    }
  });
});

describe('buildActivityFeed — sources', () => {
  it('reads a sale out of history', () => {
    const feed = buildActivityFeed([hound], {
      hound: { hist: [{ num: '1042', chan: 'Website', qty: 3, price: 25, date: '2026-03-01', cur: 'CAD' }] },
    });
    expect(feed).toHaveLength(1);
    expect(feed[0].kind).toBe('sale');
    expect(feed[0].text).toBe('Sale recorded — 3× The Hound via Website');
    expect(feed[0].amount).toBe('+CA$75.00');
    expect(feed[0].tone).toBe('pos');
  });

  it('names the channel Direct when a sale has none', () => {
    const feed = buildActivityFeed([hound], { hound: { hist: [{ qty: 1, price: 25, date: '2026-03-01' }] } });
    expect(feed[0].text).toContain('via Direct');
  });

  it('drops the multiplier for a single copy', () => {
    const feed = buildActivityFeed([hound], { hound: { hist: [{ qty: 1, price: 25, chan: 'Website', date: '2026-03-01' }] } });
    expect(feed[0].text).toBe('Sale recorded — The Hound via Website');
  });

  it('reads shipments, store sales, returns and write-offs out of the ledger', () => {
    const feed = buildActivityFeed([hound], {
      hound: {
        ledger: [
          { id: 3, type: 'Shipment', storeName: 'Ink & Wonder', qty: 12, date: '2026-03-04' },
          { id: 2, type: 'Sale', storeName: 'Ink & Wonder', qty: 2, amountDue: 30, date: '2026-03-03', cur: 'CAD' },
          { id: 1, type: 'Return', status: 'restocked', storeName: 'Ink & Wonder', qty: 4, date: '2026-03-02' },
          { id: 0, type: 'Return', status: 'written off', storeName: 'Ink & Wonder', qty: 1, date: '2026-03-01' },
        ],
      },
    });
    expect(feed.map(e => e.kind)).toEqual(['consign-shipment', 'consign-sale', 'consign-return', 'write-off']);
    expect(feed[0].text).toBe('Sent 12× The Hound to Ink & Wonder');
    expect(feed[1].amount).toBe('+CA$30.00');
    expect(feed[3].text).toContain('written off');
  });

  it('reads expenses, invoices, payouts, payout requests and stock transfers', () => {
    const feed = buildActivityFeed([hound], {
      hound: {
        expenses: [{ id: 9, desc: 'Shipping labels', amount: 49, currency: 'CAD', date: '2026-03-05' }],
        invoices: [{ id: 8, num: 'HOUND-114', storeName: 'Ink & Wonder', total: 310, currencyCode: 'CAD', date: '2026-03-04' }],
        artistPayouts: [{ id: 7, amount: 120, date: '2026-03-03', cur: 'CAD' }],
        payoutRequests: [{ id: 6, amount: 200, currency: 'CAD', requestedAt: '2026-03-02T09:15:00.000Z' }],
        stockTransfers: [{ id: 'st_5', direction: 'to_author', qty: 10, date: '2026-03-01' }],
      },
    });
    expect(feed.map(e => e.kind)).toEqual(['expense', 'invoice', 'payout', 'payout-request', 'stock-transfer']);
    expect(feed[0].amount).toBe('−CA$49.00');
    expect(feed[0].tone).toBe('neg');
    expect(feed[1].text).toBe('Invoice HOUND-114 raised for Ink & Wonder');
    expect(feed[2].text).toContain('Ian Willms');
    expect(feed[4].text).toBe('10× The Hound handed to Ian Willms');
  });

  it('reports a gifted copy as a gift, not a sale', () => {
    const feed = buildActivityFeed([hound], {
      hound: { hist: [{ qty: 1, price: 0, gratuity: true, date: '2026-03-01' }] },
    });
    expect(feed[0].kind).toBe('gratuity');
    expect(feed[0].amount).toBeNull();
  });
});

describe('buildActivityFeed — what it leaves out', () => {
  it('skips voided sales', () => {
    const feed = buildActivityFeed([hound], {
      hound: { hist: [{ qty: 2, price: 25, date: '2026-03-01', voided: true }] },
    });
    expect(feed).toHaveLength(0);
  });

  it('skips sales the artist collected but has not forwarded', () => {
    const feed = buildActivityFeed([hound], {
      hound: { hist: [{ qty: 2, price: 25, date: '2026-03-01', artistPending: true }] },
    });
    expect(feed).toHaveLength(0);
  });

  it('skips the history mirror of a consignment sale so a store sale is reported once', () => {
    const feed = buildActivityFeed([hound], {
      hound: {
        hist: [{ qty: 2, price: 25, date: '2026-03-03', consignmentLink: 'x1' }],
        ledger: [{ id: 1, type: 'Sale', storeName: 'Ink & Wonder', qty: 2, amountDue: 30, date: '2026-03-03' }],
      },
    });
    expect(feed).toHaveLength(1);
    expect(feed[0].kind).toBe('consign-sale');
  });

  it('skips voided ledger rows', () => {
    const feed = buildActivityFeed([hound], {
      hound: { ledger: [{ id: 1, type: 'Shipment', qty: 5, date: '2026-03-01', voided: true }] },
    });
    expect(feed).toHaveLength(0);
  });

  it('skips a payout request that has been settled', () => {
    const feed = buildActivityFeed([hound], {
      hound: { payoutRequests: [{ id: 1, amount: 50, requestedAt: '2026-03-01T00:00:00Z', settled: true }] },
    });
    expect(feed).toHaveLength(0);
  });
});

describe('buildActivityFeed — ordering', () => {
  it('puts the newest day first across several books', () => {
    const feed = buildActivityFeed([hound, altrove], {
      hound: { hist: [{ num: 'a', qty: 1, price: 25, date: '2026-03-01' }] },
      altrove: { hist: [{ num: 'b', qty: 1, price: 55, date: '2026-03-09' }] },
    });
    expect(feed.map(e => e.bookId)).toEqual(['altrove', 'hound']);
  });

  it('sorts the three stored date shapes into one correct sequence', () => {
    const feed = buildActivityFeed([hound], {
      hound: {
        hist: [{ num: 'mid', qty: 1, price: 25, date: '2026-03-05' }],
        payoutRequests: [{ id: 1, amount: 10, requestedAt: '2026-03-09T10:00:00.000Z' }],
        invoices: [{ id: 2, num: 'I-1', total: 5, date: '', createdAt: Date.parse('2026-03-01T10:00:00.000Z') }],
      },
    });
    expect(feed.map(e => e.kind)).toEqual(['payout-request', 'sale', 'invoice']);
  });

  it('breaks a same-day tie on the later-recorded row', () => {
    const feed = buildActivityFeed([hound], {
      hound: {
        ledger: [
          { id: 100, type: 'Shipment', storeName: 'A', qty: 1, date: '2026-03-01' },
          { id: 900, type: 'Shipment', storeName: 'B', qty: 1, date: '2026-03-01' },
        ],
      },
    });
    expect(feed.map(e => e.text)).toEqual([
      'Sent The Hound to B',
      'Sent The Hound to A',
    ]);
  });

  it("keeps history's own newest-first order for rows sharing a day", () => {
    const feed = buildActivityFeed([hound], {
      hound: {
        hist: [
          { num: 'newest', qty: 1, price: 25, date: '2026-03-01' },
          { num: 'oldest', qty: 1, price: 25, date: '2026-03-01' },
        ],
      },
    });
    expect(feed.map(e => e.key)).toEqual(['hist:hound:newest', 'hist:hound:oldest']);
  });
});

describe('buildActivityFeed — keys', () => {
  it('gives history rows a stable unique key even though they carry no id', () => {
    const states = {
      hound: {
        hist: [
          { sheetsId: 'evt-1', qty: 1, price: 25, date: '2026-03-02' },
          { num: '1042', qty: 1, price: 25, date: '2026-03-01' },
          { qty: 1, price: 25, date: '2026-02-28' },
        ],
      },
    };
    const keys = buildActivityFeed([hound], states).map(e => e.key);
    expect(keys).toEqual(['hist:hound:evt-1', 'hist:hound:1042', 'hist:hound:2']);
    expect(new Set(keys).size).toBe(3);
    // Stable across repeat calls — nothing random, nothing time-based.
    expect(buildActivityFeed([hound], states).map(e => e.key)).toEqual(keys);
  });

  it('keeps two books apart even when their rows look identical', () => {
    const row = { num: '1', qty: 1, price: 10, date: '2026-03-01' };
    const feed = buildActivityFeed([hound, altrove], { hound: { hist: [{ ...row }] }, altrove: { hist: [{ ...row }] } });
    expect(new Set(feed.map(e => e.key)).size).toBe(2);
  });
});

describe('buildActivityFeed — currency', () => {
  it("renders a row in the currency stamped on that row, not the book's current one", () => {
    // The book says CA$ today, but this sale was recorded in euros.
    const feed = buildActivityFeed([hound], {
      hound: { hist: [{ num: 'x', qty: 2, price: 10, date: '2026-03-01', cur: 'EUR' }] },
    });
    expect(feed[0].amount).toBe('+€20.00');
  });

  it("falls back to the book's currency for a legacy row with no stamp", () => {
    const feed = buildActivityFeed([altrove], {
      altrove: { hist: [{ num: 'x', qty: 1, price: 55, date: '2026-03-01' }] },
    });
    expect(feed[0].amount).toBe('+€55.00');
  });

  it('never adds two amounts together — every event carries its own', () => {
    const feed = buildActivityFeed([hound, altrove], {
      hound: { hist: [{ num: 'a', qty: 1, price: 25, date: '2026-03-02', cur: 'CAD' }] },
      altrove: { hist: [{ num: 'b', qty: 1, price: 55, date: '2026-03-01', cur: 'EUR' }] },
    });
    expect(feed.map(e => e.amount)).toEqual(['+CA$25.00', '+€55.00']);
  });
});

describe('buildActivityFeed — shape and limits', () => {
  it('caps the feed and returns the newest events', () => {
    // 60 sales on 60 consecutive days, newest first — the shape `hist` really has.
    const hist = Array.from({ length: 60 }, (_, i) => {
      const day = new Date(Date.UTC(2026, 2, 1) - i * 86400000).toISOString().slice(0, 10);
      return { num: `n${i}`, qty: 1, price: 10, date: day };
    });
    const feed = buildActivityFeed([hound], { hound: { hist } });
    expect(feed).toHaveLength(ACTIVITY_LIMIT);
    expect(feed[0].key).toBe('hist:hound:n0');
  });

  it('honours an explicit limit', () => {
    const hist = Array.from({ length: 10 }, (_, i) => ({ num: `n${i}`, qty: 1, price: 10, date: '2026-03-01' }));
    expect(buildActivityFeed([hound], { hound: { hist } }, { limit: 3 })).toHaveLength(3);
  });

  it('survives an empty catalogue, missing state and junk input', () => {
    expect(buildActivityFeed([], {})).toEqual([]);
    expect(buildActivityFeed([hound], {})).toEqual([]);
    expect(buildActivityFeed(null, null)).toEqual([]);
    expect(buildActivityFeed([hound, null], { hound: {} })).toEqual([]);
  });

  it('carries the book identity every event needs to be rendered', () => {
    const feed = buildActivityFeed([hound], { hound: { hist: [{ num: 'x', qty: 1, price: 25, date: '2026-03-01' }] } });
    expect(feed[0]).toMatchObject({ bookId: 'hound', bookTitle: 'The Hound', accent: '#34579e', date: '2026-03-01' });
    expect(typeof feed[0].icon).toBe('string');
  });
});

describe('wiring', () => {
  const mainJs = readFileSync(join(root, 'src/main.js'), 'utf8');
  const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');

  it('is imported and rendered by the overview rail', () => {
    expect(mainJs).toContain("from './lib/activity-feed.js'");
    expect(mainJs).toContain('buildActivityFeed');
  });

  it('has a host element on the all-books landing page', () => {
    expect(indexHtml).toContain('id="all-activity"');
  });
});
