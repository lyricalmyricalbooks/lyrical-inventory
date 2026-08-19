/**
 * Horizontal-scroll state publisher for the Lyrical design system.
 *
 * On a phone the ledger tables bleed full width and scroll sideways — Order
 * History alone is ten columns. That has two costs the CSS cannot see on its
 * own:
 *
 *   1. Once the table is pushed sideways, the column that says WHICH order or
 *      WHICH day a row is scrolls off the left edge, leaving a screen of
 *      right-aligned mono figures with nothing to attach them to.
 *   2. Nothing on screen says there are more columns at all, so "Total" and
 *      "Stock after" may as well not exist for anyone who never swipes.
 *
 * The fix for both lives in src/styles/system.css (`.sys-sticky-col`) and needs
 * one piece of information CSS can't derive: whether this particular table is
 * actually wider than the space it has, and where in that overflow the reader
 * currently is. No media or container query can answer that — it depends on the
 * column CONTENT, so a narrow table on a narrow screen must stay untouched
 * while a wide one on a wide screen must not. This module measures it and
 * publishes it as `data-scroll`.
 *
 * Progressive enhancement, never load-bearing: with no JS, no ResizeObserver,
 * or an engine that reports nothing measurable, the attribute is simply absent
 * and every table renders exactly as it does today.
 */

/** The attribute every `.sys-sticky-col` rule keys off. */
export const SCROLL_STATE_ATTR = 'data-scroll';

/** Wrappers that opt into a pinned first column. */
export const SCROLL_EDGE_SELECTOR = '.tbl-wrap.sys-sticky-col';

/**
 * Sub-pixel slack. Browsers report fractional scroll metrics on zoomed or
 * high-DPI displays, so an exact `scrollLeft === 0` comparison would leave a
 * table that IS at its start reading as mid-scroll.
 */
const EPSILON = 1;

/** Overflow values that mean the box cannot be scrolled sideways by the user. */
const NON_SCROLLING = new Set(['visible', 'hidden', 'clip']);

/**
 * Where a wrapper sits in its own horizontal overflow.
 *
 * @param {Element|null} el
 * @param {Window} [view]  Window whose getComputedStyle is consulted.
 * @returns {'none'|'start'|'middle'|'end'} `none` when there is nothing to
 *   scroll — which is also the answer for a box whose overflow is clipped, so
 *   the desktop layout (where `.tbl-wrap` hides its overflow) never advertises
 *   columns the reader has no way to reach.
 */
export function tableScrollEdge(el, view = typeof window !== 'undefined' ? window : null) {
  if (!el) return 'none';

  let overflowX = '';
  try {
    overflowX = view?.getComputedStyle?.(el)?.overflowX || '';
  } catch (_) {
    // A detached node can throw here. Fall through and judge on metrics alone.
    overflowX = '';
  }
  if (overflowX && NON_SCROLLING.has(overflowX)) return 'none';

  const scrollWidth = Number(el.scrollWidth);
  const clientWidth = Number(el.clientWidth);
  if (!Number.isFinite(scrollWidth) || !Number.isFinite(clientWidth)) return 'none';

  const overflow = scrollWidth - clientWidth;
  if (!(overflow > EPSILON)) return 'none';

  // Math.abs so a right-to-left document, where scrollLeft runs negative,
  // reports its edges the same way rather than pinning to `end` forever.
  const scrolled = Math.abs(Number(el.scrollLeft) || 0);
  if (scrolled <= EPSILON) return 'start';
  if (scrolled >= overflow - EPSILON) return 'end';
  return 'middle';
}

/**
 * Measure one wrapper and stamp the result onto it.
 *
 * @param {Element|null} el
 * @param {Window} [view]
 * @returns {string} The state written.
 */
export function syncTableScrollEdges(el, view) {
  const state = tableScrollEdge(el, view);
  if (el?.setAttribute) el.setAttribute(SCROLL_STATE_ATTR, state);
  return state;
}

/**
 * Start publishing `data-scroll` on every opted-in table wrapper, and keep it
 * current as the reader swipes, as rows arrive, and as the window resizes.
 *
 * @param {object} [options]
 * @param {Document|Element|null} [options.root]  Where wrappers are looked for.
 * @param {string} [options.selector]
 * @param {Window} [options.view]
 * @returns {() => void} Teardown that stops observing.
 *
 * @example
 *   initTableScrollEdges(); // ledgers now pin their first column on a phone
 */
export function initTableScrollEdges(options = {}) {
  const view = options.view || (typeof window !== 'undefined' ? window : null);
  const doc = options.root
    || view?.document
    || (typeof document !== 'undefined' ? document : null);
  const selector = options.selector || SCROLL_EDGE_SELECTOR;

  const wraps = () => {
    try {
      return [...(doc?.querySelectorAll?.(selector) || [])];
    } catch (_) {
      return [];
    }
  };

  const syncAll = () => { for (const el of wraps()) syncTableScrollEdges(el, view); };
  syncAll();

  // Scroll does not bubble, so this listens in the capture phase instead of
  // binding one listener per wrapper — the wrappers are static markup, but the
  // capture form also survives any that get replaced later.
  const onScroll = (e) => {
    const target = e?.target;
    if (target?.matches?.(selector)) syncTableScrollEdges(target, view);
  };
  doc?.addEventListener?.('scroll', onScroll, true);

  // Rows landing in a tbody change how far the table overflows, and no scroll
  // event fires for that. Observing the wrapper AND its table catches both the
  // viewport changing and the content changing.
  let observer = null;
  if (typeof view?.ResizeObserver === 'function') {
    try {
      observer = new view.ResizeObserver(syncAll);
      for (const el of wraps()) {
        observer.observe(el);
        const table = el.querySelector?.('table');
        if (table) observer.observe(table);
      }
    } catch (_) {
      observer = null;
    }
  }
  // Covers engines without ResizeObserver, and costs nothing where the
  // observer already fires: both paths write the same value.
  view?.addEventListener?.('resize', syncAll);

  return () => {
    try { observer?.disconnect(); } catch (_) { /* already gone */ }
    doc?.removeEventListener?.('scroll', onScroll, true);
    view?.removeEventListener?.('resize', syncAll);
  };
}
