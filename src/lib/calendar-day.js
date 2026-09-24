// Day arithmetic shared by the order follow-up rules.
//
// Ledger rows carry dates as `YYYY-MM-DD` strings, sometimes with a time
// tacked on. Comparing "how many days ago" needs the calendar day only, so
// anything after the first ten characters is ignored.

export const DAY_MS = 86400000;

/** Midnight UTC of the row's calendar day, or NaN when it has no usable date. */
export function dayMs(value) {
  const parsed = Date.parse(String(value || '').slice(0, 10));
  return Number.isFinite(parsed) ? parsed : NaN;
}
