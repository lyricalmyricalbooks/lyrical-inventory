// The calendar-day arithmetic shared by the order follow-up and parcel-watch
// cards. Both only care which day something happened, so any time of day on a
// stored timestamp is dropped before comparing.

/** One day in milliseconds. */
export const DAY = 86400000;

/**
 * Midnight UTC of the `YYYY-MM-DD` day a stored date or timestamp falls on,
 * in milliseconds, or NaN when it cannot be read.
 */
export function dayMs(value) {
  const parsed = Date.parse(String(value || '').slice(0, 10));
  return Number.isFinite(parsed) ? parsed : NaN;
}
