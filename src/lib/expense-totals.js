// Pure totals for the expense ledger's footer.
//
// The footer used to add every unreimbursed expense into a single number and
// print it in the BOOK's currency. Two things went wrong with that. A book
// priced in EUR with receipts logged in CAD showed a euro sign over a figure
// that was never euros, and a ledger holding both CAD and USD receipts showed
// their raw sum — a number that is wrong in both currencies. The expense form
// offers six currencies and defaults to CAD regardless of what the book is
// priced in, so a mixed ledger is the normal case here, not the edge one.
//
// Same shape and same rule as `consignmentLedgerTotals()` in lib/consignment.js:
// bucket each row by the currency it was actually recorded in and total each
// bucket on its own. Nothing is converted here on purpose — an exchange rate
// belongs to the day the money moved, and inventing one at render time would
// make the footer disagree with the per-row "Amount (CAD)" column beside it,
// which reads the rate stamped on each expense.

import { fmt, normalizeCurrencyCode, roundCents } from './money.js';
import { isGratuityExpense } from './receipt-storage.js';

/**
 * Split an expense ledger into one running total per currency.
 *
 * Reports, never recomputes: it reads the amount already stored on each row and
 * files it under that row's own currency code. Two kinds of row are left out
 * entirely, matching what the "Outstanding" figure has always excluded:
 *
 * - **Gratuity copies** — the publisher's own cost for gifted copies. Never
 *   reimbursed to anyone, so they belong to no reimbursement total.
 * - **Author submissions awaiting approval** (`pendingAuth`) — not in the
 *   ledger yet, so counting them would promise money against a row the
 *   publisher has not accepted.
 *
 * @param {Array<object>} expenses  Ledger rows, newest-first or any order.
 * @param {string} bookCode         Currency to file rows that never stamped one.
 * @returns {Array<{code:string, outstanding:number, outstandingCount:number,
 *                  settled:number, settledCount:number}>}
 *          The book's own currency first, then the rest alphabetically, so the
 *          footer's row order is stable across re-renders.
 */
export function expenseLedgerTotals(expenses, bookCode) {
  const fallback = normalizeCurrencyCode(bookCode, 'CAD');
  const byCurrency = new Map();
  for (const e of expenses || []) {
    if (!e || typeof e !== 'object') continue;
    if (e.pendingAuth || isGratuityExpense(e)) continue;
    const amount = Number(e.amount) || 0;
    if (amount <= 0) continue;
    const code = normalizeCurrencyCode(e.currency, fallback);
    let bucket = byCurrency.get(code);
    if (!bucket) {
      bucket = { code, outstanding: 0, outstandingCount: 0, settled: 0, settledCount: 0 };
      byCurrency.set(code, bucket);
    }
    if (e.received) { bucket.settled += amount; bucket.settledCount += 1; }
    else { bucket.outstanding += amount; bucket.outstandingCount += 1; }
  }
  return [...byCurrency.values()]
    .map(b => ({
      ...b,
      // Round the accumulated figure, not each addition: a hundred receipts of
      // 0.1 must not drift the footer away from the column above it.
      outstanding: roundCents(b.outstanding),
      settled: roundCents(b.settled),
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
 * All-clear is worth stating outright rather than as a bare 0.00 — "is anyone
 * still waiting to be paid back?" is the question the footer exists to answer,
 * and a zero does not read as reassurance.
 *
 * @param {object} bucket  One entry from `expenseLedgerTotals()`.
 * @returns {{label:string, sub:string, status:'outstanding'|'clear', amount:number, code:string}}
 */
export function expenseTotalsCopy(bucket) {
  const code = (bucket && bucket.code) || 'CAD';
  const outstanding = Number(bucket && bucket.outstanding) || 0;
  const settled = Number(bucket && bucket.settled) || 0;
  const count = Number(bucket && bucket.outstandingCount) || 0;
  const settledNote = settled > 0
    ? `${fmt(settled, code)} already reimbursed`
    : 'nothing reimbursed yet';
  if (outstanding > 0) {
    return {
      label: 'Outstanding',
      sub: `${count} expense${count === 1 ? '' : 's'} not reimbursed · ${settledNote}`,
      status: 'outstanding',
      amount: outstanding,
      code,
    };
  }
  return {
    label: 'All reimbursed',
    sub: `nothing outstanding · ${settledNote}`,
    status: 'clear',
    amount: 0,
    code,
  };
}
