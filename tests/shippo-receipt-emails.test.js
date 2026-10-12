import { describe, it, expect } from 'vitest';
import { attachEmailReceipts, parseShippoReceiptEmail } from '../src/lib/shippo-invoices.js';

// Shape of a real "Your Shippo Invoice Receipt" plain-text body: the invoice
// link only appears inside a click-tracking payload.
const payload = Buffer.from(JSON.stringify({ p: JSON.stringify({ url: 'https:\\/\\/apps.goshippo.com\\/settings\\/account\\/billing\\/invoices\\/c4326a54281e4bb28ca673ff46ee5fa8' }) })).toString('base64url');
const body = `Shippo Invoice Confirmation Invoice Payment Confirmation
 Invoice #678955000
<https://mandrillapp.com/track/click/30103740/apps.goshippo.com?p=${payload}>
 = Your payment has processed =
 This is confirmation that we have received payment for *Oct 11, 2026* for
1 transaction with a total of *$8.03 USD.*`;

const label = (over = {}) => ({ ref: 'shippo:abc123def456', date: '2026-10-11', origAmount: 8.03, origCurrency: 'USD', receipt: 'https://shippo-delivery.s3.amazonaws.com/x.pdf?Expires=1', ...over });

describe('parseShippoReceiptEmail', () => {
  it('reads the total, date, count and invoice link', () => {
    expect(parseShippoReceiptEmail({ id: 'm1', body, date: '2026-10-11T14:14:21Z' })).toEqual({
      messageId: 'm1', invoiceNumber: '678955000', date: '2026-10-11', total: 8.03, currency: 'USD', count: 1,
      url: 'https://apps.goshippo.com/settings/account/billing/invoices/c4326a54281e4bb28ca673ff46ee5fa8',
    });
  });
  it('ignores mail that is not a receipt', () => {
    expect(parseShippoReceiptEmail({ id: 'm2', body: 'Holiday shipping tips' })).toBeNull();
  });
});

describe('attachEmailReceipts', () => {
  const receipt = parseShippoReceiptEmail({ id: 'm1', body, date: '2026-10-11' });
  it('puts the receipt in front of the label', () => {
    const e = label();
    const { changed } = attachEmailReceipts([e], [receipt]);
    expect(changed).toEqual([e]);
    expect(e.receiptFiles[0]).toBe(receipt.url);
    expect(e.receiptFiles[1]).toMatch(/shippo-delivery/);
    expect(e.invoiceId).toBe('678955000');
  });
  it('leaves a different amount or currency alone', () => {
    expect(attachEmailReceipts([label({ origAmount: 9 })], [receipt]).changed).toHaveLength(0);
    expect(attachEmailReceipts([label({ origCurrency: 'CAD' })], [receipt]).changed).toHaveLength(0);
  });
  it('uses each receipt once and is idempotent', () => {
    const a = label(); const b = label({ ref: 'shippo:other' });
    expect(attachEmailReceipts([a, b], [receipt]).changed).toHaveLength(1);
    expect(attachEmailReceipts([a, b], [receipt]).changed).toHaveLength(0);
  });
  it('matches a multi-label receipt only when count and sum agree', () => {
    const multi = { ...receipt, count: 2, total: 15.03 };
    const a = label(); const b = label({ ref: 'shippo:b', origAmount: 7 });
    expect(attachEmailReceipts([a, b], [multi]).changed).toHaveLength(2);
    const c = label(); const d = label({ ref: 'shippo:d', origAmount: 6 });
    expect(attachEmailReceipts([c, d], [multi]).changed).toHaveLength(0);
  });
});
