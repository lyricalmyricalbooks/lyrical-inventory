// Whether a Stripe charge settles a consignment invoice — the money rule, the
// refusals, and the one verdict that is allowed to mark an invoice paid.
import { describe, expect, it } from 'vitest';
import {
  STRIPE_ZERO_DECIMAL_CURRENCIES,
  alreadyApplied,
  buildPartPaymentNote,
  partPaymentAlreadyNoted,
  describeInvoicePaymentReversal,
  describeInvoicePaymentSweep,
  invoiceCurrencyCode,
  invoicePaymentRef,
  invoiceTotalMinor,
  isZeroDecimalCurrency,
  judgeInvoicePayment,
  minorToMajor,
  paymentMinor,
  toMinorUnits,
  verdictNeedsAttention,
  verdictSettles,
} from '../src/lib/invoice-payments.js';

const invoice = (over = {}) => ({
  id: 'inv-1', num: 'INV-2026-222', status: 'sent',
  total: 120.5, currency: 'CA$', currencyCode: 'CAD',
  storeName: 'Riverbend Books', ...over,
});

const payment = (over = {}) => ({
  id: 'ch_1', amount: 120.5, currency: 'CAD',
  description: 'INV-2026-222 — Riverbend Books',
  refunded: false, disputed: false, ...over,
});

describe('money is compared as whole minor units, never as floats', () => {
  it('converts a decimal currency by hundredths', () => {
    expect(toMinorUnits(120.5, 'CAD')).toBe(12050);
    expect(toMinorUnits(0.5, 'EUR')).toBe(50);
  });

  it('leaves a zero-decimal currency alone', () => {
    // ¥500 is 500 minor units, not 50000. Getting this wrong is not a rounding
    // error, it is a factor of a hundred.
    expect(toMinorUnits(500, 'JPY')).toBe(500);
    expect(toMinorUnits(500, 'jpy')).toBe(500);
  });

  it('survives the sums that break naive float maths', () => {
    expect(toMinorUnits(0.1 + 0.2, 'CAD')).toBe(30);
    expect(toMinorUnits(1.005, 'CAD')).toBe(101);
    expect(toMinorUnits(19.99 * 3, 'CAD')).toBe(5997);
  });

  it('refuses a blank, zero, negative or nonsense amount rather than reading it as nothing', () => {
    expect(toMinorUnits(0, 'CAD')).toBeNull();
    expect(toMinorUnits(-5, 'CAD')).toBeNull();
    expect(toMinorUnits('', 'CAD')).toBeNull();
    expect(toMinorUnits(null, 'CAD')).toBeNull();
    expect(toMinorUnits('abc', 'CAD')).toBeNull();
    expect(toMinorUnits(Infinity, 'CAD')).toBeNull();
  });

  it('round-trips back to a figure worth showing someone', () => {
    expect(minorToMajor(12050, 'CAD')).toBe(120.5);
    expect(minorToMajor(500, 'JPY')).toBe(500);
    expect(minorToMajor(null, 'CAD')).toBe(0);
  });

  it('names the zero-decimal currencies once, for everyone', () => {
    // main.js held two byte-identical private copies of this and needed a third.
    expect(isZeroDecimalCurrency('JPY')).toBe(true);
    expect(isZeroDecimalCurrency('CAD')).toBe(false);
    expect(STRIPE_ZERO_DECIMAL_CURRENCIES.has('KRW')).toBe(true);
    expect(STRIPE_ZERO_DECIMAL_CURRENCIES.size).toBe(16);
  });
});

describe('reading an invoice’s own currency', () => {
  it('prefers the stored code', () => {
    expect(invoiceCurrencyCode({ currencyCode: 'EUR', currency: 'CA$' })).toBe('EUR');
  });

  it('falls back to the display symbol', () => {
    expect(invoiceCurrencyCode({ currency: '€' })).toBe('EUR');
    expect(invoiceCurrencyCode({ currency: 'CA$' })).toBe('CAD');
  });

  it('answers blank rather than guessing a default', () => {
    // A wrong currency decides how much the store actually paid, so an
    // unreadable one has to stop the comparison, not pick CAD and continue.
    expect(invoiceCurrencyCode({})).toBe('');
    expect(invoiceCurrencyCode(null)).toBe('');
  });

  it('reads the total in that currency’s minor units', () => {
    expect(invoiceTotalMinor(invoice())).toBe(12050);
    expect(invoiceTotalMinor(invoice({ total: 500, currencyCode: 'JPY' }))).toBe(500);
    expect(invoiceTotalMinor(invoice({ total: 0 }))).toBeNull();
  });

  it('reads a normalized Stripe payment the same way', () => {
    expect(paymentMinor(payment())).toBe(12050);
    expect(paymentMinor(payment({ amount: 500, currency: 'JPY' }))).toBe(500);
    expect(paymentMinor(payment({ amount: 0 }))).toBeNull();
  });
});

