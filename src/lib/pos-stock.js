// Pure stock-awareness for the POS register — no DOM, no Firestore, no writes.
//
// The register is the one screen used with a customer standing there, and until
// now it said nothing at all about how many copies were left: a card showed the
// title, the price and a +/- counter, so a seller could tap a title up to six
// when two copies were in the box. Nothing warned them, the sale wrote through,
// on-hand stopped at 0, and the missing copies only surfaced later as the
// "unaccounted copies" drift banner on the History tab.
//
// This module only describes; the ledger keeps sole ownership of stock, exactly
// as orderStockPreview() does for the manual-entry form. Nothing here rounds,
// re-tallies or writes a balance.
//
// Deliberately NOT using a book's own `threshold`. That number is a REORDER
// alarm ("Altrove is down to 15, print more"), sized against a whole print run;
// at a fair table it would paint almost every card amber and mean nothing. The
// register's question is narrower — "can I still hand one over?" — so the low
// warning fires against a small fair-scale count instead.

/** Copies left before "only a couple left" is worth saying out loud. */
export const POS_LOW_STOCK_AT = 3;

const plural = (n, one, many) => (n === 1 ? one : many);

/**
 * What one POS card should say about its own stock, given what the cart already
 * holds. `onHand` that isn't a finite number means the title isn't stock-tracked
 * at all (a POS-only guest or consignment title, which deliberately never
 * touches the catalog or the ledger) — those report `tracked: false` and render
 * nothing rather than a misleading zero.
 *
 * @param {object}  input
 * @param {number} [input.onHand]  copies on hand per the records
 * @param {number} [input.inCart]  copies of this title already in the cart
 * @param {number} [input.lowAt]   "only a few left" cutoff
 * @returns {{tracked:boolean,onHand:number,inCart:number,remaining:number,
 *            shortBy:number,level:string,pill:string,glyph:string,
 *            label:string,srText:string}}
 */
export function posStockView({ onHand, inCart = 0, lowAt = POS_LOW_STOCK_AT } = {}) {
  const tracked = Number.isFinite(onHand);
  const stock = tracked && onHand > 0 ? Math.floor(onHand) : 0;
  const cart = Number.isFinite(inCart) && inCart > 0 ? Math.floor(inCart) : 0;
  const limit = Number.isFinite(lowAt) && lowAt > 0 ? Math.floor(lowAt) : 0;

  // `remaining` keeps the true (possibly negative) arithmetic so the shortfall
  // is reportable; the card never prints a negative stock count.
  const remaining = stock - cart;
  const shortBy = Math.max(0, -remaining);
  const base = { tracked, onHand: stock, inCart: cart, remaining, shortBy };

  if (!tracked) {
    return { ...base, level: 'untracked', pill: 'gray', glyph: '', label: '', srText: '' };
  }

  if (shortBy > 0) {
    return {
      ...base,
      level: 'short',
      pill: 'red',
      glyph: '✕',
      label: `${shortBy} more than you have`,
      srText: `The cart holds ${cart} ${plural(cart, 'copy', 'copies')}, but only ${stock} ${plural(stock, 'is', 'are')} on hand — ${shortBy} more than your records show.`,
    };
  }

  if (stock === 0) {
    return {
      ...base,
      level: 'out',
      pill: 'red',
      glyph: '✕',
      label: 'Out of stock',
      srText: 'No copies of this title are on hand.',
    };
  }

  if (remaining === 0) {
    return {
      ...base,
      level: 'last',
      pill: 'amber',
      glyph: '●',
      label: 'None left after this',
      srText: `The cart takes the last ${plural(stock, 'copy', `${stock} copies`)} on hand.`,
    };
  }

  if (limit > 0 && remaining <= limit) {
    return {
      ...base,
      level: 'low',
      pill: 'amber',
      glyph: '●',
      label: `${remaining} left`,
      srText: `Only ${remaining} ${plural(remaining, 'copy', 'copies')} left on hand after what is already in the cart.`,
    };
  }

  return {
    ...base,
    level: 'ok',
    pill: 'gray',
    glyph: '',
    label: `${remaining} left`,
    srText: `${remaining} ${plural(remaining, 'copy', 'copies')} on hand after what is already in the cart.`,
  };
}

/**
 * One sentence covering every cart line that is selling more copies than the
 * records hold, for the banner above Complete Sale and in the confirm dialog.
 * Returns null when nothing oversells, so the caller can hide the node outright
 * rather than paint a reassuring "all good" the publisher has to read past.
 *
 * Never blocks the sale: the seller may genuinely have brought copies the
 * records don't know about, and refusing a sale at a fair table is worse than
 * an off-by-two stock count. It says what will happen, and lets them decide.
 *
 * @param {Array<{title?:string,onHand?:number,inCart?:number}>} lines
 * @returns {{count:number,copies:number,titles:string[],message:string,note:string,srText:string}|null}
 */
export function posOversellSummary(lines = []) {
  const over = [];
  for (const line of Array.isArray(lines) ? lines : []) {
    const view = posStockView(line || {});
    if (view.level !== 'short') continue;
    over.push({ title: (line && line.title) || 'Untitled', ...view });
  }
  if (!over.length) return null;

  const copies = over.reduce((sum, o) => sum + o.shortBy, 0);
  const first = over[0];
  const message = over.length === 1
    ? `“${first.title}” — the cart has ${first.inCart}, but your records show ${first.onHand} on hand.`
    : `${over.length} titles have more copies in the cart than your records show on hand — ${copies} ${plural(copies, 'copy', 'copies')} more in total.`;
  const note = 'Go ahead if you brought extra copies. Otherwise on-hand stops at 0 and your stock count stops matching your records.';

  return {
    count: over.length,
    copies,
    titles: over.map((o) => o.title),
    message,
    note,
    srText: `${message} ${note}`,
  };
}
