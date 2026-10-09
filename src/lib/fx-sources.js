// Where exchange rates come from, and how each service's answer is read.
//
// Frankfurter (the European Central Bank's daily reference rates) moved to
// api.frankfurter.dev in December 2024, and its current server only answers
// under /v1 and /v2. The old api.frankfurter.app paths the app kept calling
// stopped returning rates, so every Stripe sale in another currency came up
// with no rate at all. v1 answers in the same shape the app always read, and
// the project keeps it available indefinitely.
//
// A second, independent service is asked for a dated rate when Frankfurter
// can't answer, so one service being down doesn't stop a sale from
// converting. Both give the rate for the date asked: neither ever stands in
// today's rate for a past payment.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const FRANKFURTER_API = 'https://api.frankfurter.dev/v1';

/** A Frankfurter v1 request: `path` is `latest`, a date, or `start..end`. */
export function frankfurterUrl(path, from, to) {
  return `${FRANKFURTER_API}/${path}?from=${from}&to=${to}`;
}

const positive = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const dayOf = json => (ISO_DAY.test(json?.date || '') ? json.date : '');

/**
 * Asked in order for the rate on one date. Each `read` returns
 * { rate, date } — `date` being the day the rate is actually from — or null.
 */
export const DATED_RATE_SOURCES = [
  {
    name: 'Frankfurter',
    url: (from, to, date) => frankfurterUrl(date, from, to),
    // { amount, base, date, rates: { CAD: 1.6 } }. On a weekend, a holiday, or
    // today before the day's rates are out, `date` is the last business day.
    read: (json, from, to) => {
      const rate = positive(json?.rates?.[to]);
      return rate ? { rate, date: dayOf(json) } : null;
    },
  },
  {
    name: 'Currency API',
    // Published once a day as a package version named after the date, with
    // lower-case codes: { date, eur: { cad: 1.6, … } }.
    url: (from, to, date) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${from.toLowerCase()}.json`,
    read: (json, from, to) => {
      const rate = positive(json?.[from.toLowerCase()]?.[to.toLowerCase()]);
      return rate ? { rate, date: dayOf(json) } : null;
    },
  },
];
