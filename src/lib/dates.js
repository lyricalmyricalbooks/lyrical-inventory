// How the app shows a date to a person. Pure and dependency-free, so it can be
// imported anywhere and unit-tested without a DOM.
//
// Date.toLocaleDateString with options builds a fresh Intl.DateTimeFormat on
// every call (~150x slower than reusing one), so each format here is built
// once and reused.

const DATE_FMT_EN_GB = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * A table date: "4 Mar 2025", or "—" when there is none. A bare "YYYY-MM-DD"
 * is read at local noon so it never shows as the day before in Canada.
 * @param {string | number | Date | null | undefined} d
 * @returns {string}
 */
export const fmtD = (d) => {
  if (!d || d === '—' || d === 'Invalid Date') return '—';
  let dt = new Date(d);
  if (isNaN(dt.getTime()) || (typeof d === 'string' && d.length === 10 && d.includes('-'))) {
    const noon = new Date(d + 'T12:00:00');
    if (!isNaN(noon.getTime())) dt = noon;
  }
  if (isNaN(dt.getTime())) return '—';
  return DATE_FMT_EN_GB.format(dt);
};

/**
 * A date and time in the viewer's own style, e.g. "2025-03-04 14:05" in
 * en-CA, or '' when there is no usable date.
 * @param {string | number | Date | null | undefined} value
 * @returns {string}
 */
export const fmtDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString() + ' ' + d.toTimeString().slice(0, 5);
};

/** @type {Intl.DateTimeFormatOptions} */
const LONG_DATE_OPTIONS = { year: 'numeric', month: 'long', day: 'numeric' };
const longDateFormats = new Map();

/**
 * A date written out in full, e.g. "March 4, 2025" (or "4 March 2025" in
 * en-GB), for printed pages and letters. `locale` undefined means the
 * viewer's own. An invalid date reads "Invalid Date", as toLocaleDateString
 * did, rather than throwing.
 * @param {Date} date
 * @param {string} [locale]
 * @returns {string}
 */
export function fmtLongDate(date, locale) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return 'Invalid Date';
  const key = locale || '';
  let format = longDateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, LONG_DATE_OPTIONS);
    longDateFormats.set(key, format);
  }
  return format.format(date);
}
