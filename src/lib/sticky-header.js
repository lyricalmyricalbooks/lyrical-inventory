/**
 * Sticky-offset publisher for the Lyrical design system.
 *
 * The ledgers in this app are long — Order History pages 50 rows at a time and
 * the consignment and tax ledgers run to hundreds — but `.tbl` headers scroll
 * away with the first screenful. Past that point a publisher is reading a wall
 * of right-aligned mono figures with no labels above them, and "Unit price",
 * "Total" and "Stock after" are three columns you must not confuse.
 *
 * The fix is `position: sticky` on the header cells, which needs a top offset:
 * `.app-header` is itself sticky at `top: 0`, so a table header pinned at 0
 * would slide underneath it and disappear. The header's height is not a
 * constant — it wraps to two rows on narrow screens and grows with the safe
 * area inset on a notched phone — so it is measured rather than guessed and
 * republished as `--sticky-top` whenever it changes.
 *
 * Progressive enhancement, never load-bearing: with no ResizeObserver, no
 * matchable header, or no sticky chrome at all, the property falls back to 0px
 * and every table renders exactly as it does today.
 */

/** The custom property every sticky-below-the-chrome rule reads. */
export const STICKY_TOP_PROP = '--sticky-top';

/**
 * Height, in CSS pixels, that a sticky/fixed element occupies at the top of the
 * viewport. Anything not actually pinned there contributes no offset.
 *
 * @param {Element|null} el
 * @param {Window} [view]  Window whose getComputedStyle is consulted.
 * @returns {number} Rounded height, or 0 when the element does not pin.
 */
export function stickyChromeHeight(el, view = typeof window !== 'undefined' ? window : null) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return 0;
  let position = '';
  try {
    position = view?.getComputedStyle?.(el)?.position || '';
  } catch (_) {
    // getComputedStyle can throw on a detached node in some engines — an
    // unmeasurable header simply contributes no offset.
    return 0;
  }
  if (position !== 'sticky' && position !== 'fixed') return 0;
  const height = el.getBoundingClientRect()?.height;
  return Number.isFinite(height) && height > 0 ? Math.round(height) : 0;
}

/**
 * Write the offset onto an element's inline style as `--sticky-top`.
 *
 * @param {number} px
 * @param {HTMLElement|null} [target]  Defaults to the document element.
 * @returns {number} The clamped value actually written.
 */
export function applyStickyOffset(px, target = typeof document !== 'undefined' ? document.documentElement : null) {
  const value = Math.max(0, Math.round(Number(px) || 0));
  if (target?.style?.setProperty) target.style.setProperty(STICKY_TOP_PROP, `${value}px`);
  return value;
}

/**
 * Start publishing the sticky chrome height, and keep it current.
 *
 * @param {object} [options]
 * @param {Element|null} [options.header]  Defaults to `.app-header`.
 * @param {HTMLElement|null} [options.target]  Element the property is set on.
 * @param {Window} [options.view]
 * @returns {() => void} Teardown that stops observing.
 *
 * @example
 *   initStickyOffset(); // --sticky-top now tracks the app header
 */
export function initStickyOffset(options = {}) {
  const view = options.view || (typeof window !== 'undefined' ? window : null);
  const doc = options.document || view?.document || (typeof document !== 'undefined' ? document : null);
  const header = 'header' in options ? options.header : doc?.querySelector?.('.app-header') || null;
  const target = options.target || doc?.documentElement || null;

  const sync = () => applyStickyOffset(stickyChromeHeight(header, view), target);
  sync();

  let observer = null;
  if (header && typeof view?.ResizeObserver === 'function') {
    try {
      observer = new view.ResizeObserver(sync);
      observer.observe(header);
    } catch (_) {
      observer = null;
    }
  }
  // A resize listener covers the engines without ResizeObserver, and costs
  // nothing where the observer already fires: both paths write the same value.
  view?.addEventListener?.('resize', sync);

  return () => {
    try { observer?.disconnect(); } catch (_) { /* already gone */ }
    view?.removeEventListener?.('resize', sync);
  };
}
