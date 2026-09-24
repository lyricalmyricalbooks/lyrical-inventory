// Fair Mode: the phone register used at a stall. Pure helpers plus the
// screen wake lock; the sale itself still goes through posConfirmSale().

import { escapeHtml as esc } from './html.js';

/** Payment choices on the charge sheet, in thumb order. `value` is what the
 *  sale records, and must match the register's payment <select>. */
export const FAIR_METHODS = [
  { value: 'Card', label: 'Card reader', icon: '💳' },
  { value: 'Stripe QR', label: 'QR / Stripe', icon: '▦' },
  { value: 'Bank Transfer', label: 'E-transfer', icon: '⇄', other: true },
  { value: 'Cash', label: 'Cash', icon: '＄', other: true },
  { value: 'Comp/Gift', label: 'Comp', icon: '♡', other: true },
];

/** How long the "Sold — Undo" bar stays up. Long enough to catch a wrong tap
 *  while the customer is still at the table, short enough not to linger. */
export const FAIR_UNDO_MS = 8000;

/** Above this many titles the phone keeps the search box. */
export const FAIR_SEARCH_OVER = 15;

const METHOD_KEY = 'lm-fair-last-method';

export function readLastMethod(storage = globalThis.localStorage) {
  try {
    const v = storage?.getItem(METHOD_KEY);
    return FAIR_METHODS.some(m => m.value === v) ? v : 'Card';
  } catch { return 'Card'; }
}

export function rememberMethod(value, storage = globalThis.localStorage) {
  if (!FAIR_METHODS.some(m => m.value === value)) return;
  try { storage?.setItem(METHOD_KEY, value); } catch { /* private mode: fine */ }
}

/** Is an undo for a sale recorded at `at` still allowed at `now`? */
export function undoOpen(at, now = Date.now(), windowMs = FAIR_UNDO_MS) {
  return Number.isFinite(at) && now >= at && now - at <= windowMs;
}

/** "Sold 2 books · €40.00" */
export function soldLabel(count, totalText) {
  const n = Math.max(0, Math.floor(count) || 0);
  return `Sold ${n} ${n === 1 ? 'book' : 'books'}${totalText ? ` · ${totalText}` : ''}`;
}

/** "1 book" / "3 books", for the charge bar. */
export function countLabel(count) {
  const n = Math.max(0, Math.floor(count) || 0);
  return `${n} ${n === 1 ? 'book' : 'books'}`;
}

/**
 * One tile. The whole tile adds a copy; the − chip (only once something is in
 * the cart) takes one back. `stock` is a posStockView() result.
 */
export function fairTileHtml({ id, title, priceText, qty = 0, stock = null }) {
  const idJs = esc(JSON.stringify(String(id)));
  const left = stock && stock.tracked ? Math.max(0, stock.remaining) : null;
  const out = left === 0 && qty === 0 && stock?.onHand === 0;
  const stockText = left === null ? '' : out ? 'Sold out' : left === 1 ? 'Last copy' : `${left} left`;
  const cls = ['fm-tile', qty > 0 ? 'is-in-cart' : '', out ? 'is-out' : '', stock?.level === 'short' ? 'is-short' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}" role="listitem">
  <button type="button" class="fm-tile-add" onclick="posUpdateQty(${idJs}, 1)" aria-label="Add one: ${esc(title)}, ${esc(priceText)}${qty ? `, ${qty} in sale` : ''}">
    <span class="fm-tile-title">${esc(title)}</span>
    <span class="fm-tile-price">${esc(priceText)}</span>
    ${stockText ? `<span class="fm-tile-stock">${esc(stockText)}</span>` : ''}
    ${qty > 0 ? `<span class="fm-tile-qty" aria-hidden="true">${qty}</span>` : ''}
  </button>
  ${qty > 0 ? `<button type="button" class="fm-tile-minus" onclick="posUpdateQty(${idJs}, -1)" aria-label="Remove one: ${esc(title)}">−</button>` : ''}
</div>`;
}

/**
 * Keep the screen on while selling. Browsers drop the lock whenever the page
 * is hidden, so it is re-requested on return. Returns a release function.
 */
export function keepScreenAwake(nav = globalThis.navigator, doc = globalThis.document) {
  if (!nav?.wakeLock?.request || !doc) return () => {};
  let lock = null;
  let active = true;
  const grab = async () => {
    if (!active || doc.visibilityState !== 'visible' || lock) return;
    try {
      lock = await nav.wakeLock.request('screen');
      lock.addEventListener?.('release', () => { lock = null; });
    } catch { lock = null; /* low battery or not allowed: selling still works */ }
  };
  const onVis = () => { grab(); };
  doc.addEventListener('visibilitychange', onVis);
  grab();
  return () => {
    active = false;
    doc.removeEventListener('visibilitychange', onVis);
    lock?.release?.().catch?.(() => {});
    lock = null;
  };
}
