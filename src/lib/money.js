// Pure helpers for currency formatting and payment math.
// Kept dependency-free so they can be imported anywhere and unit-tested
// without a DOM or Firestore stub.

import { halfUpCents } from './cents.js';

/** @typedef {import('../types/ledger').NumberLike} NumberLike */
/** @typedef {import('../types/ledger').Payment} Payment */
/** @typedef {import('../types/ledger').Book} Book */
/** @typedef {import('../types/ledger').HistRow} HistRow */

export const CURRENCY_SYMBOL_TO_CODE = {
  '€': 'EUR',
  '$': 'CAD',
  'CA$': 'CAD',
  'US$': 'USD',
  '£': 'GBP',
  '¥': 'JPY',
  CHF: 'CHF',
  // Mexican peso. Mexico writes the peso as a bare "$", which collides with the
  // Canadian default above, so only the disambiguated forms map here — a bare
  // "$" on a Mexican receipt still needs the code typed explicitly.
  'MX$': 'MXN',
  'MEX$': 'MXN',
  '$MXN': 'MXN',
};

export const CODE_TO_SYMBOL = {
  EUR: '€',
  CAD: 'CA$',
  USD: 'US$',
  GBP: '£',
  JPY: '¥',
  CHF: 'CHF',
  AUD: 'A$',
  MXN: 'MX$',
};

export const getSym = (c) => CODE_TO_SYMBOL[c] || c;

/** @param {unknown} cur @param {string} [fallback] @returns {string} */
export function normalizeCurrencyCode(cur, fallback = 'CAD') {
  const raw = String(cur || '').trim();
  if (!raw) return fallback;
  const upper = raw.toUpperCase();
  if (CODE_TO_SYMBOL[upper]) return upper;
  if (CURRENCY_SYMBOL_TO_CODE[raw]) return CURRENCY_SYMBOL_TO_CODE[raw];
  if (upper === 'CA$' || upper === 'C$') return 'CAD';
  if (upper === 'US$') return 'USD';
  if (upper === 'MX$' || upper === 'MEX$' || upper === '$MXN') return 'MXN';
  if (upper === '€' || upper === 'EUR') return 'EUR';
  return /^[A-Z]{3}$/.test(upper) ? upper : fallback;
}

// A negative amount reads "-CA$138.69", sign first like fmtWhole; it used to
// print "CA$-138.69". An amount that rounds to zero never shows a minus.
// Every caller passes a currency. The '€' default is only reached when that
// value is undefined, in practice a legacy book saved without one, which
// getBookCurrencyCode() also reads as EUR; keep the two agreeing.
/** @param {NumberLike} n @param {string} [cur] @returns {string} */
export const fmt = (n, cur = '€') => {
  const fixed = Number(n).toFixed(2);
  const negative = fixed.startsWith('-') && Number(fixed) !== 0;
  const digits = fixed.replace(/^-/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '-' : '') + getSym(cur) + digits;
};

/** @param {NumberLike} n @param {string} [cur] @returns {string} */
export const fmtWhole = (n, cur = '€') => {
  const num = Math.round(Number(n) || 0);
  const formatted = Math.abs(num).toLocaleString('en-US');
  const sym = getSym(cur);
  return num < 0 ? `-${sym}${formatted}` : `${sym}${formatted}`;
};

// Money as "CAD 12.50": the currency code, a space, two decimals and no
// thousands separator. The receipt screens print a figure this way so a
// foreign receipt's currency can't be mistaken for the ledger's. A missing
// currency reads as `fallback`; anything that isn't a number reads as 0.00.
/** @param {NumberLike} n @param {string} [cur] @param {string} [fallback] @returns {string} */
export const fmtCode = (n, cur, fallback = 'CAD') =>
  `${String(cur || fallback).toUpperCase()} ${(Number(n) || 0).toFixed(2)}`;

/** @param {NumberLike} n @returns {string} */
export const fmtNum = (n) => Number(n).toFixed(2);

// Round a currency amount to whole cents, killing binary floating-point drift
// (e.g. 0.1 + 0.2 = 0.30000000000000004). Use this around any running total of
// money so accumulated error can't grow as the number of transactions grows.
// A half cent rounds away from zero (src/lib/cents.js).
/** @param {NumberLike} n @returns {number} */
export const roundCents = (n) => {
  const x = Number(n);
  return Number.isFinite(x) ? halfUpCents(x) / 100 : x;
};

