import { describe, it, expect } from 'vitest';
import {
  histMirrorForLedger,
  stampLedgerInvoiceLink,
  reconcileConsignmentInvoiceLinks,
  consignmentSyncPayload,
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

describe('reconcileConsignmentInvoiceLinks', () => {
  it('propagates an invoice rename to a mirror whose link was previously broken', () => {
    // The ledger entry was stamped (badge shows it) but the split sheetsId kept
    // the rename from ever reaching the mirror — the exact reported bug.
    const e = ledgerSale({ sheetsId: 'evt-aaa', invoiceId: 'inv-1', invoiceNum: 'INV-2026-222' });
    const h = histMirror({ sheetsId: 'evt-DIFFERENT', invoiceId: null, invoiceNum: null });
    const s = { ledger: [e], hist: [h], invoices: [invoice({ id: 'inv-1', num: 'INV-2026-223' })] };
    reconcileConsignmentInvoiceLinks(s);
    expect(e.invoiceNum).toBe('INV-2026-223'); // refreshed from the live invoice
    expect(h.invoiceNum).toBe('INV-2026-223'); // now reflected on the mirror
    expect(h.sheetsId).toBe('evt-aaa');         // and the link is healed
  });

  it('clears links pointing at a deleted invoice', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa', invoiceId: 'gone', invoiceNum: 'INV-OLD' });
    const h = histMirror({ sheetsId: 'evt-aaa', invoiceId: 'gone', invoiceNum: 'INV-OLD' });
    const s = { ledger: [e], hist: [h], invoices: [] };
    reconcileConsignmentInvoiceLinks(s);
    expect(e.invoiceId).toBeNull();
    expect(e.invoiceNum).toBeNull();
    expect(h.invoiceNum).toBeNull();
  });

  it('leaves un-invoiced sales untouched and tolerates a missing ledger', () => {
    const e = ledgerSale({ sheetsId: 'evt-aaa' });
    const s = { ledger: [e], hist: [histMirror({ sheetsId: 'evt-aaa' })], invoices: [] };
    reconcileConsignmentInvoiceLinks(s);
    expect(e.invoiceNum == null || e.invoiceNum === '').toBe(true);
    expect(() => reconcileConsignmentInvoiceLinks({})).not.toThrow();
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
