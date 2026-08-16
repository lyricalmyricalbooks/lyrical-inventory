import { describe, it, expect } from 'vitest';
import {
  histMirrorForLedger,
  stampLedgerInvoiceLink,
  reconcileConsignmentMirrors,
  syncHistMirrorFromLedger,
  ledgerSaleIndexForHistMirror,
  consignmentSyncPayload,
  collectUniqueConsignmentStores,
} from '../src/lib/consignment.js';

// A consignment Sale as it lands in the ledger (canonical) + its History mirror
// (s.hist with consignmentLink). They normally share one sheetsId, but legacy
// rows had it backfilled independently — the case these tests pin down.
const ledgerSale = (over = {}) => ({
  id: 1, type: 'Sale', storeName: 'Rooneys', date: '2026-06-23',
  qty: 10, rate: 40, amountDue: 234, status: 'pending', ...over,
});
const histMirror = (over = {}) => ({
  num: 'CON-ROONE-2354', chan: 'Consignment', consignmentLink: true,
  notes: 'Rooneys', date: '2026-06-23', qty: 10, price: 23.4, ...over,
});
const invoice = (over = {}) => ({ id: 'inv-1', num: 'INV-2026-223', ...over });

describe('histMirrorForLedger', () => {
  it('matches the mirror by shared sheetsId (the normal path)', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa' });
    const h = histMirror({ sheetsId: 'evt-aaa' });
    const s = { ledger: [e], hist: [h] };
    expect(histMirrorForLedger(s, e)).toBe(h);
  });

  it('falls back to store+date+qty+amount when sheetsIds were split (legacy backfill)', () => {
    // backfillSheetsIds() minted a fresh id per record, orphaning the pair.
    const e = ledgerSale({ sheetsId: 'evt-aaa' });
    const h = histMirror({ sheetsId: 'evt-DIFFERENT' });
    const s = { ledger: [e], hist: [h] };
    expect(histMirrorForLedger(s, e)).toBe(h);
  });

  it('matches via the shape fallback even when the ledger row has no sheetsId', () => {
    const e = ledgerSale({ sheetsId: undefined });
    const h = histMirror({ sheetsId: 'evt-aaa' });
    const s = { ledger: [e], hist: [h] };
    expect(histMirrorForLedger(s, e)).toBe(h);
  });

  it('does not match a different store / qty / amount', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa' });
    const s = {
      ledger: [e],
      hist: [
        histMirror({ sheetsId: 'x', notes: 'Other Shop' }),
        histMirror({ sheetsId: 'y', qty: 5, price: 23.4 }),
        histMirror({ sheetsId: 'z', qty: 10, price: 10 }), // amount 100, not 234
      ],
    };
    expect(histMirrorForLedger(s, e)).toBeNull();
  });

  it('ignores non-consignment history rows in the fallback', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa' });
    const h = histMirror({ sheetsId: 'evt-bbb', consignmentLink: false });
    const s = { ledger: [e], hist: [h] };
    expect(histMirrorForLedger(s, e)).toBeNull();
  });

  it('only resolves a mirror for Sale entries when the sheetsId join misses', () => {
    const e = { id: 2, type: 'Shipment', storeName: 'Rooneys', date: '2026-06-23', qty: 10, sheetsId: 'evt-x' };
    const s = { ledger: [e], hist: [histMirror({ sheetsId: 'evt-y' })] };
    expect(histMirrorForLedger(s, e)).toBeNull();
  });

  it('skips a mirror another ledger row already claimed', () => {
    // Two identical sales at the same store on the same day are indistinguishable
    // to the shape fallback, so without the claimed set both bind to one mirror
    // and the second sale's amount silently overwrites the first's.
    const e1 = ledgerSale({ id: 1 });
    const e2 = ledgerSale({ id: 2 });
    const h1 = histMirror({ num: 'CON-ROONE-0001' });
    const h2 = histMirror({ num: 'CON-ROONE-0002' });
    const s = { ledger: [e1, e2], hist: [h1, h2] };
    const claimed = new Set([h1]);
    expect(histMirrorForLedger(s, e1)).toBe(h1);
    expect(histMirrorForLedger(s, e2, claimed)).toBe(h2);
  });
});