// The table date ("4 Mar 2025") now lives with the other date helpers; it is
// re-exported here because most screens import it alongside fmt().
export { fmtD } from './dates.js';

/** @param {Book | null | undefined} book @returns {string} */
export function getBookCurrencyCode(book) {
  const c = (book && book.currency) || 'EUR';
  return CURRENCY_SYMBOL_TO_CODE[c] || (String(c).length === 3 ? c : 'EUR');
}

// The only currencies offered in pickers. Older records may carry others
// (GBP, AUD…); setSelectCurrency() keeps those editable without offering them
// for new entries.
export const PICKER_CURRENCIES = ['CAD', 'EUR', 'USD', 'MXN'];

// Moves `code` to the front of a currency <select>, leaving any leading
// non-currency choice (e.g. "Book currency") on top. Does not change the value.
export function putCurrencyFirst(sel, code) {
  if (!sel || !code) return;
  const opts = Array.from(sel.options);
  const first = opts.find((o) => o.value === code);
  if (!first) return;
  const anchor = opts.find((o) => !PICKER_CURRENCIES.includes(o.value));
  if (anchor) anchor.after(first); else sel.prepend(first);
}

// Selects `code`, appending a one-off option when it is a legacy currency the
// picker no longer lists, so editing an old record doesn't blank the field.
export function setSelectCurrency(sel, code) {
  if (!sel) return;
  if (code && !Array.from(sel.options).some((o) => o.value === code)) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = code;
    sel.appendChild(opt);
  }
  sel.value = code;
}

// The currency an entry's own amounts (price, convertedTotal, amountDue…) are
// denominated in. Prefers the `cur` stamp written at entry time; falls back to
// the book's current currency for legacy rows recorded before stamping existed.
// That fallback is precisely what breaks when a book's currency is edited, so
// anything relying on it should be restated via lib/currency-migration.js.
/** @param {{ cur?: string } | null | undefined} entry @param {Book | null | undefined} book @returns {string} */
export function entryNativeCode(entry, book) {
  if (entry && entry.cur) return normalizeCurrencyCode(entry.cur, 'CAD');
  return getBookCurrencyCode(book);
}

// `payment.convertedTotal` is denominated in the entry's OWN native currency —
// frozen at the moment of sale — not in whatever the book's currency says
// today. Reading it against the book's current currency is what turns a €32
// sale into the nonsense line "Paid EUR 32.00 → CA$32.00" after a currency
// change, so resolve the symbol from the entry's stamp when it has one.
/** @param {Payment | null | undefined} payment @param {Book | null | undefined} book @param {{ cur?: string } | null} [entry] @returns {string} */
export function paymentSummary(payment, book, entry = null) {
  if (!payment || !payment.currency) return '';
  const native = entryNativeCode(entry, book);
  const amount = Number(payment.amount || 0);
  const converted = Number(payment.convertedTotal || 0);
  if (normalizeCurrencyCode(payment.currency, '') === native) {
    return `Paid ${payment.currency} ${fmtNum(amount)}`;
  }
  // Rates arrive from FX APIs at full float precision; 4dp is the most anyone
  // quotes and keeps the note from running to 16 digits.
  const ratePart = payment.rate ? ` @ ${Number(payment.rate).toFixed(4)}` : '';
  return `Paid ${payment.currency} ${fmtNum(amount)}${ratePart} → ${fmt(converted, native)}`;
}

/**
 * @param {{ book: Book | null | undefined, qty: NumberLike, unitPrice: NumberLike, fxEnabled?: boolean,
 *   fxCur?: string, fxAmt?: NumberLike, fxRate?: NumberLike }} sale
 * @returns {{ currency: string, amount: number, rate: number | null, convertedTotal: number }}
 */
export function buildPaymentMeta({ book, qty, unitPrice, fxEnabled, fxCur, fxAmt, fxRate }) {
  const total = (Number(qty) || 0) * (Number(unitPrice) || 0);
  if (fxEnabled) {
    return {
      currency: fxCur || 'EUR',
      amount: Number(fxAmt) || 0,
      rate: (Number(fxRate) || 0) > 0 ? Number(fxRate) : null,
      convertedTotal: total,
    };
  }
  return {
    currency: getBookCurrencyCode(book),
    amount: total,
    rate: null,
    convertedTotal: total,
  };
}

