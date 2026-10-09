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

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * The LOCAL calendar day (`YYYY-MM-DD`) a moment falls on, as the person sees
 * it on their own clock. A bare `YYYY-MM-DD` string is already a day and is
 * returned as-is; anything unreadable gives ''. Unlike
 * `toISOString().slice(0, 10)` this does not roll over at UTC midnight (which
 * is the evening, in Canada).
 */
export function localDay(value = Date.now()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** The local calendar day `days` days from `from` (default now). */
export function localDayPlus(days, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localDay(d);
}