// The reported bug: the Consignment ledger showed a sale corrected to CA$33.00
// while the Tax Center ledger (and the CSV that Excel opens) still reported the
// CA$53.35 it was first recorded at, because both read the mirror and nothing
// re-derived the mirror from the ledger row that was actually edited.
describe('syncHistMirrorFromLedger', () => {
  it('carries a corrected amount onto the mirror', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa', qty: 1, rate: 40, amountDue: 33 });
    const h = histMirror({ sheetsId: 'evt-aaa', qty: 1, price: 53.35 });
    expect(syncHistMirrorFromLedger({ ledger: [e], hist: [h] }, e)).toBe(true);
    expect(h.price).toBeCloseTo(33, 6);
    expect(h.qty).toBe(1);
  });

  it('splits the amount due across the units it covers', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa', qty: 4, amountDue: 90 });
    const h = histMirror({ sheetsId: 'evt-aaa' });
    syncHistMirrorFromLedger({ ledger: [e], hist: [h] }, e);
    expect(h.qty).toBe(4);
    expect(h.price).toBeCloseTo(22.5, 6);
  });

  it('follows a corrected date so the sale lands in the right tax year', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa', date: '2026-01-04' });
    const h = histMirror({ sheetsId: 'evt-aaa', date: '2025-12-28' });
    syncHistMirrorFromLedger({ ledger: [e], hist: [h] }, e);
    expect(h.date).toBe('2026-01-04');
  });

  it('propagates void and unvoid so a reversed sale stops counting as income', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa', voided: true });
    const h = histMirror({ sheetsId: 'evt-aaa' });
    const s = { ledger: [e], hist: [h] };
    syncHistMirrorFromLedger(s, e);
    expect(h.voided).toBe(true);
    e.voided = false;
    syncHistMirrorFromLedger(s, e);
    expect(h.voided).toBe(false);
  });

  it('accepts a mirror resolved before the edit, and heals the split sheetsId', () => {
    // The legacy split-id case: the caller grabs the mirror by shape BEFORE
    // mutating the row, because the edit is about to invalidate that very shape.
    const e = ledgerSale({ sheetsId: 'evt-aaa' });
    const h = histMirror({ sheetsId: 'evt-DIFFERENT' });
    const s = { ledger: [e], hist: [h] };
    const mirror = histMirrorForLedger(s, e);
    e.qty = 4; e.amountDue = 90; e.date = '2026-07-01';
    expect(histMirrorForLedger(s, e)).toBeNull();      // shape join is gone
    syncHistMirrorFromLedger(s, e, mirror);
    expect(h.price).toBeCloseTo(22.5, 6);
    expect(h.sheetsId).toBe('evt-aaa');                 // future lookups are O(1)
  });

  it('leaves the mirror alone when nothing changed, and never touches its notes', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa', notes: 'Paid by e-transfer' });
    const h = histMirror({ sheetsId: 'evt-aaa' });
    // The mirror's notes are the store name — the History "Notes" column and the
    // fallback join both key on it, so the ledger's own free text must not land here.
    expect(syncHistMirrorFromLedger({ ledger: [e], hist: [h] }, e)).toBe(false);
    expect(h.notes).toBe('Rooneys');
  });

  it('ignores non-Sale rows and an orphaned mirror', () => {
    const shipment = { id: 9, type: 'Shipment', storeName: 'Rooneys', date: '2026-06-23', qty: 10, sheetsId: 'evt-aaa' };
    expect(syncHistMirrorFromLedger({ ledger: [shipment], hist: [] }, shipment)).toBe(false);
    expect(syncHistMirrorFromLedger({ ledger: [], hist: [] }, ledgerSale())).toBe(false);
  });
});

