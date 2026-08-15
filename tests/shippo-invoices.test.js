import { describe, it, expect } from 'vitest';
import { appSource } from './helpers/extract-decl.js';
import {
  describeInvoiceAvailability,
  isExpiringLabelUrl,
  isLabelUrlExpired,
  labelUrlExpiry,
  shippoTxIdFromRef,
  invoiceIndexByTransaction,
  isSettledRefund,
  isoDate,
  parseInvoice,
  parseInvoiceItem,
  parseRefund,
  refundExpense,
} from '../src/lib/shippo-invoices.js';

describe('parsing invoices from a beta API', () => {
  it('reads the documented shape', () => {
    const inv = parseInvoice({
      object_id: 'inv_1', invoice_date: '2026-08-01T10:00:00Z',
      total: '124.50', currency: 'USD', status: 'PAID',
      period_start: '2026-07-25', period_end: '2026-08-01',
    });
    expect(inv).toMatchObject({
      id: 'inv_1', date: '2026-08-01', total: 124.5, currency: 'USD', status: 'PAID',
      periodStart: '2026-07-25', periodEnd: '2026-08-01',
    });
  });

  it('accepts alternative field names, since the contract may change', () => {
    // The endpoint is beta; the app must not break the moment a field is renamed.
    const inv = parseInvoice({ id: 'inv_2', created: '2026-08-02', amount: 10, currency_code: 'cad' });
    expect(inv).toMatchObject({ id: 'inv_2', date: '2026-08-02', total: 10, currency: 'CAD' });
  });

  it('returns null rather than throwing on an unrecognisable shape', () => {
    expect(parseInvoice(null)).toBeNull();
    expect(parseInvoice({})).toBeNull();
    expect(parseInvoice('nonsense')).toBeNull();
    expect(parseInvoice({ total: 5 })).toBeNull();
  });

  it('defaults a missing currency rather than producing undefined', () => {
    expect(parseInvoice({ object_id: 'x' }).currency).toBe('USD');
  });

  it('strips currency symbols out of a string total', () => {
    expect(parseInvoice({ object_id: 'x', total: '$1,234.56' }).total).toBe(1234.56);
  });
});

describe('invoice items tie a charge to a label', () => {
  it('reads the transaction it billed', () => {
    const item = parseInvoiceItem({
      object_id: 'it_1', invoice: 'inv_1', transaction: 'tx_9', amount: '13.93', currency: 'CAD',
    });
    expect(item).toMatchObject({ invoiceId: 'inv_1', transactionId: 'tx_9', amount: 13.93 });
  });

  it('indexes items by transaction for the join back to an expense', () => {
    const idx = invoiceIndexByTransaction([
      { object_id: 'a', invoice: 'inv_1', transaction: 'tx_1', amount: 1 },
      { object_id: 'b', invoice: 'inv_1', transaction: 'tx_2', amount: 2 },
      { object_id: 'c', invoice: 'inv_1' }, // no transaction — not indexable
    ]);
    expect(idx.size).toBe(2);
    expect(idx.get('tx_2').amount).toBe(2);
  });

  it('accepts already-parsed items without double-parsing', () => {
    const idx = invoiceIndexByTransaction([{ transactionId: 'tx_5', amount: 5, invoiceId: 'inv_1' }]);
    expect(idx.get('tx_5').amount).toBe(5);
  });

  it('ignores junk instead of throwing', () => {
    expect(invoiceIndexByTransaction([null, 'x', {}, undefined]).size).toBe(0);
    expect(invoiceIndexByTransaction(undefined).size).toBe(0);
  });
});

describe('refunds', () => {
  const original = {
    ref: 'shippo:tx_1', desc: 'Shippo shipping label #123', cat: 'Shipping & Postage',
    currency: 'USD', amount: 12.5, origCurrency: 'USD', origAmount: 12.5,
    fxRate: 1.37, baseAmount: 17.13, date: '2026-07-01',
  };

  it('reads a refund and the transaction it reverses', () => {
    const r = parseRefund({ object_id: 'rf_1', transaction: 'tx_1', status: 'SUCCESS', object_created: '2026-07-05' });
    expect(r).toMatchObject({ id: 'rf_1', transactionId: 'tx_1', status: 'SUCCESS', date: '2026-07-05' });
  });

  it('only counts refunds that actually returned money', () => {
    expect(isSettledRefund({ status: 'SUCCESS' })).toBe(true);
    expect(isSettledRefund({ status: 'PENDING' })).toBe(false);
    expect(isSettledRefund({ status: 'ERROR' })).toBe(false);
    expect(isSettledRefund(null)).toBe(false);
  });

  it('cancels the original expense exactly, in every column', () => {
    // The bug this fixes: a refunded label stayed in the ledger at full price,
    // overstating postage and understating profit.
    const r = parseRefund({ object_id: 'rf_1', transaction: 'tx_1', status: 'SUCCESS', object_created: '2026-07-05' });
    const entry = refundExpense(r, original, 42);
    expect(entry.amount).toBe(-12.5);
    expect(entry.origAmount).toBe(-12.5);
    // Mirrored, not recomputed — a different rate would leave a permanent drift.
    expect(entry.baseAmount).toBe(-17.13);
    expect(entry.fxRate).toBe(1.37);
    expect(entry.ref).toBe('shippo-refund:rf_1');
    expect(entry.refundOf).toBe('shippo:tx_1');
    expect(entry.cat).toBe('Shipping & Postage');
  });

  it('nets to zero against the original', () => {
    const r = { id: 'rf_1', transactionId: 'tx_1', status: 'SUCCESS', date: '2026-07-05' };
    const entry = refundExpense(r, original);
    expect(entry.amount + original.amount).toBe(0);
    expect(entry.baseAmount + original.baseAmount).toBe(0);
  });

  it('handles an original with no converted amount', () => {
    const entry = refundExpense({ id: 'r', transactionId: 't', date: '2026-01-01' }, { ...original, baseAmount: null });
    expect(entry.baseAmount).toBeNull();
  });

  it('refuses to build an entry with nothing to reverse', () => {
    expect(refundExpense(null, original)).toBeNull();
    expect(refundExpense({ id: 'r' }, null)).toBeNull();
    expect(refundExpense({ id: 'r' }, { ...original, amount: 0, origAmount: 0 })).toBeNull();
  });
});

