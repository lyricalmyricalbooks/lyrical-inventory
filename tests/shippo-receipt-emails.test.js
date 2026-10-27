import { describe, it, expect } from 'vitest';
import { attachEmailReceipts, parseShippoReceiptEmail } from '../src/lib/carriers/shippo-invoices.js';

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
      sentAt: '2026-10-11T14:14:21.000Z',
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

// Real case from the shop: a Canada Post label priced CA$11.28, bought at
// 13:31:11, and Shippo's receipt for it — $7.97 USD — emailed six seconds later.
describe('matching a receipt charged in another currency', () => {
  const usdBody = body.replace('*Oct 11, 2026*', '*Oct 18, 2026*').replace('$8.03 USD', '$7.97 USD');
  const usdReceipt = parseShippoReceiptEmail({ id: 'm9', body: usdBody, date: '2026-10-18T13:31:17Z' });
  const cad = (over = {}) => label({
    ref: 'shippo:c40d0264d41c4aac89e5d8fc79912ce6', date: '2026-10-18', origAmount: 11.28, origCurrency: 'CAD',
    labelCreatedAt: '2026-10-18T13:31:11.635Z', ...over,
  });

  it('ties the receipt to the label bought just before it was sent', () => {
    const e = cad();
    expect(attachEmailReceipts([e], [usdReceipt]).changed).toEqual([e]);
    expect(e.receipt).toBe(usdReceipt.url);
  });

  it('picks the right label out of several bought minutes apart', () => {
    const early = cad({ ref: 'shippo:early', labelCreatedAt: '2026-10-18T13:28:40Z' });
    const right = cad();
    expect(attachEmailReceipts([early, right], [usdReceipt]).changed).toEqual([right]);
  });

  it('leaves two labels bought seconds apart alone rather than guess', () => {
    const a = cad(); const b = cad({ ref: 'shippo:twin', labelCreatedAt: '2026-10-18T13:31:05Z' });
    expect(attachEmailReceipts([a, b], [usdReceipt]).changed).toHaveLength(0);
  });

  it('does not reach back to a label bought long before the email', () => {
    expect(attachEmailReceipts([cad({ labelCreatedAt: '2026-10-18T13:10:00Z' })], [usdReceipt]).changed).toHaveLength(0);
  });

  it('without a purchase time, a cross-currency receipt is left alone', () => {
    expect(attachEmailReceipts([cad({ labelCreatedAt: undefined })], [usdReceipt]).changed).toHaveLength(0);
  });

  it('in the same currency, the amount still has to agree', () => {
    const e = cad({ origCurrency: 'USD', origAmount: 9.5 });
    expect(attachEmailReceipts([e], [usdReceipt]).changed).toHaveLength(0);
  });

  it('only keeps a send time when the date carries one', () => {
    expect(parseShippoReceiptEmail({ id: 'x', body, date: '2026-10-11' }).sentAt).toBe('');
  });
});