describe('ledgerSaleIndexForHistMirror', () => {
  it('finds the ledger row behind a mirror by shared sheetsId', () => {
    const s = {
      ledger: [ledgerSale({ id: 1, sheetsId: 'evt-other' }), ledgerSale({ id: 2, sheetsId: 'evt-aaa' })],
      hist: [],
    };
    expect(ledgerSaleIndexForHistMirror(s, histMirror({ sheetsId: 'evt-aaa' }))).toBe(1);
  });

  it('falls back to store + date + qty when the ids were split', () => {
    const s = { ledger: [ledgerSale({ sheetsId: 'evt-aaa' })], hist: [] };
    expect(ledgerSaleIndexForHistMirror(s, histMirror({ sheetsId: 'evt-zzz' }))).toBe(0);
  });

  it('returns -1 for an orphan mirror or a plain direct sale', () => {
    expect(ledgerSaleIndexForHistMirror({ ledger: [] }, histMirror())).toBe(-1);
    const direct = { num: 'A1', chan: 'Direct', date: '2026-06-23', qty: 10, price: 20 };
    expect(ledgerSaleIndexForHistMirror({ ledger: [ledgerSale()] }, direct)).toBe(-1);
  });
});

describe('stampLedgerInvoiceLink', () => {
  it('stamps the invoice on both the ledger entry and its mirror', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa' });
    const h = histMirror({ sheetsId: 'evt-aaa' });
    const s = { ledger: [e], hist: [h] };
    stampLedgerInvoiceLink(s, 1, invoice());
    expect(e.invoiceId).toBe('inv-1');
    expect(e.invoiceNum).toBe('INV-2026-223');
    expect(h.invoiceId).toBe('inv-1');
    expect(h.invoiceNum).toBe('INV-2026-223');
  });

  it('heals a split sheetsId onto the mirror while stamping', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa' });
    const h = histMirror({ sheetsId: 'evt-DIFFERENT' });
    const s = { ledger: [e], hist: [h] };
    stampLedgerInvoiceLink(s, 1, invoice());
    expect(h.sheetsId).toBe('evt-aaa'); // realigned to the canonical ledger id
    expect(h.invoiceNum).toBe('INV-2026-223');
  });

  it('clears the link on both rows when inv is null', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa', invoiceId: 'inv-1', invoiceNum: 'INV-2026-223' });
    const h = histMirror({ sheetsId: 'evt-aaa', invoiceId: 'inv-1', invoiceNum: 'INV-2026-223' });
    const s = { ledger: [e], hist: [h] };
    stampLedgerInvoiceLink(s, 1, null);
    expect(e.invoiceId).toBeNull();
    expect(e.invoiceNum).toBeNull();
    expect(h.invoiceId).toBeNull();
    expect(h.invoiceNum).toBeNull();
  });

  it('is a no-op for an unknown ledger id', () => {
    const s = { ledger: [ledgerSale()], hist: [histMirror()] };
    expect(() => stampLedgerInvoiceLink(s, 999, invoice())).not.toThrow();
  });

  it('appends invoice discount details to notes when stamped, and cleans them when unlinked', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa', notes: 'Rooneys' });
    const h = histMirror({ sheetsId: 'evt-aaa', notes: 'Rooneys' });
    const s = { ledger: [e], hist: [h] };
    
    // Stamping invoice with percent discount
    stampLedgerInvoiceLink(s, 1, invoice({ discount: 10, discountType: 'percent', discountRate: 10 }));
    expect(e.notes).toBe('Rooneys · Invoice Discount: 10%');
    expect(h.notes).toBe('Rooneys · Invoice Discount: 10%');

    // Stamping again with different discount (cleans up previous note)
    stampLedgerInvoiceLink(s, 1, invoice({ discount: 5, discountType: 'percent', discountRate: 5 }));
    expect(e.notes).toBe('Rooneys · Invoice Discount: 5%');
    expect(h.notes).toBe('Rooneys · Invoice Discount: 5%');

    // Unlinking (clears discount note)
    stampLedgerInvoiceLink(s, 1, null);
    expect(e.notes).toBe('Rooneys');
    expect(h.notes).toBe('Rooneys');
  });
});