// The CAD value to record on a Sheets row for a sale, mirroring how the app
// captures revenue at the moment of sale (a frozen figure that must not drift
// as FX rates move later):
//   • book sells in CAD             → the native total IS the CAD value
//   • non-CAD book, paid in CAD     → the CAD cash collected is the value
//   • anything else                 → '' (blank); the Sheets backend fills it
//     from the stored converted total or a live FX lookup.
// Returns a Number, or '' when the CAD value can't be determined client-side.
/**
 * @param {{ nativeCurrency?: string, totalNative?: import('../types/ledger').NumberLike,
 *   payment?: import('../types/ledger').Payment | null }} [sale]
 * @returns {number | ''}
 */
export function cadEquivalentForSale({ nativeCurrency, totalNative, payment } = {}) {
  const native = normalizeCurrencyCode(nativeCurrency, 'CAD');
  const total = Number(totalNative) || 0;
  if (native === 'CAD') return total;
  if (payment && normalizeCurrencyCode(payment.currency, '') === 'CAD' && Number(payment.amount)) {
    return Number(payment.amount);
  }
  return '';
}

// The label stored on a sale when the artist collected the payment directly
// (rather than it flowing to the publisher). Kept as a single source of truth
// so detection doesn't rely on string literals scattered across the codebase.
export const PAYMENT_TYPE_DIRECT_TO_ARTIST = 'Payment directly to artist';

// True when a sale entry/payload represents cash the artist collected directly
// and still owes the publisher their cut. Prefers the structured `directToArtist`
// flag; falls back to the legacy paymentType / payment.type / notes text so
// records created before the flag existed are still recognised.
/** @param {HistRow | null | undefined} entry @returns {boolean} */
export function isDirectToArtistSale(entry) {
  if (!entry) return false;
  if (entry.directToArtist === true) return true;
  if (entry.paymentType === PAYMENT_TYPE_DIRECT_TO_ARTIST) return true;
  if (entry.payment && entry.payment.type === PAYMENT_TYPE_DIRECT_TO_ARTIST) return true;
  return (entry.notes || '').includes(PAYMENT_TYPE_DIRECT_TO_ARTIST);
}

// Amount of a direct-to-artist transfer, or null when the record doesn't carry
// one it can be trusted for (missing/garbled total AND no usable qty × price).
// Callers show "amount missing" instead of summing NaN into a banner or ledger.
/** @param {{ total?: NumberLike | null, qty?: NumberLike | null, price?: NumberLike | null } | null | undefined} t @returns {number | null} */
export function transferAmount(t) {
  if (!t) return null;
  const total = Number(t.total);
  if (t.total !== '' && t.total != null && Number.isFinite(total)) return total;
  const qty = Number(t.qty), price = Number(t.price);
  if (t.qty != null && t.price != null && Number.isFinite(qty) && Number.isFinite(price)) return qty * price;
  return null;
}

// The held (artistPending) sale a transfer stands for. A transfer shares its
// sale's sheetsId, so match on that; an order number can repeat (two held
// sales under one number), and matching on it alone settled the wrong row.
// Falls back to the number only for a legacy transfer with no id.
export function heldSaleForTransfer(hist, t) {
  if (!Array.isArray(hist) || !t) return undefined;
  if (t.sheetsId) return hist.find(x => x.artistPending && x.sheetsId === t.sheetsId);
  return hist.find(x => x.artistPending && x.num === t.num);
}

// The other direction: which queued transfer belongs to this held sale, as an
// index into `transfers` (-1 when none). The sale's own sheet id wins; the
// number-and-copies match is only a fallback for a transfer saved without an
// id, so an older transfer that happens to share the order number and count
// is never pulled in place of the sale's own.
export function heldTransferIndexForSale(transfers, h) {
  if (!Array.isArray(transfers) || !h) return -1;
  if (h.sheetsId) {
    const exact = transfers.findIndex(x => x && x.sheetsId === h.sheetsId);
    if (exact !== -1) return exact;
    return transfers.findIndex(x => x && !x.sheetsId && x.num === h.num && x.qty === h.qty);
  }
  return transfers.findIndex(x => x && x.num === h.num && x.qty === h.qty);
}

// Copies line for a transfer: "3×", or '' when the count wasn't recorded.
export function transferQtyLabel(t) {
  const qty = Number(t && t.qty);
  return t && t.qty != null && t.qty !== '' && Number.isFinite(qty) ? `${qty}×` : '';
}