describe('the one verdict that settles an invoice', () => {
  it('settles when the figures agree exactly', () => {
    expect(judgeInvoicePayment({ payment: payment(), invoice: invoice() })).toMatchObject({
      verdict: 'settles', expectedMinor: 12050, paidMinor: 12050, shortfallMinor: 0, currency: 'CAD',
    });
    expect(verdictSettles('settles')).toBe(true);
  });

  it('settles a draft invoice too, not only a sent one', () => {
    expect(judgeInvoicePayment({ payment: payment(), invoice: invoice({ status: 'draft' }) }).verdict)
      .toBe('settles');
  });

  it('does not settle one cent short', () => {
    // The whole point of integer comparison. A store that paid short still owes
    // the difference, and an invoice marked paid is the app saying it does not.
    const judged = judgeInvoicePayment({ payment: payment({ amount: 120.49 }), invoice: invoice() });
    expect(judged.verdict).toBe('short');
    expect(judged.shortfallMinor).toBe(1);
  });

  it('does not settle an overpayment either', () => {
    const judged = judgeInvoicePayment({ payment: payment({ amount: 130 }), invoice: invoice() });
    expect(judged.verdict).toBe('over');
    expect(judged.shortfallMinor).toBe(-950);
  });

  it('never settles across a currency, however close the figures look', () => {
    expect(judgeInvoicePayment({
      payment: payment({ currency: 'USD' }), invoice: invoice({ currencyCode: 'CAD' }),
    }).verdict).toBe('currency-mismatch');
  });

  it('never settles money that has been pulled back', () => {
    expect(judgeInvoicePayment({ payment: payment({ refunded: true }), invoice: invoice() }).verdict)
      .toBe('reversed');
    expect(judgeInvoicePayment({ payment: payment({ disputed: true }), invoice: invoice() }).verdict)
      .toBe('reversed');
  });

  it('reports a reversal even for an invoice it already settled', () => {
    // Checked before everything else on purpose: were `already-applied` tested
    // first, a chargeback on a paid invoice would return the silent verdict and
    // the publisher would never hear that the money is gone.
    const paid = invoice({ status: 'paid', stripeChargeId: 'ch_1' });
    expect(judgeInvoicePayment({ payment: payment({ refunded: true }), invoice: paid }).verdict)
      .toBe('reversed');
  });

  it('stays silent about a charge it has already applied', () => {
    const judged = judgeInvoicePayment({
      payment: payment(), invoice: invoice({ status: 'paid', stripeChargeId: 'ch_1' }),
    });
    expect(judged.verdict).toBe('already-applied');
    expect(verdictNeedsAttention('already-applied')).toBe(false);
  });

  it('stays silent about an invoice settled some other way', () => {
    // Marked paid by hand, or by the ledger path, with no charge id. A Stripe
    // charge naming it arrives later; there is nothing left to do and nothing
    // worth saying.
    expect(judgeInvoicePayment({ payment: payment(), invoice: invoice({ status: 'paid' }) }).verdict)
      .toBe('not-open');
    expect(verdictNeedsAttention('not-open')).toBe(false);
  });

  it('refuses to judge what it cannot read', () => {
    expect(judgeInvoicePayment({ payment: payment(), invoice: invoice({ total: 0 }) }).verdict)
      .toBe('unreadable');
    expect(judgeInvoicePayment({
      payment: payment(), invoice: invoice({ currency: '', currencyCode: '' }),
    }).verdict).toBe('unreadable');
    expect(judgeInvoicePayment({ payment: null, invoice: invoice() }).verdict).toBe('unreadable');
    expect(judgeInvoicePayment({}).verdict).toBe('unreadable');
  });

  it('handles a zero-decimal invoice end to end', () => {
    expect(judgeInvoicePayment({
      payment: payment({ amount: 500, currency: 'JPY' }),
      invoice: invoice({ total: 500, currency: '¥', currencyCode: 'JPY' }),
    }).verdict).toBe('settles');
  });

  it('flags exactly the verdicts a person needs to see', () => {
    expect(['short', 'over', 'currency-mismatch', 'unreadable'].every(verdictNeedsAttention)).toBe(true);
    expect(['settles', 'reversed', 'already-applied', 'not-open'].some(verdictNeedsAttention)).toBe(false);
    // `settles` and `reversed` are announced on their own terms, not as "needs a look".
    expect(verdictSettles('short')).toBe(false);
  });
});