describe('reconcileConsignmentMirrors', () => {
  it('propagates an invoice rename to a mirror whose link was previously broken', () => {
    // The ledger entry was stamped (badge shows it) but the split sheetsId kept
    // the rename from ever reaching the mirror — the exact reported bug.
    const e = ledgerSale({ sheetsId: 'evt-aaa', invoiceId: 'inv-1', invoiceNum: 'INV-2026-222' });
    const h = histMirror({ sheetsId: 'evt-DIFFERENT', invoiceId: null, invoiceNum: null });
    const s = { ledger: [e], hist: [h], invoices: [invoice({ id: 'inv-1', num: 'INV-2026-223' })] };
    reconcileConsignmentMirrors(s);
    expect(e.invoiceNum).toBe('INV-2026-223'); // refreshed from the live invoice
    expect(h.invoiceNum).toBe('INV-2026-223'); // now reflected on the mirror
    expect(h.sheetsId).toBe('evt-aaa');         // and the link is healed
  });

  it('clears links pointing at a deleted invoice', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa', invoiceId: 'gone', invoiceNum: 'INV-OLD' });
    const h = histMirror({ sheetsId: 'evt-aaa', invoiceId: 'gone', invoiceNum: 'INV-OLD' });
    const s = { ledger: [e], hist: [h], invoices: [] };
    reconcileConsignmentMirrors(s);
    expect(e.invoiceId).toBeNull();
    expect(e.invoiceNum).toBeNull();
    expect(h.invoiceNum).toBeNull();
  });

  it('leaves un-invoiced sales untouched and tolerates a missing ledger', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa' });
    const s = { ledger: [e], hist: [histMirror({ sheetsId: 'evt-aaa' })], invoices: [] };
    reconcileConsignmentMirrors(s);
    expect(e.invoiceNum == null || e.invoiceNum === '').toBe(true);
    expect(() => reconcileConsignmentMirrors({})).not.toThrow();
  });

  it('heals a mirror left behind by an earlier edit, without a re-save', () => {
    // Sales edited before the mirror was kept in sync are already persisted
    // diverged, so the reconcile has to repair them on read — this is what makes
    // the Tax Center agree with the Consignment ledger for existing records.
    const e = ledgerSale({ sheetsId: 'evt-aaa', qty: 1, rate: 40, amountDue: 33 });
    const h = histMirror({ sheetsId: 'evt-aaa', qty: 1, price: 53.35 });
    reconcileConsignmentMirrors({ ledger: [e], hist: [h], invoices: [] });
    expect(h.price).toBeCloseTo(33, 6);
  });

  it('marks a mirror voided when its ledger sale was reversed', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa', voided: true });
    const h = histMirror({ sheetsId: 'evt-aaa' });
    reconcileConsignmentMirrors({ ledger: [e], hist: [h], invoices: [] });
    expect(h.voided).toBe(true);
  });

  it('pairs two identical same-day sales with a mirror each', () => {
    // Two single-copy sales at the same store, same day, same price look alike
    // to the shape fallback. Unguarded, both ledger rows resolve to the first
    // mirror — so the second sale's invoice lands on the first sale's row and
    // the second row is left unbilled.
    const e1 = ledgerSale({ id: 1, qty: 1, amountDue: 30 });
    const e2 = ledgerSale({ id: 2, qty: 1, amountDue: 30, invoiceId: 'inv-1', invoiceNum: 'INV-2026-223' });
    const h1 = histMirror({ num: 'CON-ROONE-0001', qty: 1, price: 30 });
    const h2 = histMirror({ num: 'CON-ROONE-0002', qty: 1, price: 30 });
    reconcileConsignmentMirrors({ ledger: [e1, e2], hist: [h1, h2], invoices: [invoice()] });
    expect(h1.invoiceNum).toBeNull();
    expect(h2.invoiceNum).toBe('INV-2026-223');
  });
});

