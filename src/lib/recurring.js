/**
 * recurring.js — the schedule maths behind Tax Centre → Recurring Subscriptions.
 *
 * Everything here is pure: no DOM, no TAX_CENTER, no Firestore. The Tax Centre
 * feature module owns the rendering and the writes; this module owns the
 * question "which charges has this subscription incurred, and when is the next
 * one?" — which is the part that has to be right, works offline, and is worth
 * testing directly.
 *
 * Why a module at all: the injector used to live inline in
 * processRecurringExpenses() as a month-walking `while` loop that assumed every
 * subscription bills monthly, forever, starting on `new Date(startDate)`. Three
 * problems came out of that shape:
 *
 *   1. `new Date('2026-01-05')` parses as UTC midnight, so `.getDate()` in any
 *      negative-offset timezone (this app's users are in Canada) reports the
 *      4th. Every injected charge silently landed a day early. Dates here are
 *      parsed field-by-field instead, so a 'YYYY-MM-DD' string means the same
 *      calendar day everywhere.
 *   2. A yearly subscription had to be entered as 1/12th of its price to total
 *      correctly, which then logged twelve wrong-looking expenses a year.
 *   3. There was no way to stop one short of deleting it, and deleting it threw
 *      away the record of what had already been injected.
 *
 * Cadence, an end date, and a paused flag all now live on the record; the ledger
 * behaviour for an existing monthly subscription with none of those fields set
 * is unchanged apart from the timezone fix.
 *
 * `rateChanges` is the fourth field, and the reason is the same shape of
 * problem: a standing cost's price moves (rent goes up in September, a plan
 * re-prices at renewal), and the only way to record that was to overwrite
 * `amount`. That is wrong in both directions — a backfill after the edit posts
 * old periods at the new price, and the record loses any memory of what the
 * cost used to be. A subscription now carries `amount` as the price it started
 * at plus a dated list of adjustments, and every charge is priced by the date it
 * falls on, so history stays exactly as it was billed and a rise can be entered
 * before it takes effect.
 */

/** Supported billing cadences, in the order the editor lists them. */
export const RECURRING_FREQUENCIES = [
  { id: 'monthly', months: 1, label: 'Monthly', short: 'Monthly', per: '/mo' },
  { id: 'quarterly', months: 3, label: 'Quarterly — every 3 months', short: 'Quarterly', per: '/qtr' },
  { id: 'semiannual', months: 6, label: 'Twice a year — every 6 months', short: 'Twice a year', per: '/6mo' },
  { id: 'annual', months: 12, label: 'Yearly', short: 'Yearly', per: '/yr' },
];

const FREQ_BY_ID = new Map(RECURRING_FREQUENCIES.map(f => [f.id, f]));

/** Months between charges. Unknown/missing cadence falls back to monthly. */
export function frequencyMonths(frequency) {
  return FREQ_BY_ID.get(frequency)?.months || 1;
}

/** Human label for a cadence ('Yearly'), for pills and table cells. */
export function frequencyLabel(frequency) {
  return FREQ_BY_ID.get(frequency)?.short || 'Monthly';
}

/** Suffix for an amount rendered at its own cadence ('/yr'). */
export function frequencySuffix(frequency) {
  return FREQ_BY_ID.get(frequency)?.per || '/mo';
}

/**
 * Parse 'YYYY-MM-DD' into {y, m, d} with m 1-indexed, without going through
 * Date — see the timezone note at the top of this file. Returns null for
 * anything that isn't a well-formed, real calendar date.
 */