describe('knowing a charge has already been counted', () => {
  it('matches on the stamped charge id', () => {
    expect(alreadyApplied({ stripeChargeId: 'ch_1' }, { id: 'ch_1' })).toBe(true);
    expect(alreadyApplied({ stripeChargeId: 'ch_1' }, { id: 'ch_2' })).toBe(false);
  });

  it('treats a blank on either side as "not counted yet"', () => {
    // The invoice-side stamp is what survives a new device, where the browser's
    // own memory of handled charges is empty.
    expect(alreadyApplied({}, { id: 'ch_1' })).toBe(false);
    expect(alreadyApplied({ stripeChargeId: 'ch_1' }, {})).toBe(false);
    expect(alreadyApplied(null, null)).toBe(false);
  });

  it('keys a charge for the alert stack', () => {
    expect(invoicePaymentRef('ch_1')).toBe('stripe-charge:ch_1');
    expect(invoicePaymentRef('')).toBe('');
  });
});

describe('remembering a payment that did not settle the invoice', () => {
  const judged = { verdict: 'short', paidMinor: 10000, expectedMinor: 12050, currency: 'CAD' };

  it('notes the charge so the same card is not raised twice', () => {
    // A short payment leaves the invoice's status untouched, so without this the
    // next poll rediscovers it and re-raises a card the publisher just dismissed.
    const note = buildPartPaymentNote({ payment: payment({ amount: 100 }), judged, at: 42 });
    const inv = invoice({ stripePartPayments: [note] });

    expect(partPaymentAlreadyNoted(inv, 'ch_1')).toBe(true);
    expect(partPaymentAlreadyNoted(inv, 'ch_2')).toBe(false);
  });

  it('keeps what arrived and what was owed, not just that something happened', () => {
    expect(buildPartPaymentNote({ payment: payment({ amount: 100 }), judged, at: 42 })).toEqual({
      chargeId: 'ch_1', verdict: 'short', amountMinor: 10000,
      expectedMinor: 12050, currency: 'CAD', at: 42,
    });
  });

  it('treats an invoice with no notes, or a blank charge, as unseen', () => {
    expect(partPaymentAlreadyNoted(invoice(), 'ch_1')).toBe(false);
    expect(partPaymentAlreadyNoted(invoice({ stripePartPayments: [] }), 'ch_1')).toBe(false);
    expect(partPaymentAlreadyNoted(invoice({ stripePartPayments: [null] }), 'ch_1')).toBe(false);
    expect(partPaymentAlreadyNoted(null, 'ch_1')).toBe(false);
    expect(partPaymentAlreadyNoted(invoice(), '')).toBe(false);
  });

  it('survives being handed nothing at all', () => {
    expect(buildPartPaymentNote()).toMatchObject({ chargeId: '', verdict: '', amountMinor: null });
  });
});

describe('what the publisher is told', () => {
  it('leads with what settled by itself', () => {
    expect(describeInvoicePaymentSweep({ settled: 1 })).toMatchObject({
      title: '1 invoice paid', needsReview: false,
    });
    expect(describeInvoicePaymentSweep({ settled: 3 }).title).toBe('3 invoices paid');
  });

  it('mentions what still wants a person', () => {
    const said = describeInvoicePaymentSweep({ settled: 2, attention: 1 });
    expect(said.title).toBe('2 invoices paid');
    expect(said.detail).toContain('1 other payment needs a look');
    expect(said.needsReview).toBe(true);
  });

  it('speaks up when nothing settled but something arrived', () => {
    const said = describeInvoicePaymentSweep({ settled: 0, attention: 2 });
    expect(said.title).toBe('2 invoice payments need a look');
    expect(said.needsReview).toBe(true);
  });

  it('says nothing at all when nothing happened', () => {
    // The steady state, every five minutes, forever.
    expect(describeInvoicePaymentSweep({})).toBeNull();
    expect(describeInvoicePaymentSweep({ settled: 0, attention: 0 })).toBeNull();
  });

  it('gives a reversal its own words, and says nothing was changed', () => {
    const said = describeInvoicePaymentReversal({ invoiceNum: 'INV-2026-222', storeName: 'Riverbend Books' });
    expect(said.title).toContain('INV-2026-222');
    expect(said.title).toContain('reversed');
    expect(said.detail).toContain('Riverbend Books');
    expect(said.detail).toContain('Nothing was changed');
  });

  it('still reads sensibly with nothing to name', () => {
    const said = describeInvoicePaymentReversal({});
    expect(said.title).toBe('Payment for an invoice was reversed');
    expect(said.detail).not.toContain('undefined');
  });
});
