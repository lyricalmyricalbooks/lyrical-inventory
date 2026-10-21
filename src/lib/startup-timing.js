/**
 * startup-timing.js — how long the app took to reach the owner's numbers.
 *
 * "Sometimes the app is slow to open" can't be fixed or checked without a
 * number. Each start records how long it took, from tapping the app to the
 * first full screen of real figures, on this device only. The account menu
 * shows the last one next to what is usual here, so a slow start can be told
 * apart from a slow phone or a slow place.
 *
 * Pure: the caller reads and writes storage and paints the line.
 */

/** How many starts are kept per device. Enough for a fair "usual", tiny to store. */
export const STARTUP_HISTORY_MAX = 20;

/** localStorage key the caller keeps the history under. */
export const STARTUP_HISTORY_KEY = 'lm-startup-times';

/**
 * The history with one start added, newest last, oldest dropped past the cap.
 * Junk (a missing, negative or absurd time) is ignored rather than stored.
 *
 * @param {unknown} history  what was stored before (anything; non-arrays reset)
 * @param {number}  ms       how long this start took
 * @param {number}  at       when it happened (epoch ms)
 * @returns {{ms:number, at:number}[]}
 */
export function recordStartup(history, ms, at) {
  const list = Array.isArray(history)
    ? history.filter(e => e && Number.isFinite(e.ms) && e.ms >= 0)
    : [];
  if (!Number.isFinite(ms) || ms < 0 || ms > 10 * 60 * 1000) return list.slice(-STARTUP_HISTORY_MAX);
  list.push({ ms: Math.round(ms), at: Number(at) || 0 });
  return list.slice(-STARTUP_HISTORY_MAX);
}

/** Middle value of a list of numbers (the average of the two middle ones when even). */
function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 2400 → "2.4 s", 450 → "0.5 s", 75000 → "75 s". */
export function formatSeconds(ms) {
  const s = ms / 1000;
  return s >= 10 ? `${Math.round(s)} s` : `${s.toFixed(1)} s`;
}

/**
 * The account-menu line for a history, or '' when there is nothing to say.
 * "Usual" is the median of the earlier starts, so one bad day doesn't skew it,
 * and only appears once there are three earlier starts to take it from.
 *
 * @param {{ms:number}[]} history
 * @returns {string}
 */
export function describeStartup(history) {
  const list = Array.isArray(history) ? history.filter(e => e && Number.isFinite(e.ms)) : [];
  if (!list.length) return '';
  const last = list[list.length - 1].ms;
  const earlier = list.slice(0, -1).map(e => e.ms);
  const head = `Opened in ${formatSeconds(last)}`;
  if (earlier.length < 3) return head;
  return `${head} · usually ${formatSeconds(median(earlier))} on this device`;
}