export function parseYmd(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

/** Days in a 1-indexed month, leap years included. */
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

const pad2 = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM' key — the granularity `lastInjected` has always been stored at. */
export function monthKey(year, month) {
  return `${year}-${pad2(month)}`;
}

/** 'YYYY-MM-DD' from parts. */
export function ymd(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Local calendar day of a Date as 'YYYY-MM-DD' (never UTC-shifted). */
export function localYmd(date = new Date()) {
  return ymd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

let _idCounter = 0;
/** Stable-enough id for a subscription that predates the id field. */
export function newRecurringId() {
  _idCounter = (_idCounter + 1) % 1000;
  return `rec_${Date.now().toString(36)}${_idCounter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Fill in the fields older records don't have, without mutating the input.
 * Every read path goes through this so the rest of the code can assume the
 * modern shape; the writes in taxcentre.js persist the normalized record so a
 * record only needs migrating once.
 */
export function normalizeRecurring(sub) {
  const s = sub || {};
  return {
    ...s,
    rateChanges: normalizeRateChanges(s.rateChanges),
    id: s.id || '',
    desc: String(s.desc || '').trim(),
    cat: s.cat || 'Other',
    currency: s.currency || 'CAD',
    amount: Number(s.amount) || 0,
    startDate: s.startDate || '',
    endDate: s.endDate || '',
    frequency: FREQ_BY_ID.has(s.frequency) ? s.frequency : 'monthly',
    paused: !!s.paused,
    vendor: String(s.vendor || '').trim(),
    notes: String(s.notes || '').trim(),
    lastInjected: s.lastInjected || '',
  };
}

/**
 * Clean a stored price-adjustment list into the shape the rest of the module
 * assumes: dated, positive, sorted oldest-first, one entry per date (a later
 * entry for the same day wins, which is what re-saving a corrected figure in
 * the editor means). Anything undated or non-positive is dropped rather than
 * kept as a landmine — a change with no date can't price a charge.
 */
export function normalizeRateChanges(list) {
  const byDate = new Map();
  (Array.isArray(list) ? list : [])
    .map(r => ({
      effectiveFrom: String(r?.effectiveFrom || '').trim(),
      amount: Number(r?.amount) || 0,
      note: String(r?.note || '').trim(),
    }))
    .filter(r => parseYmd(r.effectiveFrom) && r.amount > 0)
    .forEach(r => byDate.set(r.effectiveFrom, r));
  return [...byDate.values()].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/** Price in force on `dateStr`, from an already-normalized record. */
function amountAt(s, dateStr) {
  let amount = s.amount;
  for (const r of s.rateChanges) {
    if (r.effectiveFrom <= dateStr) amount = r.amount;
    else break;
  }
  return amount;
}

/**
 * What this subscription costs for a charge dated `dateStr` — the starting
 * amount until the first adjustment takes effect, then each adjustment from its
 * own effective date onward. This is what prices both the backfill and any
 * future charge, so a September rent rise never touches an August charge.
 */
export function amountOnDate(sub, dateStr) {
  return amountAt(normalizeRecurring(sub), dateStr);
}

/** The price being charged today. */
export function currentAmount(sub, now = new Date()) {
  return amountOnDate(sub, localYmd(now));
}

/**
 * The next scheduled adjustment, or null when the price is settled.
 * `from` is the price in force today, `to` the price it becomes, and `delta`
 * the difference — enough for a row to read "→ CA$350.00 from 2026-09-01".
 */
export function nextRateChange(sub, now = new Date()) {
  const s = normalizeRecurring(sub);
  const todayStr = localYmd(now);
  const upcoming = s.rateChanges.find(r => r.effectiveFrom > todayStr);
  if (!upcoming) return null;
  const from = amountAt(s, todayStr);
  return { ...upcoming, from, to: upcoming.amount, delta: upcoming.amount - from };
}

/**
 * The full price history as display rows, oldest first: the opening amount
 * followed by every adjustment. Used by the editor so the owner can see what
 * the cost used to be, not just what it is now.
 */
export function rateSchedule(sub) {
  const s = normalizeRecurring(sub);
  return [
    { effectiveFrom: s.startDate || '', amount: s.amount, note: '', opening: true },
    ...s.rateChanges.map(r => ({ ...r, opening: false })),
  ].sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
}

/**
 * Walk a subscription's billing dates in order, calling `visit(date, key)` for
 * each. Stops when `visit` returns false, at the end date, or after a hard cap
 * so a malformed record can never spin the render loop.
 */
function walkCharges(sub, visit) {
  const start = parseYmd(sub.startDate);
  if (!start) return;
  const step = frequencyMonths(sub.frequency);
  let y = start.y, m = start.m;
  for (let i = 0; i < 1200; i++) {
    const dateStr = ymd(y, m, Math.min(start.d, daysInMonth(y, m)));
    if (sub.endDate && dateStr > sub.endDate) return;
    if (visit(dateStr, monthKey(y, m)) === false) return;
    m += step;
    while (m > 12) { m -= 12; y += 1; }
  }
}

/**
 * The charges a subscription owes the ledger as of `now`: every billing date
 * that has actually arrived and hasn't been injected yet.
 *
 * Two guards that the old inline loop lacked:
 *   - a charge dated in the future is never injected, so a subscription that
 *     bills on the 28th doesn't inflate the current month from the 1st;
 *   - a paused subscription owes nothing, and resuming does not backfill the
 *     gap (resumeRecurring in taxcentre.js rolls `lastInjected` forward).
 *
 * Each charge carries the `amount` in force on its own date, so a run of missed
 * periods spanning a price change posts each one at what it actually cost.
 */
export function recurringDueCharges(sub, now = new Date()) {
  const s = normalizeRecurring(sub);
  const due = [];
  if (s.paused || (!s.amount && !s.rateChanges.length)) return due;
  const todayStr = localYmd(now);
  walkCharges(s, (dateStr, key) => {
    if (dateStr > todayStr) return false;
    const amount = amountAt(s, dateStr);
    if (key > s.lastInjected && amount > 0) due.push({ date: dateStr, monthKey: key, amount });
    return true;
  });
  return due;
}

/**
 * The billing date of the most recent period already posted to the ledger, or
 * '' when nothing has been. `lastInjected` is stored at month granularity, so
 * the day is re-derived from the schedule — which is what lets the editor tell
 * the difference between a price change that lands on an untouched charge and
 * one backdated behind a charge the ledger already has.
 */
export function lastPostedChargeDate(sub) {
  const s = normalizeRecurring(sub);
  if (!s.lastInjected) return '';
  let last = '';
  walkCharges(s, (dateStr, key) => {
    if (key > s.lastInjected) return false;
    last = dateStr;
    return true;
  });
  return last;
}

/**
 * The next date this subscription will bill, or null when it has ended (or is
 * paused, or has no valid start date). Skips a period already injected this
 * month so a charge logged this morning doesn't still read as "due today".
 */
export function nextRecurringDate(sub, now = new Date()) {
  const s = normalizeRecurring(sub);
  if (s.paused) return null;
  const todayStr = localYmd(now);
  let next = null;
  walkCharges(s, (dateStr, key) => {
    if (dateStr < todayStr || key <= s.lastInjected) return true;
    next = dateStr;
    return false;
  });
  return next;
}

/**
 * Lifecycle state for the status pill:
 *   'paused'    — deliberately held; no charges accrue
 *   'ended'     — past its end date, kept for the record
 *   'scheduled' — starts in the future, nothing injected yet
 *   'invalid'   — no usable start date (legacy row); shown so it can be fixed
 *   'active'    — billing now
 */
export function recurringStatus(sub, now = new Date()) {
  const s = normalizeRecurring(sub);
  if (s.paused) return 'paused';
  const start = parseYmd(s.startDate);
  if (!start) return 'invalid';
  const todayStr = localYmd(now);
  if (s.endDate && s.endDate < todayStr) return 'ended';
  if (s.startDate > todayStr) return 'scheduled';
  return 'active';
}

/**
 * Cost per month in the subscription's own currency (yearly ÷ 12, etc.), at the
 * price in force on `now` — an adjustment dated next month doesn't inflate this
 * month's committed total.
 */
export function monthlyEquivalent(sub, now = new Date()) {
  const s = normalizeRecurring(sub);
  return amountAt(s, localYmd(now)) / frequencyMonths(s.frequency);
}

/** Cost per month priced as of a given 'YYYY-MM-DD'. */
export function monthlyEquivalentOn(sub, dateStr) {
  const s = normalizeRecurring(sub);
  return amountAt(s, dateStr) / frequencyMonths(s.frequency);
}

/** Whether a subscription is still costing money as of `now`. */
export function isRecurringLive(sub, now = new Date()) {
  return recurringStatus(sub, now) === 'active' || recurringStatus(sub, now) === 'scheduled';
}

/**
 * Roll up a list of subscriptions into the numbers the card header shows.
 *
 * `rates` is the app's `_fxRateCache`, keyed 'USD_CAD'. A currency with no
 * cached rate is counted at 1:1 *and* named in `unconverted`, so the UI can say
 * the total is approximate rather than quietly under-reporting it — the same
 * posture the rest of the Tax Centre takes when a rate is missing offline.
 */
export function summarizeRecurring(subs, rates = {}, base = 'CAD', now = new Date()) {
  const out = {
    monthlyBase: 0, annualBase: 0,
    activeCount: 0, pausedCount: 0, endedCount: 0, scheduledCount: 0,
    unconverted: [], nextUp: null,
    upcomingChange: null, monthlyBaseAfterChange: 0,
  };
  const seenMissing = new Set();
  const live = [];
  (subs || []).forEach(raw => {
    const s = normalizeRecurring(raw);
    const status = recurringStatus(s, now);
    if (status === 'paused') out.pausedCount++;
    else if (status === 'ended') out.endedCount++;
    else if (status === 'scheduled') out.scheduledCount++;
    else if (status === 'active') out.activeCount++;

    if (status === 'active' || status === 'scheduled') {
      const cur = s.currency || base;
      let rate = 1;
      if (cur !== base) {
        const cached = Number(rates[`${cur}_${base}`]);
        if (cached > 0) rate = cached;
        else if (!seenMissing.has(cur)) { seenMissing.add(cur); out.unconverted.push(cur); }
      }
      live.push({ sub: s, rate });
      out.monthlyBase += monthlyEquivalent(s, now) * rate;

      // The soonest price rise or cut across the whole panel, so the header can
      // warn about it before the ledger does.
      const change = nextRateChange(s, now);
      if (change && (!out.upcomingChange || change.effectiveFrom < out.upcomingChange.date)) {
        out.upcomingChange = {
          date: change.effectiveFrom, sub: s,
          from: change.from, to: change.to, delta: change.delta,
        };
      }
    }

    const next = nextRecurringDate(s, now);
    if (next && (!out.nextUp || next < out.nextUp.date)) {
      out.nextUp = { date: next, sub: s, amount: amountAt(s, next) };
    }
  });

  // What the monthly commitment becomes once that change lands — everything
  // else held constant, so the two figures are comparable.
  if (out.upcomingChange) {
    const after = live.reduce((sum, l) => sum + monthlyEquivalentOn(l.sub, out.upcomingChange.date) * l.rate, 0);
    out.monthlyBaseAfterChange = Math.round((after + Number.EPSILON) * 100) / 100;
  }
  out.monthlyBase = Math.round((out.monthlyBase + Number.EPSILON) * 100) / 100;
  out.annualBase = Math.round((out.monthlyBase * 12 + Number.EPSILON) * 100) / 100;
  return out;
}

/**
 * "in 12 days" / "today" / "tomorrow" / "3 days ago" for a 'YYYY-MM-DD' date.
 * Compared as whole calendar days in local time, so it never reads "in 0 days".
 */
export function relativeDayLabel(dateStr, now = new Date()) {
  const p = parseYmd(dateStr);
  if (!p) return '';
  const target = new Date(p.y, p.m - 1, p.d);
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target - todayLocal) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 0) return days < 45 ? `in ${days} days` : `in ${Math.round(days / 30)} months`;
  return `${Math.abs(days)} days ago`;
}
