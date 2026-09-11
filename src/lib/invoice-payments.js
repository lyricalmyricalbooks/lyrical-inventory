// Deciding whether a Stripe charge settles a consignment invoice.
//
// The app can already ask Stripe what was paid and can already tell which
// invoice a charge names — createStripePaymentLinkForInvoice stamps the invoice
// number into the Payment Link, the PaymentIntent metadata and the intent
// description, and classifyStripePayment reads it back. What was missing was
// anyone willing to act on the answer without a human clicking, and that is a
// decision about money, so it lives here: pure, no network, no DOM, every rule
// visible in one file and testable without touching Stripe.
//
// The rule the publisher chose, carried over from the postage work: an amount is
// read or it is not read, never guessed. A charge belongs to an invoice because
// it names that invoice, not because the figure looks about right. And a charge
// that does not settle the invoice exactly is reported, never rounded into
// agreement — a store that paid short still owes the difference, and an invoice
// marked paid is the app saying it does not.

import { normalizeCurrencyCode, roundCents } from './money.js';

/**
 * Currencies Stripe quotes without decimals, where the "minor unit" IS the
 * major unit — ¥500 is `500`, not `50000`.
 *
 * Exported because main.js held two byte-identical private copies of this set
 * (one for invoice links, one for the fees report) and this module needed a
 * third. Getting it wrong is not a rounding error, it is a factor of a hundred,
 * so there is now one list. https://docs.stripe.com/currencies#zero-decimal
 */
export const STRIPE_ZERO_DECIMAL_CURRENCIES = Object.freeze(new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]));

/** Whether this currency is quoted without decimals. */
export function isZeroDecimalCurrency(code) {
  return STRIPE_ZERO_DECIMAL_CURRENCIES.has(String(code || '').trim().toUpperCase());
}

/**
 * The currency an invoice is denominated in, as an ISO code.
 *
 * `currencyCode` is the stored ISO code; `currency` is a display symbol like
 * '€' or 'CA$'. Returns '' rather than a guess when neither resolves, because
 * comparing money across an unknown currency is worse than declining to.
 */
export function invoiceCurrencyCode(invoice) {
  const raw = invoice?.currencyCode || invoice?.currency || '';
  return normalizeCurrencyCode(raw, '');
}

/**
 * Convert a major-unit money figure to whole minor units.
 *
 * Money is only ever compared as integers here. `24.10 === 24.1` is true but
 * `0.1 + 0.2 === 0.3` is false, and an invoice that settles or does not settle
 * on the strength of a float comparison is a bug waiting for the wrong sum.
 * Returns null for anything not a usable positive amount.
 */
export function toMinorUnits(amountMajor, code) {
  const n = Number(amountMajor);
  if (!Number.isFinite(n) || n <= 0) return null;
  return isZeroDecimalCurrency(code) ? Math.round(n) : Math.round(roundCents(n) * 100);
}

/** An invoice's total, in whole minor units of its own currency. */
export function invoiceTotalMinor(invoice) {
  return toMinorUnits(invoice?.total, invoiceCurrencyCode(invoice));
}

/**
 * A normalized Stripe payment's amount, in whole minor units.
 *
 * fetchStripePaymentsForReconcile hands back MAJOR units (it has already
 * divided by 100 for decimal currencies), so this converts back rather than
 * reading Stripe's raw field.
 */
export function paymentMinor(payment) {
  return toMinorUnits(payment?.amount, payment?.currency);
}

/** The statuses an invoice can still be settled from. */
const OPEN_STATUSES = new Set(['draft', 'sent']);

/** Alert/marker key for one charge. */
export function invoicePaymentRef(chargeId) {
  const id = String(chargeId || '').trim();
  return id ? `stripe-charge:${id}` : '';
}

/** Whether this exact charge has already been recorded against this invoice. */
export function alreadyApplied(invoice, payment) {
  const seen = String(invoice?.stripeChargeId || '').trim();
  const id = String(payment?.id || '').trim();
  return !!seen && !!id && seen === id;
}

/**
 * Does this charge settle this invoice?
 *
 * Exactly one verdict, and the caller does nothing a verdict did not authorise.
 * The order of the checks is the safety property: `reversed` is tested before
 * anything else because money that has been pulled back can never settle
 * anything, whatever else is true of it.
 *
 * Returns `{ verdict, expectedMinor, paidMinor, shortfallMinor, currency }`.
 * `shortfallMinor` is positive when the store still owes and negative when it
 * overpaid, so one number covers both directions.
 */
