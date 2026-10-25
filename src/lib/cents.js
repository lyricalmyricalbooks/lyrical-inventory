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
  return Math.round((n + Number.EPSILON) * 100);
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
