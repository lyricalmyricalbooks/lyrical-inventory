import { describe, it, expect } from 'vitest';
import {
  receiptMarkup, receiptLinkOnly, senderDomain, senderRule, normalizeSenderRules, withSenderRule, senderSuggestions,
  receiptWarnings, craRecordGaps, isSpotCheck, spotCheckAccuracy, sameOrderElsewhere,
} from '../src/lib/receipt-signals.js';
import { receiptReviewStatus, normalizeFoundReceipt } from '../src/lib/receipt-finder.js';
import { describeDailySweep } from '../src/lib/receipt-finder-client.js';

const orderEmail = `<html><head><script type="application/ld+json">
{"@context":"http://schema.org","@type":"Order","merchant":{"@type":"Organization","name":"Paper Supply Co"},
 "orderNumber":"PS-1042","priceCurrency":"CAD","price":"56.50","orderDate":"2026-11-20T10:00:00-05:00"}
</script></head><body>Thanks!</body></html>`;

describe('order details a store embeds in its email', () => {
  it('reads the seller, order number, total, currency and day', () => {
    expect(receiptMarkup(orderEmail)).toEqual({ type: 'Order', vendor: 'Paper Supply Co', reference: 'PS-1042', amount: 56.5, currency: 'CAD', date: '2026-11-20' });
  });

  it('finds an invoice inside a graph, and the total in its payment-due block', () => {
    const html = `<script type='application/ld+json'>{"@graph":[{"@type":"Organization"},{"@type":"Invoice","provider":{"name":"Hosting Ltd"},
      "confirmationNumber":"INV-7","totalPaymentDue":{"price":"19.99","priceCurrency":"usd"},"paymentDueDate":"2026-12-01"}]}</script>`;
    expect(receiptMarkup(html)).toMatchObject({ type: 'Invoice', vendor: 'Hosting Ltd', reference: 'INV-7', amount: 19.99, currency: 'USD', date: '2026-12-01' });
  });

  it('gives null when there is none, or it is broken, or it is not an order', () => {
    expect(receiptMarkup('<p>Total $5.00</p>')).toBeNull();
    expect(receiptMarkup('<script type="application/ld+json">{not json</script>')).toBeNull();
    expect(receiptMarkup('<script type="application/ld+json">{"@type":"ParcelDelivery"}</script>')).toBeNull();
  });
});

describe('a receipt that is only behind a link', () => {
  it('finds a "view your receipt" link', () => {
    expect(receiptLinkOnly('<a href="https://pay.example.com/r/abc">View your receipt</a>')).toBe('https://pay.example.com/r/abc');
    expect(receiptLinkOnly('<a class="b" href=\'https://x.example/inv\'><span>Download</span> invoice</a>')).toBe('https://x.example/inv');
  });

  it('ignores other links and anything that is not https', () => {
    expect(receiptLinkOnly('<a href="https://example.com/unsub">Unsubscribe</a>')).toBe('');
    expect(receiptLinkOnly('<a href="http://example.com/r">View receipt</a>')).toBe('');
    expect(receiptLinkOnly('<a href="javascript:alert(1)">View receipt</a>')).toBe('');
  });
});

