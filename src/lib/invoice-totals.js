// Pure roll-up for the Invoices panel's summary strip.
//
// Invoices carry their own currency. The editor has a currency dropdown, and
// `saveInvoice()` stamps the chosen symbol onto `invoice.currency` (plus the
// ISO code onto `invoice.currencyCode`, for Stripe). The invoice document, the
// Stripe link and the "mark paid" flow all read that stamp — the list card and
// its summary line were the only two places that ignored it and printed the
// BOOK's currency instead. So a US store billed in US$ showed on the list as
// euros, and a book holding both a US$ and a € invoice showed their raw sum
// under a single euro sign: a number that is wrong in both currencies.
//
// Same shape and same rule as `consignmentLedgerTotals()` in lib/consignment.js
// and `expenseLedgerTotals()` in lib/expense-totals.js — bucket each invoice by
// the currency it was actually billed in and total each bucket on its own.
// Nothing is converted here on purpose: an exchange rate belongs to the day the
// money moved, and inventing one at render time would make the summary disagree
// with the totals printed on the invoices themselves.

import { fmt, normalizeCurrencyCode, roundCents } from './money.js';

/**
 * Is this invoice past its due date and still unpaid?
 *
 * Deliberately a predicate rather than a one-way flag. The old inline loop only
 * ever set `_overdue = true`, so recording a payment against a late invoice
 * left the card reading OVERDUE until the next full reload — the publisher had
 * done the right thing and the screen still accused the store.
 *
 * Only a *sent* invoice can be late: a draft has not been billed to anyone yet,
 * and a paid or cancelled one is closed however long it sat.
 *
 * @param {object} invoice
 * @param {string} todayStr  Today as 'YYYY-MM-DD'. ISO dates compare as strings.
 * @returns {boolean}
 */
export function invoiceIsOverdue(invoice, todayStr) {
  if (!invoice || typeof invoice !== 'object') return false;
  if (invoice.status !== 'sent') return false;
  const due = typeof invoice.dueDate === 'string' ? invoice.dueDate : '';
  const ref = typeof todayStr === 'string' ? todayStr : '';
  if (!due || !ref) return false;
  return due < ref;
}

/**
 * Split a book's invoices into one running total per currency.
 *
 * Reports, never recomputes: it reads the `total` already stored on each
 * invoice and files it under that invoice's own currency code. Drafts are
 * counted but carry no money into either bucket — nothing has been billed to
 * anyone yet, so a draft in the outstanding figure would promise income the
 * store has never been asked for.
 *
 * @param {Array<object>} invoices  Any order.
 * @param {string} bookCode         Currency to file invoices that never stamped one.
 * @param {string} todayStr         Today as 'YYYY-MM-DD', for the overdue split.
 * @returns {Array<{code:string, outstanding:number, outstandingCount:number,
 *                  overdue:number, overdueCount:number,
 *                  collected:number, collectedCount:number}>}
 *          The book's own currency first, then the rest alphabetically, so the
 *          strip's order is stable across re-renders.
 */
export function invoiceLedgerTotals(invoices, bookCode, todayStr) {
  const fallback = normalizeCurrencyCode(bookCode, 'EUR');
  const byCurrency = new Map();
  for (const inv of invoices || []) {
    if (!inv || typeof inv !== 'object') continue;
    // Only money that has actually been billed lands in a bucket. A draft or a
    // cancelled invoice is a row on the screen, not a sum anyone is waiting on.
    if (inv.status !== 'sent' && inv.status !== 'paid') continue;
    const amount = Number(inv.total) || 0;
    if (amount <= 0) continue;
    const code = normalizeCurrencyCode(inv.currencyCode || inv.currency, fallback);
    let bucket = byCurrency.get(code);
    if (!bucket) {
      bucket = {
        code,
        outstanding: 0, outstandingCount: 0,
        overdue: 0, overdueCount: 0,
        collected: 0, collectedCount: 0,
      };
      byCurrency.set(code, bucket);
    }
    if (inv.status === 'paid') {
      bucket.collected += amount;
      bucket.collectedCount += 1;
    } else {
      bucket.outstanding += amount;
      bucket.outstandingCount += 1;
      // Overdue is a subset of outstanding, never a third bucket — the money is
      // counted once, and the late share is reported alongside it.
      if (invoiceIsOverdue(inv, todayStr)) {
        bucket.overdue += amount;
        bucket.overdueCount += 1;
      }
    }
  }
  return [...byCurrency.values()]
    .map(b => ({
      ...b,
      // Round the accumulated figure, not each addition, so a long run of
      // invoices can't drift the strip away from the cards above it.
      outstanding: roundCents(b.outstanding),
      overdue: roundCents(b.overdue),
      collected: roundCents(b.collected),
    }))
    .sort((a, b) => {
      if (a.code === fallback) return -1;
      if (b.code === fallback) return 1;
      return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
    });
}

/**
 * The words for one currency bucket.
 *
 * All-clear is worth stating outright rather than as a bare 0.00 — "is any
 * store still sitting on an unpaid invoice?" is the question the strip exists
 * to answer, and a zero does not read as reassurance.
 *
 * @param {object} bucket  One entry from `invoiceLedgerTotals()`.
 * @returns {{label:string, sub:string, status:'overdue'|'outstanding'|'clear',
 *            amount:number, code:string}}
 */
export function invoiceTotalsCopy(bucket) {
  const code = (bucket && bucket.code) || 'EUR';
  const outstanding = Number(bucket && bucket.outstanding) || 0;
  const overdue = Number(bucket && bucket.overdue) || 0;
  const collected = Number(bucket && bucket.collected) || 0;
  const count = Number(bucket && bucket.outstandingCount) || 0;
  const lateCount = Number(bucket && bucket.overdueCount) || 0;
  const collectedNote = collected > 0
    ? `${fmt(collected, code)} collected`
    : 'nothing collected yet';

  if (outstanding > 0) {
    const lateNote = lateCount > 0
      ? `${lateCount} past due (${fmt(overdue, code)})`
      : 'none past due';
    return {
      label: 'Awaiting payment',
      sub: `${count} invoice${count === 1 ? '' : 's'} sent · ${lateNote} · ${collectedNote}`,
      status: lateCount > 0 ? 'overdue' : 'outstanding',
      amount: outstanding,
      code,
    };
  }
  return {
    label: 'All paid',
    sub: `no invoice awaiting payment · ${collectedNote}`,
    status: 'clear',
    amount: 0,
    code,
  };
}

/**
 * The counts that belong to the whole panel rather than to one currency — how
 * many invoices exist at all, how many are still drafts, and how many are late.
 *
 * These stay currency-blind on purpose. "2 past due" is a count of stores to
 * chase, and splitting it by currency would bury the one fact the publisher
 * needs to act on today under a per-currency breakdown they can read below.
 *
 * @param {Array<object>} invoices
 * @param {string} todayStr  Today as 'YYYY-MM-DD'.
 * @returns {{total:number, drafts:number, overdue:number}}
 */
export function invoiceSummaryCounts(invoices, todayStr) {
  let total = 0, drafts = 0, overdue = 0;
  for (const inv of invoices || []) {
    if (!inv || typeof inv !== 'object') continue;
    total += 1;
    if ((inv.status || 'draft') === 'draft') drafts += 1;
    if (invoiceIsOverdue(inv, todayStr)) overdue += 1;
  }
  return { total, drafts, overdue };
}
