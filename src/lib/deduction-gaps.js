// Costs the business almost certainly had, and has no record of.
//
// The failure mode this exists for is the one nobody notices: an expense paid
// in cash at a fair, or on a card that never gets reconciled, or simply
// forgotten on the drive home. It never reaches the ledger, so at year end the
// business looks more profitable than it was and pays tax on money it spent.
// Nothing in the app can see that expense — by definition it was never entered.
//
// So this does not look for missing expenses. It looks for ACTIVITY THAT COSTS
// MONEY and asks whether the matching cost is there. That is the one advantage
// this app has over a general accounting package: it does not only know what
// was spent, it knows that four hundred dollars of books were sold at a fair in
// Toronto in June — and a fair with takings and no costs did not happen for
// free. The table was paid for. Somebody drove there.
//
// ── Two rules this file holds to ─────────────────────────────────────────────
//
// 1. NO TAX ADVICE. Nothing here says a cost is deductible, names a tax rate,
//    or estimates a refund. Deductibility is jurisdiction-specific, changes,
//    and is an accountant's call. Every finding is a statement about the
//    publisher's OWN RECORDS — "you took money here and recorded no costs" —
//    which is checkable and true regardless of which country they file in.
//
// 2. EVERY ESTIMATE COMES FROM THEIR OWN HISTORY. Where a figure is offered it
//    is the median of what they themselves spent on comparable things, never an
//    industry average this file invented. A made-up number in a financial tool
//    is worse than no number, because it will be believed.

import { canonicalExpenseCategory } from './expense-categories.js';
import { roundCents } from './money.js';

/** Channels that mean a sale happened face to face, where cash is likeliest. */
const IN_PERSON_CHANNELS = ['POS', 'Fair', 'Event', 'In Person'];

/** Below this, a gap is not worth interrupting anybody about. */
export const MIN_GAP_AMOUNT = 5;

/** How long a snooze lasts when no date is given. */
export const DEFAULT_SNOOZE_DAYS = 30;

const str = (v) => (v == null ? '' : String(v)).trim();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const iso = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A month a person would say out loud.
 *
 * "2026-04" is how the data stores it and how nobody reads it. This panel is
 * for somebody deciding whether they paid a bill in April, and making them
 * decode a date format first is friction on exactly the wrong step.
 */
function monthName(ym, withYear = false) {
  const [y, m] = str(ym).split('-').map(Number);
  const name = MONTH_NAMES[(m || 1) - 1] || str(ym);
  return withYear ? `${name} ${y}` : name;
}

/** "April", "April and July", "April, July and two others". */
function listMonths(months) {
  const names = months.map(m => monthName(m));
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
}

