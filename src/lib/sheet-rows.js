/**
 * sheet-rows.js — the Google Sheet rows for a book's money going out: its
 * expenses and its payments to the artist.
 *
 * Until now the sheet carried sales, customer-paid postage and consignment, and
 * nothing else. A book's expenses (printing, freight, ISBNs, fair fees) and what
 * was paid to its artist lived only in the app, so the spreadsheet the publisher
 * keeps as their record of each book could not show what a title cost or what
 * its artist was paid.
 *
 * These rows are not written by hand at each place an expense or payout is
 * changed — there are more than a dozen such places, and the next one added
 * would be missed. Instead the app works out the full list of rows a book
 * should have (`moneyOutSheetRows`), compares it with what it last sent
 * (`diffSheetRows`), and sends only what changed or disappeared. Anything that
 * edits an expense, wherever it lives, reaches the sheet the same way.
 *
 * Pure: no DOM, no storage, no network.
 */
import { cadEquivalentForSale, entryNativeCode, getBookCurrencyCode, normalizeCurrencyCode, roundCents } from './money.js';

export const MONEY_OUT_TYPES = Object.freeze({ EXPENSE: 'expense', PAYOUT: 'payout' });

/**
 * Sheet ids are scoped to the book. An expense moved to another book is then a
 * removal from one tab and an addition to the other, never one id that the
 * sheet could delete from the wrong place.
 */
export function expenseSheetId(bookId, expense) {
  return `exp-${bookId}-${expense.id}`;
}

export function payoutSheetId(bookId, payout) {
  return `payout-${bookId}-${payout.id}`;
}

function hasId(record) {
  return !!record && record.id !== undefined && record.id !== null && String(record.id) !== '';
}

/**
 * One expense as a sheet row. Amount and currency are the expense's own; the
 * CAD figure is the one the app holds (its saved CAD value, or its saved rate),
 * and is left blank when the app has no rate yet — the sheet then fills it the
 * way it does for any other row, rather than this guessing 1:1.
 */
export function expenseRowPayload(book, bookId, e) {
  const currency = normalizeCurrencyCode(e.currency || e.origCurrency || getBookCurrencyCode(book), 'CAD');
  const amount = roundCents(Number(e.amount) || 0);
  let cad = '';
  if (currency === 'CAD') cad = amount;
  else if (Number(e.baseAmount) > 0) cad = roundCents(Number(e.baseAmount));
  else if (Number(e.fxRate) > 0) cad = roundCents(amount * Number(e.fxRate));
  return {
    type: MONEY_OUT_TYPES.EXPENSE,
    book: book.title,
    date: e.date || '',
    num: e.ref || '',
    chan: e.cat || 'Expense',
    qty: '',
    price: '',
    total: amount,
    currency,
    paymentCurrency: currency,
    convertedTotal: cad,
    status: 'OK',
    notes: e.desc || '',
    sheetsId: expenseSheetId(bookId, e),
  };
}

/** One payment to the artist as a sheet row, in the currency it was recorded in. */
export function payoutRowPayload(book, bookId, p) {
  const currency = entryNativeCode(p, book);
  const amount = roundCents(Number(p.amount) || 0);
  return {
    type: MONEY_OUT_TYPES.PAYOUT,
    book: book.title,
    date: p.date || '',
    num: p.sourceNum || '',
    chan: p.method || 'Payment to artist',
    qty: '',
    price: '',
    total: amount,
    currency,
    paymentCurrency: currency,
    convertedTotal: cadEquivalentForSale({ nativeCurrency: currency, totalNative: amount }),
    status: 'OK',
    notes: p.notes || '',
    sheetsId: payoutSheetId(bookId, p),
  };
}

/**
 * Every expense and artist-payout row this book should have on the sheet.
 * Voided records and author submissions still awaiting approval are not part
 * of the book yet (or any more), so they have no row.
 */
export function moneyOutSheetRows(book, bookId, state) {
  if (!book || !state) return [];
  const rows = [];
  // Ids are timestamps, so two records made in the same millisecond can share
  // one. The sheet keeps one row per id, so a repeat gets a suffix rather than
  // silently replacing the first.
  const seen = new Map();
  const add = (row) => {
    const n = (seen.get(row.sheetsId) || 0) + 1;
    seen.set(row.sheetsId, n);
    if (n > 1) row.sheetsId = `${row.sheetsId}~${n}`;
    rows.push(row);
  };
  for (const e of state.expenses || []) {
    if (!hasId(e) || e.voided || e.pendingAuth) continue;
    add(expenseRowPayload(book, bookId, e));
  }
  for (const p of state.artistPayouts || []) {
    if (!hasId(p) || p.voided) continue;
    add(payoutRowPayload(book, bookId, p));
  }
  return rows;
}

/** True for a row built by this module (an expense or an artist payout). */
export function isMoneyOutRow(payload) {
  const type = payload && String(payload.type || '').toLowerCase();
  return type === MONEY_OUT_TYPES.EXPENSE || type === MONEY_OUT_TYPES.PAYOUT;
}

/**
 * A short, stable fingerprint of what a row says. Only the fields that reach a
 * sheet cell take part, in a fixed order, so the same record always gives the
 * same value and any visible change gives a different one.
 */
export function sheetRowFingerprint(payload) {
  const p = payload || {};
  const text = JSON.stringify([
    p.type, p.book, p.date, p.num, p.chan, p.qty, p.price, p.total,
    p.currency, p.convertedTotal, p.status, p.notes,
  ]);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ':' + text.length.toString(36);
}

/**
 * Compare the rows a book should have with the fingerprints of what was last
 * sent for it.
 *
 * Returns the rows that are new or different (`changed`), the ids that were
 * sent before and are no longer in the book (`removed`), and the fingerprint
 * map to remember once those have been queued (`next`).
 */
export function diffSheetRows(previous, rows) {
  const prev = previous && typeof previous === 'object' ? previous : {};
  const next = {};
  const changed = [];
  for (const row of rows || []) {
    if (!row || !row.sheetsId) continue;
    const fp = sheetRowFingerprint(row);
    next[row.sheetsId] = fp;
    if (prev[row.sheetsId] !== fp) changed.push(row);
  }
  const removed = Object.keys(prev).filter(id => !Object.prototype.hasOwnProperty.call(next, id));
  return { changed, removed, next };
}
