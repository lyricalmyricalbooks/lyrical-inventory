// Consignment sales and payments in a currency other than the book's.
//
// A shop abroad reports what it sold in its own money (a Rome shop sells at
// €20), and pays out in whatever its bank sends — sometimes euros, sometimes
// the book's own currency, sometimes something else. The ledger keeps ONE
// figure per sale in the book's currency (`amountDue`), because every total,
// the store's owed balance and the Tax Center all add those up. The foreign
// side is kept beside it, untouched, so the row still says what the shop
// actually charged and what actually landed:
//
//   e.sale    = { currency, unitPrice, gross, due, rate }   what the shop sold at
//   e.payment = { currency, amount, rate, convertedTotal,   what was received
//                 date, difference }
//
// `rate` is always "1 foreign unit = rate book units". `convertedTotal` and
// `difference` are in the book's currency (so a currency change restates them);
// `amount`/`unitPrice`/`gross`/`due` are the foreign cash and never move.

import { normalizeCurrencyCode, roundCents } from './money.js';

const positive = v => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * What a consignment sale is worth to the publisher, in the book's currency.
 * Returns null when the price is foreign and there's no usable rate yet.
 *
 * @param {{qty:number, unitPrice:number, commission:number, saleCur?:string,
 *          bookCur:string, fxRate?:number}} args
 * @returns {{gross:number, due:number, sale:object|null}|null}
 */
export function consignmentSaleAmounts({ qty, unitPrice, commission, saleCur, bookCur, fxRate }) {
  const book = normalizeCurrencyCode(bookCur, 'CAD');
  const cur = normalizeCurrencyCode(saleCur || book, book);
  const units = Number(qty) || 0;
  const price = Number(unitPrice) || 0;
  const keep = 1 - (Number(commission) || 0) / 100;
  const foreignGross = roundCents(units * price);
  const foreignDue = roundCents(foreignGross * keep);
  if (cur === book) return { gross: foreignGross, due: foreignDue, sale: null };
  const rate = positive(fxRate);
  if (!rate) return null;
  return {
    gross: roundCents(foreignGross * rate),
    due: roundCents(foreignDue * rate),
    sale: { currency: cur, unitPrice: price, gross: foreignGross, due: foreignDue, rate },
  };
}

/**
 * The amount and currency a payment for this sale is expected in: the shop's
 * own currency when the sale was recorded in one, otherwise the book's.
 */
export function expectedConsignmentPayment(entry, bookCur) {
  const book = normalizeCurrencyCode(bookCur, 'CAD');
  const sale = entry && entry.sale;
  if (sale && sale.currency && positive(sale.due)) {
    return { currency: normalizeCurrencyCode(sale.currency, book), amount: roundCents(sale.due) };
  }
  return { currency: book, amount: roundCents(Number(entry && entry.amountDue) || 0) };
}

/**
 * The payment record for a settled consignment sale. Returns null when the
 * payment is foreign and no rate has been given.
 * `difference` is received − due, in the book's currency: negative when the
 * exchange rate (or a bank fee) left less than the ledger expected.
 */
export function consignmentPaymentRecord({ amountDue, bookCur, payCur, payAmount, fxRate, date }) {
  const book = normalizeCurrencyCode(bookCur, 'CAD');
  const cur = normalizeCurrencyCode(payCur || book, book);
  const amount = roundCents(Number(payAmount) || 0);
  const rate = cur === book ? 1 : positive(fxRate);
  if (!rate) return null;
  const convertedTotal = roundCents(amount * rate);
  return {
    currency: cur,
    amount,
    rate: cur === book ? null : rate,
    convertedTotal,
    date: date || '',
    difference: roundCents(convertedTotal - (Number(amountDue) || 0)),
  };
}

/**
 * One line for the ledger row: what the shop sold at, and what came in.
 * Rates are derived from the stored book-currency figures rather than read
 * from `rate`, so the line stays true after the book's currency is changed
 * (which restates `amountDue`/`convertedTotal` but not the foreign cash).
 */
export function consignmentFxSummary(entry, bookCur) {
  const book = normalizeCurrencyCode(bookCur, 'CAD');
  const parts = [];
  const sale = entry && entry.sale;
  const r4 = n => Number(n).toFixed(4);
  if (sale && sale.currency && sale.currency !== book) {
    const rate = positive(sale.due) ? (Number(entry.amountDue) || 0) / sale.due : positive(sale.rate);
    parts.push(`Sold at ${sale.currency} ${Number(sale.unitPrice || 0).toFixed(2)}${rate ? ` @ ${r4(rate)}` : ''}`);
  }
  const p = entry && entry.payment;
  const diff = Number(p && p.difference) || 0;
  if (p && p.currency && p.currency !== book) {
    const rate = positive(p.amount) ? (Number(p.convertedTotal) || 0) / p.amount : positive(p.rate);
    parts.push(`Paid ${p.currency} ${Number(p.amount || 0).toFixed(2)}${rate ? ` @ ${r4(rate)}` : ''} → ${book} ${Number(p.convertedTotal || 0).toFixed(2)}`);
  } else if (p && p.currency && Math.abs(diff) >= 0.01) {
    parts.push(`Paid ${book} ${Number(p.amount || 0).toFixed(2)}`);
  }
  if (p && Math.abs(diff) >= 0.01) {
    parts.push(`${diff < 0 ? 'short' : 'over'} ${book} ${Math.abs(diff).toFixed(2)}`);
  }
  return parts.join(' · ');
}

/**
 * Shares one payment (an invoice paid in full) across the sales it settles,
 * in proportion to what each sale was owed, so every ledger row says what it
 * received. The cash and book-currency figures are split separately and the
 * last row takes the rounding remainder, so the shares add up to the payment
 * exactly. Returns one record per row, in order.
 *
 * @param {object} payment  a consignmentPaymentRecord()
 * @param {Array<{amountDue:number}>} rows
 */
export function splitConsignmentPayment(payment, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!payment || !list.length) return [];
  const dues = list.map(r => roundCents(Number(r && r.amountDue) || 0));
  const totalDue = roundCents(dues.reduce((a, d) => a + d, 0));
  const share = (whole, i, soFar) => {
    if (i === list.length - 1) return roundCents(whole - soFar);
    return totalDue > 0 ? roundCents(whole * dues[i] / totalDue) : (i === 0 ? roundCents(whole) : 0);
  };
  let amountSoFar = 0, convertedSoFar = 0;
  return list.map((_, i) => {
    const amount = share(payment.amount, i, amountSoFar);
    const convertedTotal = share(payment.convertedTotal, i, convertedSoFar);
    amountSoFar = roundCents(amountSoFar + amount);
    convertedSoFar = roundCents(convertedSoFar + convertedTotal);
    return {
      currency: payment.currency,
      amount,
      rate: payment.rate,
      convertedTotal,
      date: payment.date || '',
      difference: roundCents(convertedTotal - dues[i]),
    };
  });
}

/**
 * The currency a store's sales are recorded in by default: the one it was
 * last given (or set on the store), else the book's.
 */
export function storeSaleCurrency(store, bookCur, allowed) {
  const book = normalizeCurrencyCode(bookCur, 'CAD');
  const code = store && store.currency ? normalizeCurrencyCode(store.currency, '') : '';
  if (!code) return book;
  if (Array.isArray(allowed) && !allowed.includes(code) && code !== book) return book;
  return code;
}