describe('label links expire — verified against a real transaction', () => {
  // Taken from the live account: transaction created 2026-04-03T21:30:24Z,
  // signature expiring 2027-04-03T21:30:27Z. One year to the second. A label
  // URL stored in the ledger therefore dies on its own first birthday, well
  // inside the six years of records the CRA expects.
  const REAL = 'https://deliver.goshippo.com/3ac1ecda2e9745a4a2e5ff5cb10456b4.pdf?Expires=1806787827&Signature=abc~def&Key-Pair-Id=APKAJRICFXQ2S4YUQRSQ';

  it('recognises a signed label link', () => {
    expect(isExpiringLabelUrl(REAL)).toBe(true);
    expect(isExpiringLabelUrl('https://firebasestorage.googleapis.com/x.pdf')).toBe(false);
    expect(isExpiringLabelUrl('https://deliver.goshippo.com/x.pdf')).toBe(false); // no Expires
  });

  it('reads the expiry, one year after the label was created', () => {
    expect(labelUrlExpiry(REAL).toISOString()).toBe('2027-04-03T21:30:27.000Z');
  });

  it('knows whether a stored link still works', () => {
    expect(isLabelUrlExpired(REAL, new Date('2026-08-14T00:00:00Z'))).toBe(false);
    expect(isLabelUrlExpired(REAL, new Date('2027-06-01T00:00:00Z'))).toBe(true);
  });

  it('recovers the transaction id so a fresh link can be minted', () => {
    // This is what makes the fix possible with no data migration — every
    // imported Shippo expense already carries its transaction id.
    expect(shippoTxIdFromRef('shippo:3ac1ecda2e9745a4a2e5ff5cb10456b4'))
      .toBe('3ac1ecda2e9745a4a2e5ff5cb10456b4');
    expect(shippoTxIdFromRef('shippo-refund:abc')).toBe('');
    expect(shippoTxIdFromRef('manual-entry')).toBe('');
    expect(shippoTxIdFromRef(null)).toBe('');
  });

  it('returns nothing rather than throwing on a non-label URL', () => {
    expect(labelUrlExpiry('not a url')).toBeNull();
    expect(isLabelUrlExpired('not a url')).toBe(false);
  });
});

describe('degrading when invoices are unavailable', () => {
  it('explains a 404 as "not on this account" and points at the dashboard', () => {
    // Beta endpoint: unavailable is an expected outcome, not a fault.
    const msg = describeInvoiceAvailability(404);
    expect(msg).toMatch(/Settings → Account → Billing/);
    expect(msg).not.toMatch(/error/i);
  });

  it('explains an auth failure differently from a missing endpoint', () => {
    expect(describeInvoiceAvailability(403)).toMatch(/token/i);
    expect(describeInvoiceAvailability(401)).toMatch(/token/i);
  });

  it('reassures that labels still imported on any other failure', () => {
    expect(describeInvoiceAvailability(500)).toMatch(/labels were imported as usual/i);
  });
});

describe('isoDate', () => {
  it('normalises timestamps and passes through plain dates', () => {
    expect(isoDate('2026-08-01T10:00:00Z')).toBe('2026-08-01');
    expect(isoDate('2026-08-01')).toBe('2026-08-01');
  });

  it('returns empty for junk rather than an Invalid Date', () => {
    expect(isoDate('nonsense')).toBe('');
    expect(isoDate('')).toBe('');
    expect(isoDate(null)).toBe('');
  });
});

describe('wiring', () => {
  it('imports refunds and invoices in the Shippo import', () => {
    expect(appSource).toContain('fetchShippoInvoiceItems');
    expect(appSource).toContain('fetchShippoRefunds');
    expect(appSource).toContain('refundExpense');
  });

  it('keeps the label as supporting evidence, not the receipt of record', () => {
    expect(appSource).toContain('labelUrl');
    expect(appSource).toContain('supportingFiles');
  });

  it('opens labels by minting a fresh link rather than a stored expiring one', () => {
    expect(appSource).toContain('async function openShippoLabel');
    expect(appSource).toContain("onclick=\"event.preventDefault(); openShippoLabel(");
  });
});
