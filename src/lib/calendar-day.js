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
 * @param {string | number | Date} [value]
 * @returns {string}
 */
export function localDay(value = Date.now()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * The local calendar day `days` days from `from` (default now).
 * @param {number} days
 * @param {string | number | Date} [from]
 * @returns {string}
 */
export function localDayPlus(days, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localDay(d);
}

/**
 * The calendar day a Google Sheet date cell means. Apps Script sends a date
 * cell as UTC text of midnight in the sheet's own time zone, so a Rome sheet's
 * 15 March arrives as "2026-03-14T23:00:00.000Z" and a Toronto sheet's as
 * "2026-03-15T04:00:00.000Z". Cutting the text at "T" moved every sale east
 * of UTC back a day. A value on a quarter hour is a midnight somewhere between
 * UTC−12 and UTC+12, so the nearest UTC midnight names its day, whatever time
 * zone this device is in. Anything else is read on this device's clock.
 * @param {string|number|Date} value
 * @returns {string} YYYY-MM-DD, or '' when unreadable
 */
export function sheetDay(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const timed = !(typeof value === 'string' && !value.includes('T') && !/\d:\d/.test(value));
  if (timed && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0 && d.getUTCMinutes() % 15 === 0) {
    return new Date(d.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);
  }
  return localDay(d);
}
