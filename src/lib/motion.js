/**
 * Motion layer for the Lyrical design system.
 *
 * The app re-renders large regions by assigning `innerHTML` (~237 call sites),
 * which repaints instantly with no visual continuity — a list can reorder,
 * collapse, or filter and the user gets no signal that the change was theirs.
 * `withViewTransition()` wraps such a re-render so the browser crossfades
 * between the old and new state.
 *
 * Progressive enhancement, never load-bearing: when the View Transitions API
 * is unavailable, or the user has asked for reduced motion, the update runs
 * synchronously exactly as it does today.
 *
 * ── STATUS: AVAILABLE BUT DELIBERATELY UNWIRED ────────────────────────────
 * Nothing in the app calls this today, and that is on purpose. View
 * Transitions were previously shipped across switchTab/switchBook in PR #128
 * and reverted in PR #129 *seven minutes later*, with no reason recorded on
 * either PR. That earlier attempt wrapped all tab and book navigation — a far
 * broader surface than any single control.
 *
 * Before wiring this to anything, confirm the intent: the prior revert is
 * evidence that app-wide navigation transitions were not wanted. A narrow,
 * single-widget use may well be fine, but it is an explicit decision rather
 * than an obvious improvement. See .agents/UX_PATTERNS.md §1.
 */

/** True when the user has asked the OS to minimise animation. */
export function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/**
 * Run a DOM update inside a view transition when the platform supports it.
 *
 * @param {() => void} update  Synchronous DOM mutation (typically a render fn).
 * @returns {{finished: Promise<void>} | void} The transition, when one started.
 *
 * @example
 *   withViewTransition(() => renderConsignmentTable());
 */
export function withViewTransition(update) {
  if (typeof update !== 'function') return;

  if (!document.startViewTransition || prefersReducedMotion()) {
    update();
    return;
  }

  try {
    return document.startViewTransition(update);
  } catch (_) {
    // A transition already in flight (or an unsupported edge case) must never
    // cost the user their update — fall back to applying it directly.
    update();
  }
}

/**
 * Give an element a transition identity so it MORPHS between renders instead
 * of crossfading. Only one element may hold a given name at a time.
 *
 * Use sparingly — naming everything makes transitions noisy and slow. Reserve
 * it for the one element whose continuity actually carries meaning (a row
 * being promoted, a card expanding into a panel).
 *
 * @param {Element|null} el
 * @param {string|null} name  Pass null to release the name.
 */
export function setTransitionName(el, name) {
  if (!el || !el.style) return;
  el.style.viewTransitionName = name || '';
}
