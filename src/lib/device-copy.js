/**
 * device-copy.js — how old the copy is that the app shows while it starts.
 *
 * The startup preview paints the figures this device saved last time, before
 * the server's copy arrives. If the device hasn't been used for a week, those
 * figures are a week old, so the status line says so ("from 6 days ago") and a
 * number read off the screen in that moment isn't mistaken for today's.
 *
 * "Saved" is when this device last held the latest copy — the end of a full
 * load, or a live update since — which the caller records. Pure.
 */

/** localStorage key the caller keeps the time under. */
export const DEVICE_COPY_KEY = 'lm-device-copy-at';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "from 5 minutes ago", "from 3 hours ago", "from yesterday", "from 6 days
 * ago" — or '' when the time is unknown or in the future (a wrong clock), so
 * the caller can leave the age out rather than state a wrong one.
 *
 * @param {unknown} savedAt  epoch ms
 * @param {number}  now      epoch ms
 */
export function describeCopyAge(savedAt, now) {
  const at = Number(savedAt);
  if (!Number.isFinite(at) || at <= 0 || !Number.isFinite(now) || at > now + MINUTE) return '';
  const age = Math.max(0, now - at);
  if (age < 2 * MINUTE) return 'from a moment ago';
  if (age < HOUR) return `from ${Math.floor(age / MINUTE)} minutes ago`;
  if (age < 2 * HOUR) return 'from an hour ago';
  if (age < DAY) return `from ${Math.floor(age / HOUR)} hours ago`;
  if (age < 2 * DAY) return 'from yesterday';
  return `from ${Math.floor(age / DAY)} days ago`;
}