export function judgeInvoicePayment({ payment, invoice } = {}) {
  const base = { expectedMinor: null, paidMinor: null, shortfallMinor: null, currency: '' };
  if (!payment || !invoice) return { ...base, verdict: 'unreadable' };

  // First, and before anything else: money that came back is not money.
  if (payment.refunded || payment.disputed) {
    return { ...base, verdict: 'reversed', currency: normalizeCurrencyCode(payment.currency, '') };
  }

  if (alreadyApplied(invoice, payment)) return { ...base, verdict: 'already-applied' };
  if (!OPEN_STATUSES.has(String(invoice.status || '').trim())) {
    return { ...base, verdict: 'not-open' };
  }

  const invCur = invoiceCurrencyCode(invoice);
  const payCur = normalizeCurrencyCode(payment.currency, '');
  const expectedMinor = invoiceTotalMinor(invoice);
  const paidMinor = paymentMinor(payment);

  // A blank amount or an unidentifiable currency is not a small problem to be
  // worked around — it is the one case where guessing would put a wrong number
  // in the ledger, so it stops here and gets looked at.
  if (expectedMinor === null || paidMinor === null || !invCur || !payCur) {
    return { ...base, verdict: 'unreadable', expectedMinor, paidMinor, currency: invCur };
  }

  // An invoice written in euros is not settled by a payment in dollars, however
  // close the figures look: nothing here knows that day's rate, and inventing
  // one would silently decide how much the store actually paid.
  if (invCur !== payCur) {
    return { ...base, verdict: 'currency-mismatch', expectedMinor, paidMinor, currency: invCur };
  }

  const shortfallMinor = expectedMinor - paidMinor;
  const verdict = shortfallMinor === 0 ? 'settles' : (shortfallMinor > 0 ? 'short' : 'over');
  return { verdict, expectedMinor, paidMinor, shortfallMinor, currency: invCur };
}

/**
 * Whether this charge has already been noted against the invoice as a payment
 * that did not settle it.
 *
 * A short payment is not settled, so nothing about the invoice's own status
 * changes — which means without a record of having seen it, a background sweep
 * would rediscover it every few minutes and push the same card at the publisher
 * forever, including one she had just dismissed.
 */
export function partPaymentAlreadyNoted(invoice, chargeId) {
  const id = String(chargeId || '').trim();
  if (!id) return false;
  return (invoice?.stripePartPayments || []).some(p => p && p.chargeId === id);
}

/**
 * The record to append when a payment arrives that does not settle the invoice.
 *
 * Kept because the publisher asked for a short payment to be *recorded* and
 * flagged, not merely flagged: the money did arrive, it is hers, and the invoice
 * should be able to say so even though it is not settled.
 */
export function buildPartPaymentNote({ payment, judged, at = Date.now() } = {}) {
  return {
    chargeId: String(payment?.id || ''),
    verdict: judged?.verdict || '',
    amountMinor: judged?.paidMinor ?? null,
    expectedMinor: judged?.expectedMinor ?? null,
    currency: judged?.currency || '',
    at,
  };
}

/** Whether a verdict authorises marking the invoice paid. Only one does. */
export function verdictSettles(verdict) {
  return verdict === 'settles';
}

/**
 * Whether a verdict is worth interrupting the publisher about.
 *
 * `already-applied` and `not-open` are the ordinary steady state — the sweep
 * sees the same settled charges on every poll and must stay silent about them,
 * or the card would reappear every five minutes saying nothing new.
 */
export function verdictNeedsAttention(verdict) {
  return verdict === 'short' || verdict === 'over'
    || verdict === 'currency-mismatch' || verdict === 'unreadable';
}

/** Major-unit figure for display, from whole minor units. */
export function minorToMajor(minor, code) {
  if (!Number.isFinite(Number(minor))) return 0;
  return isZeroDecimalCurrency(code) ? Number(minor) : roundCents(Number(minor) / 100);
}

/**
 * The card copy for a sweep that found something.
 *
 * Leads with what happened by itself, then what still wants a person — the
 * shape the postage sweep's card already uses, so the two read alike.
 */
export function describeInvoicePaymentSweep({ settled = 0, attention = 0, amountLabel = '' } = {}) {
  const invoices = `${settled} invoice${settled === 1 ? '' : 's'}`;
  if (!settled && !attention) return null;

  if (!settled) {
    return {
      title: `${attention} invoice payment${attention === 1 ? '' : 's'} need${attention === 1 ? 's' : ''} a look`,
      detail: 'A payment arrived that does not match what the invoice asks for.',
      needsReview: true,
    };
  }

  // The figure is what she actually wants to know, so it leads the sentence when
  // there is one. Omitted rather than summed across currencies.
  const paid = amountLabel ? `${amountLabel} received.` : 'A store paid.';
  return {
    title: `${invoices} paid`,
    detail: attention > 0
      ? `${paid} ${attention} other payment${attention === 1 ? '' : 's'} ${attention === 1 ? 'needs' : 'need'} a look.`
      : `${paid} Settled, and the sales on ${settled === 1 ? 'it' : 'them'} are marked paid.`,
    needsReview: attention > 0,
  };
}

/**
 * The card copy for a payment that was pulled back after the invoice had
 * already been marked paid.
 *
 * Its own message, and its own tone, because it is the opposite of the good
 * news above and must not be mistaken for it. Deliberately says that nothing
 * was changed: the publisher chose to be told rather than have the app unwind a
 * settlement — reversing one would reopen the store's balance and every sale on
 * the invoice, unattended, on the strength of one API field.
 */
export function describeInvoicePaymentReversal({ invoiceNum = '', storeName = '' } = {}) {
  const who = storeName ? ` from ${storeName}` : '';
  return {
    title: `Payment for ${invoiceNum || 'an invoice'} was reversed`,
    detail: `The money${who} has been refunded or charged back, so it is no longer yours. Nothing was changed here — open the invoice and decide.`,
  };
}
