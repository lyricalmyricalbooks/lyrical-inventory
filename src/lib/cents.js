// Money arithmetic in whole cents.
//
// Amounts are stored as decimal numbers (24.99), and sometimes as text from a
// form or a Sheet ("24.99"). Adding decimals drifts (0.1 + 0.2 is
// 0.30000000000000004), and adding text joins it (0 + "24.99" is "024.99").
// These helpers turn each amount into an integer number of cents first, add
// integers, and hand back an ordinary decimal, so callers and saved data keep
// the shape they have today.
//
// Each amount is rounded to the cent before it is added, the way a ledger
// adds receipts. An amount that never had a sub-cent part (every price,
// payment and expense typed in) adds up exactly; for those, sumMoney equals
// roundCents of the plain sum.
//
// Not a stored format: nothing here changes what is saved. Storing cents is a
// separate, later change.

/** @typedef {import('../types/ledger').NumberLike} NumberLike */

/**
 * Whole cents in an amount. Text is read as a number; anything that isn't one
 * counts as 0. fromCents(toCents(x)) === roundCents(x).
 * @param {NumberLike | null | undefined} amount
 * @returns {number}
 */
export function toCents(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return halfUpCents(n);
}

/**
 * Whole cents in a finite number, a half cent rounded away from zero, the way
 * a till or a tax form rounds. A decimal like 2.135 (5% GST on 42.70) is held
 * by the computer as 2.13499999…, and nudging it by a tiny constant only
 * helped amounts under about 8, so tax on a bigger sale lost its half cent.
 * Reading the amount at 12 significant digits first gives back the figure as
 * written. Refunds and other negative amounts round the same way as positive
 * ones (−2.675 is −2.68, not −2.67).
 * @param {number} n
 * @returns {number}
 */
export function halfUpCents(n) {
  const a = Math.abs(n);
  if (a < 1e-9) return 0;
  if (a >= 1e13) return Math.round(n * 100);
  const s = String(Number(a.toPrecision(12)));
  const cents = Math.round(s.includes('e') ? Number(s) * 100 : Number(`${s}e2`));
  return n < 0 && cents ? -cents : cents;
}

/** @param {number} cents @returns {number} */
export function fromCents(cents) {
  return cents / 100;
}

/**
 * Total of a list of amounts, or of one field of a list of records.
 *   sumMoney([0.1, 0.2])                 → 0.3
 *   sumMoney(expenses, e => e.amount)    → total of the expenses
 * @template T
 * @param {Iterable<T>} items
 * @param {(item: T) => NumberLike | null | undefined} [pick]
 * @returns {number}
 */
export function sumMoney(items, pick) {
  let cents = 0;
  for (const item of items || []) cents += toCents(pick ? pick(item) : /** @type {any} */ (item));
  return fromCents(cents);
}

/**
 * Copies × unit price, to the cent. Text counts work too.
 * @param {NumberLike | null | undefined} qty
 * @param {NumberLike | null | undefined} unitPrice
 * @returns {number}
 */
export function lineTotal(qty, unitPrice) {
  return fromCents(toCents((Number(qty) || 0) * (Number(unitPrice) || 0)));
}
