import { fmt } from './money.js';

/**
 * Calculates detailed break-even metrics and explicit explanation texts for a book.
 *
 * @param {Object} params
 * @param {number} params.cost - Total production cost of the book.
 * @param {number} params.recognizedRev - Total recognized revenue to date.
 * @param {number} [params.listPrice=0] - Retail list price per copy.
 * @param {number} [params.sold=0] - Total units sold to date.
 * @param {number} [params.stock] - Current on-hand stock.
 * @param {string} [params.currency='CAD'] - Book currency symbol/code.
 * @returns {Object} Break-even analysis metrics, badges, and explanatory text.
 */
export function calculateBreakEven({
  cost = 0,
  recognizedRev = 0,
  listPrice = 0,
  sold = 0,
  stock = undefined,
  currency = 'CAD'
}) {
  const numericCost = Math.max(0, Number(cost) || 0);
  const numericRev = Math.max(0, Number(recognizedRev) || 0);
  const numericListPrice = Math.max(0, Number(listPrice) || 0);
  const numericSold = Math.max(0, Number(sold) || 0);

  const broken = numericCost > 0 && numericRev >= numericCost;
  const pctBe = numericCost > 0 ? Math.min(100, (numericRev / numericCost) * 100) : 0;
  const remaining = Math.max(0, numericCost - numericRev);
  const isClose = pctBe >= 70;
  const hasListPrice = numericListPrice > 0;

  const unitsNeededAtList = (remaining > 0 && hasListPrice)
    ? Math.ceil(remaining / numericListPrice)
    : 0;

  const avgRev = (numericSold > 0 && numericRev > 0)
    ? (numericRev / numericSold)
    : 0;

  const unitsNeededAtAvg = (remaining > 0 && avgRev > 0)
    ? Math.ceil(remaining / avgRev)
    : 0;

  let stockDeficit = 0;
  if (typeof stock === 'number' && hasListPrice && remaining > 0 && stock < unitsNeededAtList) {
    stockDeficit = unitsNeededAtList - stock;
  }

  let unitsBadgeText = '';
  let unitsBadgeTitle = '';
  if (broken) {
    unitsBadgeText = '✓ Fully recovered';
    unitsBadgeTitle = 'Production costs have been fully recovered.';
  } else if (!hasListPrice) {
    unitsBadgeText = '📚 List price not set';
    unitsBadgeTitle = 'Set a list price in book settings to calculate the number of units needed to break even.';
  } else {
    unitsBadgeText = `📚 ~${unitsNeededAtList} unit${unitsNeededAtList !== 1 ? 's' : ''} needed at list price (${fmt(numericListPrice, currency)})`;
    unitsBadgeTitle = `Calculated as ${fmt(remaining, currency)} remaining ÷ ${fmt(numericListPrice, currency)} list price per copy.`;
  }

  let primaryExplanation = '';
  if (broken) {
    primaryExplanation = 'Production costs fully recovered — everything earned from here is profit.';
  } else if (!hasListPrice) {
    primaryExplanation = 'Set a list price in book settings to calculate the units needed to break even.';
  } else {
    primaryExplanation = `Requires selling ~${unitsNeededAtList} more unit${unitsNeededAtList !== 1 ? 's' : ''} at full list price of ${fmt(numericListPrice, currency)} to recover the remaining ${fmt(remaining, currency)}.`;
  }

  let paceNote = '';
  if (!broken && hasListPrice && unitsNeededAtAvg > 0 && Math.abs(avgRev - numericListPrice) >= 0.05) {
    paceNote = `At your historical realized average of ${fmt(avgRev, currency)}/unit (accounting for consignment splits & discounts), break-even will require ~${unitsNeededAtAvg} units.`;
  }

  let stockNote = '';
  if (!broken && stockDeficit > 0) {
    stockNote = `Current on-hand stock: ${stock} unit${stock !== 1 ? 's' : ''} (${stockDeficit} more needed beyond current inventory).`;
  }

  return {
    cost: numericCost,
    recognizedRev: numericRev,
    listPrice: numericListPrice,
    hasListPrice,
    sold: numericSold,
    remaining,
    pctBe,
    broken,
    isClose,
    unitsNeededAtList,
    avgRev,
    unitsNeededAtAvg,
    stockDeficit,
    unitsBadgeText,
    unitsBadgeTitle,
    primaryExplanation,
    paceNote,
    stockNote
  };
}