// The one place that decides when something running by itself should run.
//
// Three things now check on the publisher's behalf without being asked: the
// storefront order watch, the Shippo label watch, and the postage sweep that
// looks for labels bought elsewhere. The first two arrived a week apart and
// each brought its own copy of the same gate — byte-identical conditions,
// written out twice, and a third copy was about to be written.
//
// Two copies is a coincidence. Three is a decision, and the decision should be
// to have one. That matters beyond tidiness: these gates encode a promise about
// what the app does with somebody's battery, mobile data and API quota while
// they are not looking at it, and a promise kept in three places is one that
// will eventually be kept in two.
//
// Pure — no timers, no DOM, no storage. `startWatch` below wires the triggers,
// but every judgement about whether a request is worth making lives in
// `dueForCheck`, where it can be tested without a browser.

/**
 * Whether a check is worth making now.
 *
 * Each condition is a way the request would be wasted or wrong:
 *
 *   configured  — no credentials, so there is nothing to ask.
 *   online      — no connection, so the ask cannot succeed.
 *   visible     — nobody is looking. A backgrounded phone browser throttles
 *                 timers to minutes anyway, and spending someone's mobile data
 *                 on an answer they will not read until they open the app is
 *                 not a trade worth making.
 *   busy        — a check is already running; a second would queue behind it
 *                 and ask the same question twice.
 *   intervalMs  — the last answer is still fresh.
 */
export function dueForCheck({
  lastCheckedAt = 0,
  now = Date.now(),
  intervalMs = 0,
  online = true,
  configured = true,
  visible = true,
  busy = false,
} = {}) {
  if (!configured || !online || !visible || busy) return false;
  if (!(intervalMs > 0)) return false;
  const last = Number(lastCheckedAt) || 0;
  return (now - last) >= intervalMs;
}

/**
 * The interval to actually use, given how the integration has been behaving.
 *
 * A service that keeps refusing should be asked less often, not at the same
 * five-minute cadence forever — for a rejected credential that is several
 * hundred pointless refused requests a day. The caller supplies the backoff
 * (from integration-health), and this only ever lengthens the wait: a backoff
 * can slow a watch down, never speed one past its own interval.
 */
export function effectiveInterval(baseMs, backoffMs = 0) {
  const base = Math.max(0, Number(baseMs) || 0);
  const backoff = Math.max(0, Number(backoffMs) || 0);
  return Math.max(base, backoff);
}

/**
 * The three ways a PWA gets used, and therefore the three moments worth
 * re-checking: left open on a desk (the timer), switched back to from another
 * app (visibility), and picked up again once the signal returns (online).
 *
 * Returns a stop function. Guarding against a second start is the caller's, so
 * that a watch which has already armed does not silently double every timer and
 * listener it owns.
 */
export function startWatch(poll, {
  intervalMs,
  win = typeof window === 'undefined' ? null : window,
  doc = typeof document === 'undefined' ? null : document,
  immediate = true,
} = {}) {
  if (typeof poll !== 'function' || !win || !(intervalMs > 0)) return () => {};

  const onVisible = () => { if (doc && doc.visibilityState === 'visible') poll(); };

  if (immediate) poll();
  const timer = win.setInterval(poll, intervalMs);
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', onVisible);
  }
  win.addEventListener('online', poll);

  return () => {
    win.clearInterval(timer);
    if (doc && typeof doc.removeEventListener === 'function') {
      doc.removeEventListener('visibilitychange', onVisible);
    }
    win.removeEventListener('online', poll);
  };
}

/** The state a caller reads out of the browser to answer dueForCheck. */
export function browserWatchState({
  win = typeof window === 'undefined' ? null : window,
  doc = typeof document === 'undefined' ? null : document,
  nav = typeof navigator === 'undefined' ? null : navigator,
} = {}) {
  return {
    online: !nav || nav.onLine !== false,
    visible: !doc || doc.visibilityState !== 'hidden',
    hasWindow: !!win,
  };
}