describe('sender lists', () => {
  it('names the registrable domain of a sender', () => {
    expect(senderDomain('"Square" <receipts@messaging.squareup.com>')).toBe('squareup.com');
    expect(senderDomain('orders@amazon.co.uk')).toBe('amazon.co.uk');
    expect(senderDomain('nobody')).toBe('');
  });

  it('applies never before always, and keeps the lists clean', () => {
    const rules = normalizeSenderRules({ never: ['Spam.com', 'bad value', 'spam.com'], always: ['spam.com', 'shop.ca'] });
    expect(rules).toEqual({ never: ['spam.com'], always: ['shop.ca'] });
    expect(senderRule('a@mail.spam.com', rules)).toBe('never');
    expect(senderRule('a@shop.ca', rules)).toBe('always');
    expect(senderRule('a@other.ca', rules)).toBe('');
  });

  it('moves a sender between lists and forgets one', () => {
    let rules = withSenderRule({}, 'shop.ca', 'always');
    rules = withSenderRule(rules, 'shop.ca', 'never');
    expect(rules).toEqual({ never: ['shop.ca'], always: [] });
    expect(withSenderRule(rules, 'shop.ca', '')).toEqual({ never: [], always: [] });
  });

  it('offers to stop reading a sender only after repeated dismissals and no filing', () => {
    const d = (status, from = 'news@promo.com') => ({ status, from, vendor: 'Promo' });
    expect(senderSuggestions([d('ignored'), d('ignored'), d('ignored')], {})).toEqual([expect.objectContaining({ domain: 'promo.com', dismissed: 3 })]);
    expect(senderSuggestions([d('ignored'), d('ignored'), d('ignored'), d('imported')], {})).toEqual([]);
    expect(senderSuggestions([d('ignored'), d('ignored'), d('ignored')], { never: ['promo.com'] })).toEqual([]);
  });
});

describe('sums that must add up', () => {
  const base = { amount: 113, subtotal: 100, tax: 13, shipping: 0 };
  it('passes a receipt whose parts agree', () => {
    expect(receiptWarnings({ ...base, lineItems: [{ amount: 60 }, { amount: 40 }], taxLines: [{ name: 'HST', amount: 13 }] })).toEqual([]);
  });
  it('flags line items, tax lines and tax shares that do not fit', () => {
    expect(receiptWarnings({ ...base, lineItems: [{ amount: 60 }, { amount: 30 }] })).toContain('The line items do not add up to the subtotal');
    expect(receiptWarnings({ ...base, taxLines: [{ amount: 5 }, { amount: 5 }] })).toContain('The tax lines do not add up to the tax');
    expect(receiptWarnings({ amount: 150, subtotal: 100, tax: 50 })).toContain('The tax is more than 20% of the subtotal');
    expect(receiptWarnings({ amount: 50, subtotal: 100, tax: 0 })).toContain('The subtotal is larger than the total');
  });
  it('checks line items against the total when there is no subtotal, tax or shipping', () => {
    expect(receiptWarnings({ amount: 30, subtotal: null, tax: null, shipping: null, lineItems: [{ amount: 10 }, { amount: 10 }] })).toHaveLength(1);
  });
});

describe('what the CRA needs to claim the tax back', () => {
  const r = extra => ({ currency: 'CAD', amount: 150, tax: 17.26, ...extra });
  it('asks for the GST/HST number from $100', () => {
    expect(craRecordGaps(r({}))).toEqual([expect.objectContaining({ review: true, text: expect.stringContaining('GST/HST number') })]);
    expect(craRecordGaps(r({ supplierTaxNumber: '123456789 RT0001' }))).toEqual([]);
    expect(craRecordGaps(r({ amount: 99.99 }))).toEqual([]);
  });
  it('adds the $500 details, the name and terms only as a reminder', () => {
    const gaps = craRecordGaps(r({ amount: 600, supplierTaxNumber: '123456789RT0001', description: 'Print run' }));
    expect(gaps).toEqual([expect.objectContaining({ review: false })]);
  });
  it('says nothing when no tax was charged or it is not in dollars', () => {
    expect(craRecordGaps(r({ tax: 0 }))).toEqual([]);
    expect(craRecordGaps(r({ currency: 'USD' }))).toEqual([]);
  });
});

describe('spot checks', () => {
  it('holds about one in fifty, the same ones every time', () => {
    const ids = Array.from({ length: 20000 }, (_, i) => `acct:msg${i}:0`);
    const held = ids.filter(id => isSpotCheck(id)).length;
    expect(held / ids.length).toBeGreaterThan(0.012);
    expect(held / ids.length).toBeLessThan(0.028);
    expect(isSpotCheck('acct:msg7:0')).toBe(isSpotCheck('acct:msg7:0'));
  });
  it('scores the reader from the spot checks someone looked at', () => {
    expect(spotCheckAccuracy([
      { spotCheck: true, reviewed: true }, { spotCheck: true, reviewed: true, editedFields: ['amount'] },
      { spotCheck: true, reviewed: false }, { reviewed: true },
    ])).toEqual({ checked: 2, correct: 1, percent: 50 });
    expect(spotCheckAccuracy([]).percent).toBeNull();
  });
});