/** The middle value, which a single unusual month cannot drag around. */
function median(values) {
  const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/**
 * Every expense the business has, in one list, with its category folded onto
 * the canonical name so "Postage" and "Shipping & Postage" count as one thing.
 */
function allExpenses(ctx) {
  const out = [];
  for (const e of (ctx.taxCenter?.businessExpenses || [])) {
    if (e && !e.voided) out.push({ ...e, _scope: 'business', _cat: canonicalExpenseCategory(e.cat, 'Other') });
  }
  for (const [bookId, state] of Object.entries(ctx.states || {})) {
    for (const e of (state?.expenses || [])) {
      if (e && !e.voided) out.push({ ...e, _scope: 'book', _bookId: bookId, _cat: canonicalExpenseCategory(e.cat, 'Other') });
    }
  }
  return out;
}

/** What a row is worth, preferring the CAD figure stamped when it was written. */
const amountOf = (e) => num(e.baseAmount != null ? e.baseAmount : e.amount);

/** Every in-person sale, which is where cash costs cluster. */
function inPersonSales(ctx) {
  const rows = [];
  for (const [bookId, state] of Object.entries(ctx.states || {})) {
    for (const h of (state?.hist || [])) {
      if (!h || h.voided || h.gratuity || h.consignmentLink) continue;
      if (!IN_PERSON_CHANNELS.includes(str(h.chan))) continue;
      rows.push({
        bookId, date: str(h.date), qty: num(h.qty),
        revenue: roundCents(num(h.qty) * num(h.price ?? h.unitPrice)),
        notes: str(h.notes), num: str(h.num),
      });
    }
  }
  return rows;
}

// ── The detectors ────────────────────────────────────────────────────────────
//
// Each returns zero or more gaps. Each is a rule that can be checked and shown
// to be true, so a finding can always point at the rows behind it.
//
// Gap ids are derived from what the gap is ABOUT, never from its position in a
// list. A publisher who snoozes "the Toronto fair has no costs" must not have it
// reappear as a new item the next time the scan runs.

/**
 * A fair with takings and no costs at all.
 *
 * The strongest signal available here, and the one a general accounting package
 * cannot produce: it requires knowing that a sale happened AT an event. A fair
 * that earned money and cost nothing did not happen — the table was paid for.
 */
function eventsWithoutCosts(ctx) {
  const summary = ctx.tripsSummary || {};
  const sales = inPersonSales(ctx);
  const gaps = [];

  // What their own fairs typically cost, so the estimate is theirs and not
  // one this file invented.
  const spends = Object.values(summary).map(b => num(b?.total)).filter(v => v > 0);
  const typical = median(spends);

  for (const [name, bucket] of Object.entries(summary)) {
    const spent = num(bucket?.total);
    if (spent > 0) continue;

    const key = name.toLowerCase();
    const rec = bucket?.record || {};
    const from = str(rec.startDate);
    const to = str(rec.endDate);
    const matched = sales.filter(s => (
      (from && to && s.date >= from && s.date <= to)
      || (key && (s.notes.toLowerCase().includes(key) || s.num.toLowerCase().includes(key)))
    ));
    if (!matched.length) continue;

    const took = roundCents(matched.reduce((t, s) => t + s.revenue, 0));
    gaps.push({
      id: `event-no-costs:${name}`,
      kind: 'event-without-costs',
      category: 'Events & Exhibitions',
      title: `${name} has takings but no costs`,
      detail: `You recorded ${matched.length} ${matched.length === 1 ? 'sale' : 'sales'} worth ${took.toFixed(2)} at ${name}, `
        + 'and no expenses tagged to it. A table, a stall, parking or a meal usually gets paid for in cash and never makes it into the books.',
      estimate: typical > 0 ? roundCents(typical) : null,
      estimateBasis: typical > 0 ? 'what your other fairs have typically cost' : null,
      evidence: { salesCount: matched.length, salesTotal: took, trip: name },
      prompt: `What did ${name} cost you? Table fee, travel, parking, food.`,
    });
  }
  return gaps;
}

/**
 * A fair whose costs are recorded but with nothing for getting there.
 *
 * Somebody drove or took a train. That leg is the single most commonly
 * forgotten cost of an event, because the table fee arrives as an invoice and
 * the petrol does not.
 */
function eventsWithoutTravel(ctx) {
  const summary = ctx.tripsSummary || {};
  const gaps = [];
  const travelSpends = [];

  for (const bucket of Object.values(summary)) {
    const t = num(bucket?.categories?.['Travel & Meals']);
    if (t > 0) travelSpends.push(t);
  }
  const typical = median(travelSpends);

  for (const [name, bucket] of Object.entries(summary)) {
    const spent = num(bucket?.total);
    if (spent <= 0) continue;
    if (num(bucket?.categories?.['Travel & Meals']) > 0) continue;

    gaps.push({
      id: `event-no-travel:${name}`,
      kind: 'event-missing-travel',
      category: 'Travel & Meals',
      title: `Nothing recorded for getting to ${name}`,
      detail: `${name} has ${roundCents(spent).toFixed(2)} of costs against it but nothing for travel or meals. `
        + 'Petrol, a train fare or lunch on the day rarely comes with an invoice, so it is the easiest one to lose.',
      estimate: typical > 0 ? roundCents(typical) : null,
      estimateBasis: typical > 0 ? 'what travel to your other events has cost' : null,
      evidence: { trip: name, recordedCosts: roundCents(spent) },
      prompt: `How did you get to ${name}, and what did it cost?`,
    });
  }
  return gaps;
}

/**
 * A category they pay most months, missing from some.
 *
 * A subscription or a home-office cost does not stop for one month. A gap in an
 * otherwise steady run is far likelier to be an unlogged payment than a month
 * off, and this is the pattern a person is least able to spot by eye.
 */
function missingMonths(ctx) {
  const expenses = allExpenses(ctx).filter(e => str(e.date));
  const byCategory = new Map();

  for (const e of expenses) {
    const month = str(e.date).slice(0, 7);
    if (!month) continue;
    const bucket = byCategory.get(e._cat) || { months: new Map(), amounts: [] };
    bucket.months.set(month, (bucket.months.get(month) || 0) + amountOf(e));
    bucket.amounts.push(amountOf(e));
    byCategory.set(e._cat, bucket);
  }

  const gaps = [];
  for (const [category, bucket] of byCategory) {
    const months = [...bucket.months.keys()].sort();
    // Needs a real run before an absence means anything. Four separate months
    // is the point at which "most months" is a fair description.
    if (months.length < 4) continue;

    const first = months[0];
    const last = months[months.length - 1];
    const expected = monthsBetween(first, last);
    const missing = expected.filter(m => !bucket.months.has(m));
    if (!missing.length) continue;
    // A category present in fewer than two thirds of its own span is seasonal,
    // not steady, and its absences say nothing.
    if (bucket.months.size / expected.length < 0.66) continue;

    const typical = median([...bucket.months.values()]);
    if (typical < MIN_GAP_AMOUNT) continue;

    gaps.push({
      id: `missing-months:${category}`,
      kind: 'month-gap',
      category,
      title: `${category} is missing from ${missing.length} ${missing.length === 1 ? 'month' : 'months'}`,
      detail: `You recorded ${category.toLowerCase()} in ${bucket.months.size} of the ${expected.length} months between `
        + `${monthName(first, true)} and ${monthName(last, true)}, but nothing in ${listMonths(missing)}. `
        + 'A cost this regular rarely stops for a month.',
      estimate: roundCents(typical * missing.length),
      estimateBasis: `your own typical ${roundCents(typical).toFixed(2)} a month, across ${missing.length}`,
      evidence: { missingMonths: missing, monthsRecorded: bucket.months.size, monthsInSpan: expected.length },
      prompt: `Did you pay for ${category.toLowerCase()} in ${monthName(missing[0], true)}?`,
    });
  }
  return gaps;
}

/** Every YYYY-MM from one month to another, inclusive. */
function monthsBetween(first, last) {
  const out = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * Money taken online with no processing fee recorded against it.
 *
 * Card processors always take their cut. If sales went through and no fee was
 * ever logged, the fee was not free — it was netted off a payout and never
 * entered, which makes both the income and the cost wrong.
 */
function missingProcessingFees(ctx) {
  let onlineRevenue = 0;
  for (const state of Object.values(ctx.states || {})) {
    for (const h of (state?.hist || [])) {
      if (!h || h.voided || h.gratuity || h.consignmentLink) continue;
      if (!['Website', 'Big Cartel'].includes(str(h.chan))) continue;
      onlineRevenue += num(h.qty) * num(h.price ?? h.unitPrice);
    }
  }
  if (onlineRevenue <= 0) return [];

  const fees = allExpenses(ctx).filter(e => e._cat === 'Sales Processing Fees');
  if (fees.length) return [];

  return [{
    id: 'no-processing-fees',
    kind: 'missing-processing-fees',
    category: 'Sales Processing Fees',
    title: 'Online sales, but no processing fees recorded',
    detail: `You have ${roundCents(onlineRevenue).toFixed(2)} of website sales and no card or platform fees against them. `
      + 'Those fees come straight off the payout, so they are easy to never see — which also means the sale figure above is '
      + 'higher than what actually reached the bank.',
    // No invented percentage. What they were charged is on the payout
    // statement, and guessing a rate here would be a made-up number about money.
    estimate: null,
    estimateBasis: null,
    evidence: { onlineRevenue: roundCents(onlineRevenue) },
    prompt: 'Check a payout statement for the fee taken, and log it.',
  }];
}

/**
 * Books posted out with nothing recorded for postage.
 *
 * The app knows an order shipped. Stamps bought at a counter are the textbook
 * cash expense: no invoice, no card entry, nothing to reconcile against.
 */
function missingPostage(ctx) {
  let shipped = 0;
  for (const state of Object.values(ctx.states || {})) {
    for (const h of (state?.hist || [])) {
      if (!h || h.voided || h.gratuity) continue;
      if (['Website', 'Big Cartel'].includes(str(h.chan))) shipped += 1;
    }
    for (const e of (state?.ledger || [])) {
      if (e && !e.voided && e.type === 'Shipment') shipped += 1;
    }
  }
  if (shipped < 3) return [];

  const postage = allExpenses(ctx).filter(e => e._cat === 'Shipping & Postage');
  if (postage.length >= Math.ceil(shipped / 4)) return [];

  const typical = median(postage.map(amountOf));
  const unlogged = Math.max(0, shipped - postage.length);
  return [{
    id: 'postage-below-shipments',
    kind: 'missing-postage',
    category: 'Shipping & Postage',
    title: `${shipped} things posted, ${postage.length} postage ${postage.length === 1 ? 'cost' : 'costs'} recorded`,
    detail: 'Stamps and boxes bought over a counter leave no invoice and no card line to reconcile, '
      + 'so postage is the cost most often paid and never entered.',
    estimate: typical > 0 ? roundCents(typical * unlogged) : null,
    estimateBasis: typical > 0 ? `your own typical ${roundCents(typical).toFixed(2)} a time` : null,
    evidence: { shipments: shipped, postageEntries: postage.length },
    prompt: 'Add the postage you have paid at the counter this month.',
  }];
}

/**
 * A print run with no printing cost recorded against it.
 *
 * The largest single cost a small press has. If a book carries a print run and
 * nothing was ever logged for producing it, the book looks pure profit.
 */
function missingProductionCosts(ctx) {
  const printing = allExpenses(ctx).filter(e => e._cat === 'Printing & Production');
  const gaps = [];

  for (const [bookId, book] of Object.entries(ctx.books || {})) {
    if (num(book?.maxPrint) <= 0) continue;
    if (num(book?.productionCost) > 0) continue;      // recorded on the book itself
    const forBook = printing.filter(e => e._bookId === bookId);
    if (forBook.length) continue;

    gaps.push({
      id: `no-production-cost:${bookId}`,
      kind: 'missing-production-cost',
      category: 'Printing & Production',
      title: `No printing cost recorded for ${str(book.title) || bookId}`,
      detail: `${str(book.title) || bookId} has a print run of ${num(book.maxPrint)} copies and no production cost against it, `
        + 'so every copy it sells currently looks like pure profit. It is usually the biggest single cost a title has.',
      estimate: null,
      estimateBasis: null,
      evidence: { bookId, printRun: num(book.maxPrint) },
      prompt: `What did printing ${str(book.title) || bookId} cost?`,
    });
  }
  return gaps;
}

/**
 * Books with ISBNs and no record of paying for any.
 *
 * Small, but exactly the kind of one-off administrative fee that is paid once,
 * by card, years ago, and never categorised.
 */
function missingIsbnCosts(ctx) {
  const withIsbn = Object.values(ctx.books || {})
    .filter(b => b && str(b.isbn) && str(b.isbn) !== '—').length;
  if (withIsbn < 2) return [];
  if (allExpenses(ctx).some(e => e._cat === 'ISBN, Barcodes & Cataloging')) return [];

  return [{
    id: 'no-isbn-costs',
    kind: 'missing-isbn-costs',
    category: 'ISBN, Barcodes & Cataloging',
    title: `${withIsbn} books have ISBNs, none were paid for`,
    detail: 'Registration and barcode fees are paid once and rarely categorised afterwards, '
      + 'so they sit in a bank statement somewhere and never in the books.',
    estimate: null,
    estimateBasis: null,
    evidence: { booksWithIsbn: withIsbn },
    prompt: 'Add what you paid to register ISBNs.',
  }];
}

const DETECTORS = [
  eventsWithoutCosts,
  eventsWithoutTravel,
  missingMonths,
  missingProcessingFees,
  missingPostage,
  missingProductionCosts,
  missingIsbnCosts,
];

// ── Snoozing and dismissing ──────────────────────────────────────────────────

/**
 * What the publisher has already said about a gap.
 *
 * Stored against the gap's stable id, so a snooze survives a re-scan. Without
 * this the same finding reappears every time and the whole panel becomes
 * something to ignore.
 */
export function gapNoteState(note, today) {
  if (!note) return 'open';
  if (note.status === 'dismissed') return 'dismissed';
  if (note.status === 'snoozed') return str(note.until) > today ? 'snoozed' : 'open';
  return 'open';
}

/** A snooze date, from a day count. */
export function snoozeUntil(days = DEFAULT_SNOOZE_DAYS, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + Math.max(1, Math.round(days)));
  return iso(d);
}

// ── The scan ─────────────────────────────────────────────────────────────────

/**
 * Every gap worth raising, biggest first.
 *
 * Ordered by what it is likely to be worth, because a list nobody can rank is a
 * list nobody works through. A gap with no estimate ranks below every gap that
 * has one — not because it matters less, but because "we cannot say" is not a
 * reason to put it at the top of somebody's day.
 *
 * @param {object} ctx  { books, states, taxCenter, tripsSummary, today }
 * @returns {{gaps, hidden, totalEstimate, scannedAt}}
 */
export function findDeductionGaps(ctx = {}) {
  const today = str(ctx.today) || iso(new Date());
  const notes = ctx.taxCenter?.deductionNotes || {};

  let found = [];
  for (const detect of DETECTORS) {
    try {
      found = found.concat(detect(ctx) || []);
    } catch (_) {
      // One detector failing must not cost the publisher the other six.
    }
  }

  const open = [];
  let hidden = 0;
  for (const gap of found) {
    if (gap.estimate != null && gap.estimate < MIN_GAP_AMOUNT) continue;
    const state = gapNoteState(notes[gap.id], today);
    if (state === 'open') open.push({ ...gap, state });
    else hidden += 1;
  }

  open.sort((a, b) => {
    const ae = a.estimate == null ? -1 : a.estimate;
    const be = b.estimate == null ? -1 : b.estimate;
    return be - ae || a.title.localeCompare(b.title);
  });

  return {
    gaps: open,
    hidden,
    totalEstimate: roundCents(open.reduce((t, g) => t + (g.estimate || 0), 0)),
    scannedAt: today,
    note: 'Each of these is a gap in your own records — activity that costs money with no cost recorded against it. '
      + 'Estimates are the middle of what you have spent on comparable things before, never an industry figure. '
      + 'This is not tax advice — whether a cost can be claimed is a question for your accountant.',
  };
}
