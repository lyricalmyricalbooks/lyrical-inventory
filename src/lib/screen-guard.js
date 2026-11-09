/**
 * screen-guard.js — keep one broken screen from taking the rest of the app
 * down with it.
 *
 * Screens are drawn by plain functions called one after another: switching to
 * the Dashboard runs three of them, and the redraw after every sync runs the
 * visible tab's drawing and then the header, badge and banner. A throw in any
 * one of them used to skip everything after it — a half-drawn tab, a header
 * that stopped updating, or (at start-up) the offline-sales upload never
 * starting — while the only trace was a row in the error log.
 *
 * `guard(label, fn)` runs `fn`, and if it throws: reports it, tells the user
 * once per label per session (a redraw loop must not stack up toasts), and
 * returns undefined so the caller carries on with the next step.
 */

/**
 * @param {{ report?: (label: string, err: unknown) => void,
 *           notify?: (label: string, err: unknown) => void }} hooks
 * @returns {<T>(label: string, fn: () => T) => T | undefined}
 */
export function makeScreenGuard({ report, notify } = {}) {
  const told = new Set();
  return function guard(label, fn) {
    try {
      return fn();
    } catch (err) {
      try { if (report) report(label, err); } catch (_) { /* never a second fault */ }
      if (!told.has(label)) {
        told.add(label);
        try { if (notify) notify(label, err); } catch (_) { /* never a second fault */ }
      }
      return undefined;
    }
  };
}

/** What the user is told when part of a screen could not be drawn. */
export const SCREEN_FAILED_MSG = '⚠ Part of this screen could not be shown. Your records are safe. Reload the app to try again.';