describe('consignmentSyncPayload', () => {
  const book = { title: 'The Hound', currency: 'CA$' };

  it('carries the invoice number to the Google Sheets payload', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa', invoiceNum: 'INV-2026-223' });
    const p = consignmentSyncPayload(book, e);
    expect(p).toMatchObject({
      type: 'consignment', book: 'The Hound', store: 'Rooneys',
      event: 'Sale', qty: 10, rate: 40, amountDue: 234,
      invoiceNum: 'INV-2026-223', sheetsId: 'evt-aaa',
    });
  });

  it('sends a blank invoice number for an unlinked row', () => {
    const p = consignmentSyncPayload(book, ledgerSale({ sheetsId: 'evt-aaa' }));
    expect(p.invoiceNum).toBe('');
  });
});

describe('collectUniqueConsignmentStores', () => {
  it('returns empty array when states or bookList are empty or invalid', () => {
    expect(collectUniqueConsignmentStores(null, [])).toEqual([]);
    expect(collectUniqueConsignmentStores({}, [])).toEqual([]);
    expect(collectUniqueConsignmentStores({ b1: { stores: [] } }, [{ id: 'b1', title: 'Book 1' }])).toEqual([]);
  });

  it('aggregates and deduplicates stores across multiple books', () => {
    const books = [
      { id: 'b1', title: 'The Hound' },
      { id: 'b2', title: 'The Bell' },
    ];
    const states = {
      b1: {
        stores: [
          { name: 'Art Metropole', city: 'Toronto', contact: 'Sam', rate: 40, sent: 10, sold: 4, returned: 1, outstanding: 5, amountOwed: 60 },
          { name: 'Glad Day Books', city: 'Toronto', rate: 40, sent: 5, sold: 5, returned: 0, outstanding: 0, amountOwed: 0 },
        ],
      },
      b2: {
        stores: [
          { name: 'art metropole', city: 'Toronto', email: 'orders@artmetropole.com', address: '890 Dundas St W', rate: 40, sent: 6, sold: 2, returned: 0, outstanding: 4, amountOwed: 30 },
          { name: 'Artphelien', city: 'Geneva', country: 'Switzerland', rate: 35, sent: 3, sold: 1, returned: 0, outstanding: 2, amountOwed: 15 },
        ],
      },
    };

    const result = collectUniqueConsignmentStores(states, books);
    expect(result.length).toBe(3);

    // Sorted alphabetically
    expect(result[0].name).toBe('Art Metropole');
    expect(result[1].name).toBe('Artphelien');
    expect(result[2].name).toBe('Glad Day Books');

    // Art Metropole merged details
    const am = result[0];
    expect(am.contact).toBe('Sam');
    expect(am.email).toBe('orders@artmetropole.com');
    expect(am.address).toBe('890 Dundas St W');
    expect(am.city).toBe('Toronto');
    expect(am.books).toEqual(['The Hound', 'The Bell']);
    expect(am.bookIds).toEqual(['b1', 'b2']);
    expect(am.totalSent).toBe(16);
    expect(am.totalSold).toBe(6);
    expect(am.totalReturned).toBe(1);
    expect(am.totalOutstanding).toBe(9);
    expect(am.totalAmountOwed).toBe(90);

    // Artphelien details
    const artp = result[1];
    expect(artp.city).toBe('Geneva');
    expect(artp.country).toBe('Switzerland');
    expect(artp.rate).toBe(35);
    expect(artp.books).toEqual(['The Bell']);
  });

  it('handles trimmed names and skips blank names', () => {
    const books = [{ id: 'b1', title: 'Book 1' }];
    const states = {
      b1: {
        stores: [
          { name: '  Type Books  ', city: 'Toronto' },
          { name: '   ' },
          { name: null },
        ],
      },
    };

    const result = collectUniqueConsignmentStores(states, books);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Type Books');
    expect(result[0].city).toBe('Toronto');
  });
});