describe('the same order in two emails', () => {
  const confirmation = { id: 'a:1:0', messageId: '1', vendor: 'Paper Co', reference: 'PS-1', updatedAt: 1, status: 'draft' };
  const receipt = { id: 'a:2:0', messageId: '2', vendor: 'paper co.', reference: 'ps-1', updatedAt: 2, status: 'draft' };
  it('keeps the earlier one and marks the later as the same order', () => {
    expect(sameOrderElsewhere(receipt, [confirmation, receipt])).toBe(confirmation);
    expect(sameOrderElsewhere(confirmation, [confirmation, receipt])).toBeNull();
  });
  it('never matches without an order number, or once told it is different', () => {
    expect(sameOrderElsewhere({ ...receipt, reference: '' }, [confirmation])).toBeNull();
    expect(sameOrderElsewhere({ ...receipt, notDuplicate: true }, [confirmation])).toBeNull();
  });
});

describe('found receipts use the extra evidence', () => {
  const email = { id: 'm1', account: 'shop@example.com', from: 'Paper Co <orders@paper.co>', date: 'Thu, 20 Nov 2026 10:00:00 -0500', fileParts: [] };
  const raw = { vendor: 'Paper Co', reference: '', date: '2026-11-20', currency: 'CAD', amount: 56.5, subtotal: 50, tax: 6.5, shipping: 0, confidence: 0.95 };

  it('takes a missing order number from the embedded order details and asks for a look', () => {
    const draft = normalizeFoundReceipt(raw, { ...email, markup: { reference: 'PS-1042', amount: 56.5, currency: 'CAD' } });
    expect(draft.reference).toBe('PS-1042');
    expect(draft.filledFromEmail).toContain('reference');
    expect(receiptReviewStatus(draft)).toBe('review');
  });

  it('holds a receipt whose total disagrees with the store’s own order details', () => {
    const draft = normalizeFoundReceipt({ ...raw, reference: 'PS-1042' }, { ...email, id: 'm2', markup: { amount: 65.5, currency: 'CAD' } });
    expect(draft.markupTotal).toBe(65.5);
    expect(receiptReviewStatus(draft)).toBe('review');
    expect(receiptReviewStatus({ ...draft, reviewed: true })).toBe('ready');
  });

  it('remembers “not a duplicate”', () => {
    const draft = { ...normalizeFoundReceipt({ ...raw, reference: 'PS-9' }, { ...email, id: 'm3' }), reviewed: true };
    const saved = [{ ref: 'PS-9', vendor: 'Paper Co', amount: 56.5, currency: 'CAD', date: '2026-11-20' }];
    expect(receiptReviewStatus(draft, saved)).toBe('duplicate');
    expect(receiptReviewStatus({ ...draft, notDuplicate: true }, saved)).toBe('ready');
  });
});

describe('the hourly check, as the app describes it', () => {
  const now = Date.parse('2026-11-27T12:00:00Z');
  it('says it runs every hour and reports the last check', () => {
    expect(describeDailySweep({ enabled: true, every: 'hour', lastRun: '2026-11-27T11:30:00Z', lastResult: 'Read 2 emails, found 1 receipt.' }, now))
      .toBe('Checks Gmail every hour, even with the app closed. Last check: Read 2 emails, found 1 receipt.');
  });
  it('warns when it has stopped running', () => {
    expect(describeDailySweep({ enabled: true, every: 'hour', lastRun: '2026-11-27T05:00:00Z' }, now)).toMatch(/has not run for 7 hours/);
    expect(describeDailySweep({ enabled: true, every: 'hour', lastRun: '2026-11-24T12:00:00Z' }, now)).toMatch(/has not run for 3 days/);
  });
});
