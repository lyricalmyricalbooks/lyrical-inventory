// How much of a category's spend the CRA lets the business deduct.
//
// Most categories are 100% deductible, so they are simply absent from the
// table. The exception is food, beverages and entertainment: under the Income
// Tax Act (s. 67.1) only 50% of the cost counts, and the cap applies to the
// whole bill — tax, tips and delivery fees included. On the T2125 it is the
// "Meals and entertainment" line, which already expects the full amount spent
// and lets the 50% be applied after; here the ledger keeps the full amount
// spent and the limit is applied at the point deductible totals are built.
//
// The stored expense is never rewritten. The same ledger is reachable offline
// from a queued local state, so a rate baked into saved rows would disagree
// with an un-synced device; a rule applied on read agrees everywhere at once
// and stays reversible if the CRA changes the percentage.

/** Fraction of spend that is deductible, keyed by canonical category name. */
export const DEDUCTIBLE_RATES = {
  'Meals & Entertainment': 0.5,
};

/** Fraction (0–1) of `cat` that is deductible; 1 when the category has no limit. */
export function deductibleRate(cat) {
  const rate = DEDUCTIBLE_RATES[cat];
  return typeof rate === 'number' ? rate : 1;
}

/**
 * The deductible part of an amount spent in `cat`, rounded to the cent so a
 * column of 50% halves still adds up to the footer beneath it.
 */
export function deductibleAmount(cat, amount) {
  const n = Number(amount) || 0;
  const rate = deductibleRate(cat);
  return rate === 1 ? n : Math.round(n * rate * 100) / 100;
}
