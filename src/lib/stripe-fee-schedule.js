// When to go and ask Stripe what its fees came to.
//
// The Tax Centre already knows how to pull Stripe's fees and file them: one
// expense row per year and currency, upserted by a stable reference, so
// re-running refreshes the year's running total rather than duplicating it.
// What it never had was anyone to press the button. This is the half that
// decides when — pure, so every rule below can be tested without a network, a
// clock, or a Stripe key.
//
// Two obligations, not one:
//
//   1. Every fortnight, so the year's figure is never badly out of date.
//   2. Whenever a calendar year has ended since the last run.
//
// The second is the one that matters for the books, and it is not the same as
// "run on the 31st of December". This app is a web page: it cannot run on a day
// nobody opens it. So the rule is not "run on Dec 31" but "never let a year end
// without a run covering it" — if the app is opened on the 3rd of January
// having last run in December, that run is owed immediately, and it is owed
// because of what the filing code does with a closed year rather than a
// current one: it re-dates the row to the 31st of December and re-prices the
// currency conversion at the year-end rate. Miss it and last year's fees stay
// stamped with a date in the middle of December and whatever the exchange rate
// happened to be that morning.

/** A fortnight. The publisher asked for every two weeks. */
export const STRIPE_FEE_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

/** The calendar year a moment falls in, read locally — a tax year is local. */
export function yearOf(when) {
  const d = new Date(Number(when) || 0);
  return Number.isFinite(d.getTime()) ? d.getFullYear() : 0;
}

/** Whether this moment is the last day of a year. */
export function isYearEndDay(when) {
  const d = new Date(Number(when) || 0);
  return d.getMonth() === 11 && d.getDate() === 31;
}

/** Whether two moments fall on the same calendar day. */
export function sameDay(a, b) {
  const x = new Date(Number(a) || 0);
  const y = new Date(Number(b) || 0);
  return x.getFullYear() === y.getFullYear()
    && x.getMonth() === y.getMonth()
    && x.getDate() === y.getDate();
}

/**
 * Is a run owed, and why?
 *
 * Returns `{ due, reason }`. The reason is not decoration — the caller says it
 * out loud, because "your books just closed a year" and "a fortnight went by"
 * are different news, and one of them the publisher will want to check.
 *
 * Order matters: the year-end reasons are tested first, so a run that is owed
 * for both reasons is reported as the one that matters to an accountant.
 */
export function dueForFeeSweep({ lastRunAt = 0, now = Date.now(), intervalMs = STRIPE_FEE_INTERVAL_MS } = {}) {
  const last = Number(lastRunAt) || 0;

  // Never run before: owed now, whatever the date.
  if (!last) return { due: true, reason: 'first-run' };

  // A year has ended since the last run. Owed immediately, however recently
  // that run was — a run on the 28th of December does not close the year.
  if (yearOf(last) < yearOf(now)) return { due: true, reason: 'year-boundary' };

  // It is the 31st and today has not been done yet. This is the happy path the
  // publisher pictured: the app happens to be open, so the year closes on the
  // day rather than in January.
  if (isYearEndDay(now) && !sameDay(last, now)) return { due: true, reason: 'year-end-day' };

  const interval = Math.max(0, Number(intervalMs) || 0);
  if (interval > 0 && (Number(now) - last) >= interval) return { due: true, reason: 'interval' };

  return { due: false, reason: '' };
}

/**
 * The earliest year an automatic run needs to ask Stripe about.
 *
 * The manual tool asks for every balance transaction the account has ever had,
 * which is fine for something pressed once a quarter and wasteful for something
 * running on its own. A year's total has to be rebuilt from that whole year, so
 * the window cannot be "since the last run" — but it can start at the first of
 * January of the earliest year still being written to, which for a fortnightly
 * job is almost always the current one.
 *
 * Older years are left exactly as they are. They were closed and filed already,
 * and a background job is for keeping the books current, not for quietly
 * restating history.
 */
export function feeSweepFromYear({ lastRunAt = 0, now = Date.now() } = {}) {
  const current = yearOf(now);
  const last = Number(lastRunAt) || 0;
  // No run on record: reach back one year, so a boundary crossed before this
  // was ever switched on still gets closed properly.
  if (!last) return current - 1;
  return Math.min(yearOf(last), current);
}

/** The first instant of a year, as a timestamp. */
export function startOfYear(year) {
  return new Date(Number(year) || 0, 0, 1, 0, 0, 0, 0).getTime();
}

/**
 * What to say once it has filed something.
 *
 * Returns null when a run wrote nothing, which is the ordinary fortnightly
 * outcome for a quiet shop and must not raise a card.
 */
export function describeFeeSweep({ inserted = 0, updated = 0, totalCad = 0, reason = '' } = {}) {
  if (!inserted && !updated) return null;

  const money = `${Number(totalCad || 0).toFixed(2)} CAD`;
  if (reason === 'year-boundary' || reason === 'year-end-day') {
    const closing = reason === 'year-boundary' ? 'last year' : 'this year';
    return {
      title: 'Stripe fees closed off for the year',
      detail: `${money} in card fees is now filed against ${closing}, dated the 31st of December and converted at that day's rate.`,
      yearEnd: true,
    };
  }

  const what = inserted && updated
    ? `${inserted} added, ${updated} brought up to date`
    : (inserted ? `${inserted} added` : `${updated} brought up to date`);
  return {
    title: 'Stripe fees updated',
    detail: `${money} in card fees on your sales — ${what}.`,
    yearEnd: false,
  };
}
