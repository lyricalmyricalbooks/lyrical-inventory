// Pure stock-awareness for the consignment shipment form — no DOM, no
// Firestore, no writes.
//
// "Send books to <store>" is the one action that moves copies off the shelf
// without selling them, and until now the dialog said nothing about the shelf
// it was emptying. It opens on a default quantity of 10, shows no on-hand
// figure anywhere, and the only feedback that the number is impossible arrives
// *after* Send is pressed, as a terse "Only 3 in stock" under the field. A
// publisher packing a box for a shop had to leave the dialog, read the stock
// count off the dashboard, and come back.
//
// Same posture as orderStockPreview() for the manual-entry form and
// posStockView() for the register (UX_PATTERNS.md → "Reporting stock on a
// surface that spends it"): this module only *describes*. The ledger keeps sole
// ownership of stock — nothing here rounds, re-tallies or writes a balance.
//
// Unlike the register, the shipment form does NOT get its own low-stock cutoff.
// A shipment is a print-run-scale decision ("do I have enough left to keep
// selling directly after this box goes out?"), which is exactly the question
// the book's own `threshold` reorder alarm was sized for.

import { orderStockPreview } from './inventory.js';

const plural = (n, one, many) => (n === 1 ? one : many);

/**
 * What the "Send books" dialog should say about both shelves — yours and the
 * store's — for the quantity currently typed into it.
 *
 * The store side is reported alongside the stock side deliberately: a shipment
 * does not destroy copies, it moves them, and showing only the falling number
 * makes an ordinary restock read like a loss.
 *
 * @param {object}  input
 * @param {number} [input.onHand]           copies on hand per the records
 * @param {number} [input.qty]              copies the form is about to send
 * @param {number} [input.threshold]        the book's reorder alert level
 * @param {number} [input.storeOutstanding] copies this store already holds
 * @returns {{onHand:number,qty:number,after:number,displayAfter:number,
 *            shortBy:number,storeBefore:number,storeAfter:number,level:string,
 *            pill:string,glyph:string,label:string,note:string,srText:string}}
 */
export function shipmentStockView({ onHand, qty, threshold, storeOutstanding } = {}) {
  const preview = orderStockPreview(onHand, qty, threshold);
  const limit = Number.isFinite(threshold) && threshold > 0 ? Math.floor(threshold) : 0;
  const storeBefore = Number.isFinite(storeOutstanding) && storeOutstanding > 0
    ? Math.floor(storeOutstanding)
    : 0;

  const base = {
    onHand: preview.before,
    qty: preview.qty,
    // `after` keeps the true (possibly negative) arithmetic so the shortfall is
    // reportable; `displayAfter` is what a stock count is allowed to read as.
    after: preview.after,
    displayAfter: preview.displayAfter,
    shortBy: preview.shortBy,
    storeBefore,
    // What the store would hold once the box lands. Shown as asked for even in
    // the short case — the figure describes the form, and the form is what the
    // publisher is about to correct.
    storeAfter: storeBefore + preview.qty,
    level: preview.level,
  };

  switch (preview.level) {
    case 'short':
      return {
        ...base,
        pill: 'red',
        glyph: '✕',
        label: 'Not enough stock',
        note: `That is ${base.shortBy} more than the ${base.onHand} ${plural(base.onHand, 'copy', 'copies')} you have on hand — send ${base.onHand} or fewer.`,
        srText: `Cannot send ${base.qty} ${plural(base.qty, 'copy', 'copies')}: only ${base.onHand} on hand, ${base.shortBy} short.`,
      };
    case 'out':
      return {
        ...base,
        pill: 'amber',
        glyph: '●',
        label: 'Shelf cleared',
        note: 'This sends every copy you have — nothing left on hand for direct sales or another store.',
        srText: `Sending ${base.qty} ${plural(base.qty, 'copy', 'copies')} leaves nothing on hand.`,
      };
    case 'low':
      return {
        ...base,
        pill: 'amber',
        glyph: '●',
        label: 'Low stock',
        note: `Leaves you ${base.displayAfter} on hand, at or below your ${limit}-unit reorder alert.`,
        srText: `Sending ${base.qty} ${plural(base.qty, 'copy', 'copies')} leaves ${base.displayAfter} on hand, at or below the reorder alert of ${limit}.`,
      };
    case 'ok':
      return {
        ...base,
        pill: 'green',
        glyph: '✓',
        label: 'In stock',
        note: '',
        srText: `Sending ${base.qty} ${plural(base.qty, 'copy', 'copies')} leaves ${base.displayAfter} on hand.`,
      };
    default:
      // Nothing typed yet. A gray dash, not a reassuring green tick.
      return { ...base, pill: 'gray', glyph: '', label: '—', note: '', srText: '' };
  }
}
