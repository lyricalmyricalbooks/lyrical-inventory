// The Stripe fee on each card sale, kept on the sale itself.
//
// WHY THIS EXISTS
// Stripe keeps a fee on every card payment. The yearly fee filing
// (features/stripe-fees.js) already puts those fees in the Tax Centre as one
// business expense per year and currency, and that filing stays the tax
// record. What it can't say is which sale, and so which book, a fee came
// from. Keeping the fee on the sale row answers "what did this book really
// bring in" without counting the fee a second time as an expense.
//
// WHAT IT DOES NOT CHANGE
// An author's share is worked out on the full sale price, before the fee
// (Julian's choice, 2026-11-24). Nothing in artist-settlement.js reads these
// fields, and nothing here should feed them in.
//
// WHERE THE FEE COMES FROM
// The charge's balance transaction (fetched with expand[]=data.balance_transaction).
// Its fee is in the account's settlement currency, which can differ from the
// currency the customer paid in, so the currency is kept with it.

import { isZeroDecimalCurrency } from './invoice-payments.js';
import { roundCents } from './money.js';

/**
 * The fee on a charge, from its expanded balance transaction, or null when
 * Stripe didn't send one (not expanded, still pending, or a bad shape).
 * @param {any} bt
 * @returns {{ fee: number, feeCurrency: string } | null}
 */
export function feeFromBalanceTransaction(bt) {
  if (!bt || typeof bt !== 'object') return null;
  const minor = Number(bt.fee);
  const feeCurrency = String(bt.currency || '').toUpperCase();
  if (!Number.isFinite(minor) || minor < 0 || !/^[A-Z]{3}$/.test(feeCurrency)) return null;
  const fee = isZeroDecimalCurrency(feeCurrency) ? minor : roundCents(minor / 100);
  return { fee, feeCurrency };
}

/**
 * Split one charge's fee across the rows of a sale recorded as several lines
 * (a card-reader payment for two books), in proportion to each line's amount.
 * The last line takes the rounding remainder, so the parts add back to the fee.
 * @param {number} fee
 * @param {number[]} amounts
 * @returns {number[]}
 */
export function splitFee(fee, amounts) {
  const total = amounts.reduce((sum, a) => sum + (Number(a) || 0), 0);
  if (!(fee > 0) || !(total > 0)) return amounts.map(() => 0);
  let given = 0;
  return amounts.map((a, i) => {
    if (i === amounts.length - 1) return roundCents(fee - given);
    const part = roundCents(fee * ((Number(a) || 0) / total));
    given += part;
    return part;
  });
}

/**
 * The payment record for a ledger row with the fee added, or the same object
 * when there is no fee to add.
 * @template {object} P
 * @param {P} payment
 * @param {{ fee?: number, feeCurrency?: string } | null | undefined} source
 * @param {number} [share] this row's part of the fee, when the sale is split
 * @returns {P}
 */
export function withSaleFee(payment, source, share) {
  const raw = share ?? source?.fee;
  const fee = Number(raw);
  if (!payment || raw == null || !source?.feeCurrency || !Number.isFinite(fee) || fee < 0) return payment;
  return { ...payment, fee: roundCents(fee), feeCurrency: source.feeCurrency };
}

/**
 * Fill in the fee on Stripe sales recorded before fees were kept. Changes the
 * rows in place and returns the ids of the books it changed. A row that
 * already has a fee, a voided row and a row from a split sale (whose share
 * can't be told apart from the others here) are left alone.
 * @param {Record<string, { hist?: any[] }>} states
 * @param {Array<{ id: string, fee?: number, feeCurrency?: string }>} payments
 * @returns {string[]}
 */
export function backfillSaleFees(states, payments) {
  const byId = new Map();
  (payments || []).forEach(p => { if (p && p.feeCurrency && p.fee >= 0) byId.set(p.id, p); });
  if (!byId.size) return [];
  const changed = new Set();
  Object.entries(states || {}).forEach(([bookId, s]) => {
    (s?.hist || []).forEach(h => {
      if (!h || h.voided || !h.payment || h.payment.feeCurrency) return;
      const sid = typeof h.sheetsId === 'string' ? h.sheetsId : '';
      const m = /^stripe-(.+?)(-r\d+)?$/.exec(sid);
      if (!m || /-\d+$/.test(m[1])) return;
      const p = byId.get(m[1]);
      if (!p) return;
      h.payment = withSaleFee(h.payment, p);
      changed.add(bookId);
    });
  });
  return [...changed];
}

/**
 * The total fee on a book's live sales, by fee currency.
 * @param {any[]} hist
 * @returns {Record<string, number>}
 */
export function bookFeeTotals(hist) {
  const out = {};
  (hist || []).forEach(h => {
    const pay = h?.payment;
    if (!pay || h.voided || !pay.feeCurrency || !(Number(pay.fee) > 0)) return;
    out[pay.feeCurrency] = roundCents((out[pay.feeCurrency] || 0) + Number(pay.fee));
  });
  return out;
}
