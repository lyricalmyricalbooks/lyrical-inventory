// The read API the Intelligence panel hands to the model.
//
// Every tool here is a THIN WRAPPER over an aggregation the app already trusts
// — inventoryBreakdown, expenseLedgerTotals, canonicalExpenseCategory, the tax
// centre's own cross-book ledger. None of them recompute the business's money.
// That is deliberate and it is the whole safety argument for this feature: if
// the panel disagreed with the Tax Centre about a figure, the panel would be
// wrong, and nobody would know which. Wrapping the same functions the screens
// use means an answer here and the screen it came from cannot drift apart.
//
// This module is a leaf: it imports only from src/lib, never from main.js or a
// feature. Anything it needs from up there (the cross-book ledger builder, the
// trips rollup, recognised revenue) arrives on `ctx`, injected by
// src/features/intel.js. That is what makes the whole tool surface testable
// against fixtures with no DOM and no Firebase.
//
// Nothing in here writes. proposeCorrection is the closest it comes, and all it
// does is validate that a change is possible and describe it — the publisher
// approves it in the panel, and the panel writes through the app's ordinary
// save path.

import { canonicalExpenseCategory } from './expense-categories.js';
import { expenseLedgerTotals } from './expense-totals.js';
import { deriveOnHand, deriveStockBreakdown, inventoryBreakdown } from './inventory.js';
import { calculateBreakEven } from './breakeven.js';
import { channelMixRows } from './channel-mix.js';
import { filterHistoryRows } from './order-history-search.js';
import { getBookCurrencyCode, normalizeCurrencyCode, roundCents } from './money.js';

// How many individual rows any one tool may hand back.
//
// Totals are ALWAYS computed over the whole match set and only the row list is
// cut — a truncated total would be a wrong answer about money, delivered with
// no sign that it was wrong. Every capped result says so in `truncated` and
// reports how many rows it matched, so the model can say "of 412 rows" rather
// than quietly describing 200 of them as if they were all of them.
export const MAX_TOOL_ROWS = 200;

// What the app calls a sale made face to face. Kept in step with the channel
// badge mapping in main.js (renderHist's `ch-badge` branch) — these four all
// render as "In Person" there, and a fair or market sale lands under one of
// them.
export const IN_PERSON_CHANNELS = ['POS', 'Fair', 'Event', 'In Person'];

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const lower = (v) => str(v).trim().toLowerCase();

/** ISO dates sort as text, so a plain string compare is a date compare here. */
function inDateRange(date, from, to) {
  const d = str(date);
  if (!d) return !from && !to;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/**
 * Cut a row list to the cap while reporting the true size.
 *
 * `matched` is the real count and never the length of what came back. Callers
 * pass totals they computed over the FULL set, before this is called.
 */
function capRows(rows) {
  const matched = rows.length;
  return {
    rows: rows.slice(0, MAX_TOOL_ROWS),
    matched,
    returned: Math.min(matched, MAX_TOOL_ROWS),
    truncated: matched > MAX_TOOL_ROWS,
  };
}

/** Sum into a per-currency map without ever converting between currencies. */
function addToCurrency(map, code, fields) {
  const key = normalizeCurrencyCode(code, 'CAD');
  let bucket = map.get(key);
  if (!bucket) { bucket = { code: key, units: 0, revenue: 0, count: 0 }; map.set(key, bucket); }
  for (const [k, v] of Object.entries(fields)) bucket[k] = (bucket[k] || 0) + v;
  bucket.count += 1;
  return bucket;
}

function currencyTotals(map) {
  return [...map.values()]
    // Round the accumulated figure rather than each addition, matching what
    // expenseLedgerTotals does — a few hundred rows of cents must not drift.
    .map(b => ({ ...b, revenue: roundCents(b.revenue) }))
    .sort((a, b) => (b.revenue - a.revenue) || (a.code < b.code ? -1 : 1));
}

/** The books this call is about: one if named, otherwise all of them. */
function selectedBooks(ctx, bookId) {
  const books = ctx.books || {};
  if (bookId && books[bookId]) return [[bookId, books[bookId]]];
  return Object.entries(books);
}

function stateFor(ctx, bookId) {
  return (ctx.states || {})[bookId] || null;
}

// ── SALES ────────────────────────────────────────────────────────────────────

/**
 * Classify a book's sales exactly the way inventoryBreakdown does.
 *
 * This is the one rule in the whole file worth stating twice: a consignment
 * sale is recorded in BOTH places — canonically as a `Sale` row on the store
 * ledger, and mirrored into history carrying `consignmentLink` so the History
 * tab can show it. Counting both double-counts the money. The ledger row is the
 * canonical one (it carries the publisher's actual cut in `amountDue`, after
 * the store's commission), so history mirrors are skipped here, matching
 * activity-feed.js and inventoryBreakdown.
 */
function salesRowsForBook(ctx, bookId, book, args) {
  const s = stateFor(ctx, bookId);
  if (!s) return [];
  const cur = getBookCurrencyCode(book);
  const wantChannel = lower(args.channel);
  const out = [];

  for (const h of (s.hist || [])) {
    if (!h || h.voided) continue;
    if (h.consignmentLink) continue;           // the ledger row below is the real one
    if (h.gratuity && !args.includeGratuities) continue;
    if (!inDateRange(h.date, args.dateFrom, args.dateTo)) continue;
    const chan = str(h.chan) || 'Direct';
    if (wantChannel && lower(chan) !== wantChannel) continue;
    const qty = num(h.qty);
    const price = num(h.price ?? h.unitPrice);
    out.push({
      bookId, book: str(book.title), date: str(h.date), channel: chan,
      kind: h.gratuity ? 'gratuity' : 'direct',
      orderNum: str(h.num), qty,
      unitPrice: h.gratuity ? 0 : price,
      revenue: h.gratuity ? 0 : roundCents(qty * price),
      currency: normalizeCurrencyCode(h.cur, cur),
      notes: str(h.notes),
    });
  }

  for (const e of (s.ledger || [])) {
    if (!e || e.voided || e.type !== 'Sale') continue;
    if (!inDateRange(e.date, args.dateFrom, args.dateTo)) continue;
    if (wantChannel && wantChannel !== 'consignment' && wantChannel !== 'store') continue;
    const qty = num(e.qty);
    out.push({
      bookId, book: str(book.title), date: str(e.date), channel: 'Consignment',
      kind: 'consignment',
      store: str(e.storeName), qty,
      // The publisher's cut after the store's commission, which is what
      // "revenue" means for a consignment sale — not the shelf price.
      revenue: roundCents(num(e.amountDue)),
      unitPrice: qty > 0 ? roundCents(num(e.amountDue) / qty) : 0,
      currency: normalizeCurrencyCode(e.cur, cur),
      paid: str(e.paid) || str(e.status),
      notes: str(e.notes),
    });
  }

  return out;
}

function querySales(args = {}, ctx = {}) {
  let rows = [];
  for (const [bookId, book] of selectedBooks(ctx, args.bookId)) {
    rows = rows.concat(salesRowsForBook(ctx, bookId, book, args));
  }

  if (args.text) {
    // Reuse the History tab's own matcher so "what did I sell at Word on the
    // Street" finds exactly the rows that screen would show for that search.
    rows = filterHistoryRows(
      rows.map(r => ({ ...r, chan: r.channel, num: r.orderNum, price: r.unitPrice })),
      args.text
    ).map(({ chan: _c, num: _n, price: _p, ...rest }) => rest);
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const byCurrency = new Map();
  const byChannel = new Map();
  const byBook = new Map();
  for (const r of rows) {
    addToCurrency(byCurrency, r.currency, { units: r.qty, revenue: r.revenue });
    const ch = byChannel.get(r.channel) || { channel: r.channel, units: 0, revenue: 0, count: 0, currencies: new Set() };
    ch.units += r.qty; ch.revenue += r.revenue; ch.count += 1; ch.currencies.add(r.currency);
    byChannel.set(r.channel, ch);
    const bk = byBook.get(r.bookId) || { bookId: r.bookId, book: r.book, units: 0, revenue: 0, currency: r.currency };
    bk.units += r.qty; bk.revenue += r.revenue;
    byBook.set(r.bookId, bk);
  }

  const capped = capRows(rows);
  return {
    totalsByCurrency: currencyTotals(byCurrency),
    byChannel: [...byChannel.values()]
      .map(c => ({ ...c, revenue: roundCents(c.revenue), currencies: [...c.currencies] }))
      .sort((a, b) => b.revenue - a.revenue),
    byBook: [...byBook.values()].map(b => ({ ...b, revenue: roundCents(b.revenue) })),
    ...capped,
    note: 'Revenue is reported in each row\'s own currency and never converted. '
      + 'Consignment revenue is the publisher\'s cut after the store commission, not the shelf price. '
      + 'For a single cross-book figure in CAD, use queryLedger instead.',
  };
}

// ── LEDGER ───────────────────────────────────────────────────────────────────

function queryLedger(args = {}, ctx = {}) {
  if (typeof ctx.buildLedger !== 'function') {
    return { error: 'The cross-book ledger is not available in this session.' };
  }
  const year = args.year || 'all';
  const built = ctx.buildLedger(year) || {};
  const all = Array.isArray(built.allLedger) ? built.allLedger : [];

  const wantCat = lower(args.category);
  const wantTrip = lower(args.trip);
  const wantSource = lower(args.sourceType);
  const text = lower(args.text);

  const rows = all.filter(r => {
    if (!r) return false;
    if (!inDateRange(r.date, args.dateFrom, args.dateTo)) return false;
    if (wantSource && lower(r.sourceType) !== wantSource) return false;
    if (wantCat && lower(canonicalExpenseCategory(r.cat, '')) !== lower(canonicalExpenseCategory(args.category, ''))) return false;
    if (wantTrip && lower(r.trip) !== wantTrip) return false;
    if (args.includeVoided !== true && r.voided) return false;
    if (text) {
      const hay = [r.desc, r.cat, r.ref, r.invoiceNum, r.trip, r.type].map(lower).join(' ');
      if (!hay.includes(text)) return false;
    }
    return true;
  });

  // Totals over every matching row, computed before the cap below.
  let income = 0, expenses = 0, rateErrors = 0;
  for (const r of rows) {
    const base = num(r.baseAmount);
    if (r.isIncome) income += base; else expenses += base;
    if (r.hasRateError) rateErrors += 1;
  }

  const slim = rows.map(r => ({
    date: str(r.date), type: str(r.type), desc: str(r.desc),
    category: canonicalExpenseCategory(r.cat, ''), trip: str(r.trip),
    ref: str(r.ref), invoice: str(r.invoiceNum),
    isIncome: !!r.isIncome, sourceType: str(r.sourceType),
    amountCAD: roundCents(num(r.baseAmount)),
    nativeAmount: roundCents(num(r.origAmount)), nativeCurrency: str(r.origCurrency),
    qty: num(r.qty),
    ...(r.hasRateError ? { rateMissing: true } : {}),
  }));

  return {
    scope: { year, dateFrom: args.dateFrom || null, dateTo: args.dateTo || null },
    totals: {
      incomeCAD: roundCents(income),
      expensesCAD: roundCents(expenses),
      netCAD: roundCents(income - expenses),
      rowsWithMissingRate: rateErrors,
    },
    yearTotals: {
      grossSalesCAD: roundCents(num(built.totalGrossSales)),
      operatingExpensesCAD: roundCents(num(built.totalOperatingExpenses)),
    },
    ...capRows(slim),
    note: 'Amounts are the CAD figures stamped on each row when it was written; they are never re-converted. '
      + 'Rows flagged rateMissing had no exchange rate at the time and their CAD figure is unreliable.',
  };
}

// ── EXPENSES ─────────────────────────────────────────────────────────────────

function expenseRow(e, scope, bookId, bookTitle, fallbackCur) {
  const storedCat = str(e.cat);
  const canonical = canonicalExpenseCategory(storedCat, 'Other');
  return {
    id: str(e.id), scope, bookId: bookId || null, book: bookTitle || null,
    date: str(e.date), description: str(e.desc),
    category: canonical,
    ...(storedCat && storedCat !== canonical ? { storedCategory: storedCat } : {}),
    amount: roundCents(num(e.amount)),
    currency: normalizeCurrencyCode(e.currency, fallbackCur),
    ...(e.baseAmount != null ? { amountCAD: roundCents(num(e.baseAmount)) } : {}),
    trip: str(e.trip),
    hasReceipt: !!(e.receipt || e.receiptCloudAt || (Array.isArray(e.receiptFiles) && e.receiptFiles.length)),
    ...(e.fxMissing ? { rateMissing: true } : {}),
    ...(e.amountUnknown ? { amountUnknown: true } : {}),
    ...(e.voided ? { voided: true } : {}),
  };
}

/**
 * Every expense in scope, each paired with the record it came from.
 *
 * The raw record is carried alongside the reported row because two things need
 * it that the reported shape has deliberately dropped: expenseLedgerTotals(),
 * which reads `received`/`pendingAuth`/gratuity flags to work out who is still
 * owed money, and the approval flow, which has to write back to the actual
 * object. Callers report `row` and never leak `raw` into a tool result.
 */
function collectExpenses(ctx, args) {
  const scope = args.scope || 'all';
  const out = [];
  if (scope === 'all' || scope === 'business') {
    const cur = ctx.taxCenter?.settings?.baseCurrency || 'CAD';
    for (const e of (ctx.taxCenter?.businessExpenses || [])) {
      if (e) out.push({ row: expenseRow(e, 'business', null, null, cur), raw: e, bookId: null, bookCode: cur });
    }
  }
  if (scope === 'all' || scope === 'book') {
    for (const [bookId, book] of selectedBooks(ctx, args.bookId)) {
      const s = stateFor(ctx, bookId);
      const cur = getBookCurrencyCode(book);
      for (const e of (s?.expenses || [])) {
        if (e) out.push({ row: expenseRow(e, 'book', bookId, str(book.title), cur), raw: e, bookId, bookCode: cur });
      }
    }
  }
  return out;
}

function queryExpenses(args = {}, ctx = {}) {
  const wantCat = args.category ? lower(canonicalExpenseCategory(args.category, '')) : '';
  const wantTrip = lower(args.trip);
  const text = lower(args.text);

  const matches = collectExpenses(ctx, args).filter(({ row: r }) => {
    if (r.voided && args.includeVoided !== true) return false;
    if (!inDateRange(r.date, args.dateFrom, args.dateTo)) return false;
    if (wantCat && lower(r.category) !== wantCat) return false;
    if (wantTrip && lower(r.trip) !== wantTrip) return false;
    if (args.missingReceiptOnly && r.hasReceipt) return false;
    if (text && ![r.description, r.category, r.trip, r.book].map(lower).join(' ').includes(text)) return false;
    return true;
  });
  const rows = matches.map(m => m.row);

  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // Who is still owed money, using the app's own definition of that rather than
  // a second one invented here: expenseLedgerTotals is what the Expenses
  // footer reads, so this figure and that footer cannot disagree. Gifted copies
  // and unapproved author submissions are excluded there, and so they are here.
  const reimbursement = [];
  const rawByBook = new Map();
  for (const m of matches) {
    if (m.row.scope !== 'book') continue;
    const bucket = rawByBook.get(m.bookId) || { bookId: m.bookId, book: m.row.book, code: m.bookCode, raw: [] };
    bucket.raw.push(m.raw);
    rawByBook.set(m.bookId, bucket);
  }
  for (const b of rawByBook.values()) {
    for (const t of expenseLedgerTotals(b.raw, b.code)) {
      if (t.outstanding > 0 || t.settled > 0) reimbursement.push({ bookId: b.bookId, book: b.book, ...t });
    }
  }

  const byCurrency = new Map();
  const byCategory = new Map();
  let cadTotal = 0, cadRows = 0;
  for (const r of rows) {
    addToCurrency(byCurrency, r.currency, { revenue: r.amount });
    const c = byCategory.get(r.category) || { category: r.category, total: 0, count: 0, currencies: new Set() };
    // Prefer the stamped CAD figure so a category total is comparable across
    // currencies; fall back to the native amount and say so below.
    c.total += r.amountCAD != null ? r.amountCAD : r.amount;
    c.count += 1; c.currencies.add(r.currency);
    byCategory.set(r.category, c);
    if (r.amountCAD != null) { cadTotal += r.amountCAD; cadRows += 1; }
  }

  return {
    scope: args.scope || 'all',
    totalsByCurrency: currencyTotals(byCurrency).map(({ units: _u, ...rest }) => rest),
    totalCAD: roundCents(cadTotal),
    rowsWithCadFigure: cadRows,
    byCategory: [...byCategory.values()]
      .map(c => ({ ...c, total: roundCents(c.total), currencies: [...c.currencies] }))
      .sort((a, b) => b.total - a.total),
    reimbursement,
    missingReceipts: rows.filter(r => !r.hasReceipt).length,
    ...capRows(rows),
    note: 'Categories are folded onto their canonical names for reporting; storedCategory shows the raw value '
      + 'when it differs. Category totals use each row\'s stamped CAD figure where one exists — '
      + `${cadRows} of ${rows.length} rows have one.`,
  };
}

// ── EVENTS (fairs, markets, trips) ───────────────────────────────────────────
//
// There is no events collection in this app, so "the Toronto fair" has to be
// assembled from three places that were never designed to be joined:
//   1. the trip a business expense was tagged with, plus its declared record
//      (destination, dates) and its budget, if one was set;
//   2. sales made face to face, which are ordinary history rows whose channel
//      is one of IN_PERSON_CHANNELS;
//   3. the trip's name appearing in a sale's notes or order number, which is
//      how a sale gets tied to an event that ran outside the declared dates.
//
// Spend is in CAD because that is what the tax centre stamps. Sales are in each
// book's own currency. Where they agree, a margin is reported; where they do
// not, both figures come back with an explicit note rather than a number that
// silently added two currencies together.

function tripDateRange(bucket) {
  const rec = bucket.record || {};
  let from = str(rec.startDate);
  let to = str(rec.endDate);
  for (const item of (bucket.items || [])) {
    const d = str(item.date);
    if (!d) continue;
    if (!from || d < from) from = d;
    if (!to || d > to) to = d;
  }
  return { from, to };
}

function eventSales(ctx, name, range) {
  const key = lower(name);
  const rows = [];
  for (const [bookId, book] of Object.entries(ctx.books || {})) {
    const s = stateFor(ctx, bookId);
    if (!s) continue;
    const cur = getBookCurrencyCode(book);
    for (const h of (s.hist || [])) {
      if (!h || h.voided || h.gratuity || h.consignmentLink) continue;
      const chan = str(h.chan);
      const inPerson = IN_PERSON_CHANNELS.includes(chan);
      const named = key && (lower(h.notes).includes(key) || lower(h.num).includes(key));
      // Either it happened in person while the event was running, or it names
      // the event outright. A named sale counts even outside the dates: a
      // pre-order taken for a fair is still that fair's.
      const dated = inPerson && range.from && inDateRange(h.date, range.from, range.to);
      if (!dated && !named) continue;
      const qty = num(h.qty);
      const price = num(h.price ?? h.unitPrice);
      rows.push({
        bookId, book: str(book.title), date: str(h.date), channel: chan || 'Direct',
        qty, revenue: roundCents(qty * price),
        currency: normalizeCurrencyCode(h.cur, cur),
        // Date is the stronger evidence, so a sale that both fell inside the
        // event and named it counts as dated. salesMatchedByName exists to
        // flag the LOOSER inferences, and a row with both is not one of them.
        matchedBy: dated ? 'date' : 'name',
      });
    }
  }
  return rows;
}

function queryEvents(args = {}, ctx = {}) {
  const summary = ctx.tripsSummary || {};
  const budgets = ctx.taxCenter?.tripBudgets || {};
  const wantName = lower(args.name);
  const events = [];

  for (const [name, bucket] of Object.entries(summary)) {
    if (wantName && !lower(name).includes(wantName)) continue;
    const range = tripDateRange(bucket || {});
    if (args.year && args.year !== 'all') {
      const stamp = range.from || range.to || str(bucket.latestDate);
      if (!stamp.startsWith(String(args.year))) continue;
    }
    if (args.dateFrom || args.dateTo) {
      // An event overlaps the window if either end of it falls inside.
      const a = range.from || range.to;
      const b = range.to || range.from;
      if (!(inDateRange(a, args.dateFrom, args.dateTo) || inDateRange(b, args.dateFrom, args.dateTo))) continue;
    }

    const spendCAD = roundCents(num(bucket.total));
    const budget = budgets[name] != null ? roundCents(num(budgets[name])) : null;
    const sales = args.includeSales === false ? [] : eventSales(ctx, name, range);

    const byCurrency = new Map();
    for (const r of sales) addToCurrency(byCurrency, r.currency, { units: r.qty, revenue: r.revenue });
    const salesTotals = currencyTotals(byCurrency);
    const onlyCad = salesTotals.length === 1 && salesTotals[0].code === 'CAD';

    const rec = bucket.record || {};
    events.push({
      name,
      destination: str(rec.destination),
      purpose: str(rec.purpose),
      startDate: range.from || null,
      endDate: range.to || null,
      spendCAD,
      expenseCount: num(bucket.count),
      budgetCAD: budget,
      budgetVarianceCAD: budget == null ? null : roundCents(budget - spendCAD),
      spendByCategory: Object.entries(bucket.categories || {})
        .map(([cat, total]) => ({ category: canonicalExpenseCategory(cat, 'Other'), total: roundCents(num(total)) }))
        .sort((a, b) => b.total - a.total),
      salesUnits: sales.reduce((n, r) => n + r.qty, 0),
      salesByCurrency: salesTotals,
      marginCAD: onlyCad ? roundCents(salesTotals[0].revenue - spendCAD) : null,
      marginNote: onlyCad
        ? null
        : (salesTotals.length === 0
          ? 'No sales matched this event, so only its costs are known.'
          : 'Sales spanned more than one currency, so no single margin figure is given — the costs are CAD and the takings are listed per currency.'),
      salesMatchedByName: sales.filter(r => r.matchedBy === 'name').length,
    });
  }

  events.sort((a, b) => str(b.startDate).localeCompare(str(a.startDate)) || b.spendCAD - a.spendCAD);

  return {
    ...capRows(events),
    note: 'Costs come from expenses tagged with the trip and are CAD. Sales are matched either by happening '
      + 'in person inside the event\'s dates, or by naming the event in the order notes.',
  };
}

// ── CATALOG & STOCK ──────────────────────────────────────────────────────────

function queryCatalog(args = {}, ctx = {}) {
  const rows = [];
  for (const [bookId, book] of selectedBooks(ctx, args.bookId)) {
    const s = stateFor(ctx, bookId);
    if (!s) continue;
    const cur = getBookCurrencyCode(book);
    const breakdown = inventoryBreakdown(s, book);
    const stock = deriveStockBreakdown(s, book);
    const row = {
      bookId, title: str(book.title), author: str(book.author), isbn: str(book.isbn),
      currency: cur,
      listPrice: num(book.listPrice),
      productionCost: num(book.productionCost),
      printRun: num(book.maxPrint),
      lowStockThreshold: num(book.threshold),
      publisherSplitPct: num(book.pubGratuity),
      authorSplitPct: num(book.authorGratuity),
      onHand: deriveOnHand(s, book),
      publisherOnHand: num(stock.publisherOnHand),
      authorHeld: num(stock.authorHeld),
      ...breakdown,
      channelMix: channelMixRows(s.chStats).rows
        .map(r => ({ channel: r.chan, units: r.units, revenue: roundCents(r.revenue), sharePct: Math.round(r.share) })),
    };

    // Break-even is only meaningful once a production cost exists, which is the
    // same condition the dashboard block uses before it will render.
    const cost = num(book.productionCost);
    if (args.includeBreakEven !== false && cost > 0 && typeof ctx.recognizedRevenue === 'function') {
      const be = calculateBreakEven({
        cost, recognizedRev: num(ctx.recognizedRevenue(s)),
        listPrice: num(book.listPrice), sold: num(s.sold), stock: num(s.stock), currency: cur,
      });
      row.breakEven = {
        recovered: !!be.broken,
        percentRecovered: Math.round(num(be.pctBe)),
        stillToRecover: roundCents(num(be.remaining)),
        copiesNeededAtListPrice: num(be.unitsNeededAtList),
        copiesNeededAtAveragePrice: num(be.unitsNeededAtAvg),
      };
    }
    rows.push(row);
  }
  rows.sort((a, b) => str(a.title).localeCompare(str(b.title)));
  return {
    ...capRows(rows),
    note: 'Stock figures are derived from the ledger, not stored, so they always agree with the Catalog screen. '
      + 'Prices are in each book\'s own currency.',
  };
}

// ── ANOMALIES ────────────────────────────────────────────────────────────────
//
// Deliberately NOT a classifier. Everything here is a rule that can be checked
// and shown to be true, so an answer can always point at the row that triggered
// it. The model's job is to explain what turned up, never to decide what counts
// as wrong — a language model guessing at which expenses look miscategorised is
// exactly the failure mode this design is trying to avoid in a financial ledger.

/** Above this, an expense with no receipt attached is worth mentioning. */
const RECEIPT_EXPECTED_ABOVE = 25;

function findAnomalies(args = {}, ctx = {}) {
  const rows = collectExpenses(ctx, { scope: args.scope || 'all' })
    .map(m => m.row)
    .filter(r => !r.voided && inDateRange(r.date, args.dateFrom, args.dateTo));

  const findings = [];
  const add = (kind, severity, row, detail, fix) => findings.push({
    kind, severity, detail,
    expenseId: row.id, scope: row.scope, bookId: row.bookId,
    date: row.date, description: row.description,
    amount: row.amount, currency: row.currency,
    ...(fix ? { suggestedFix: fix } : {}),
  });

  const seen = new Map();
  for (const r of rows) {
    if (r.storedCategory) {
      add('category-alias', 'medium', r,
        `Filed as "${r.storedCategory}", which is another spelling of "${r.category}". `
        + 'Reports fold it correctly, but the stored value is inconsistent.',
        { kind: 'recategorizeExpense', value: r.category });
    }
    if (r.rateMissing) {
      add('missing-exchange-rate', 'high', r,
        'No exchange rate was recorded, so this row\'s CAD figure cannot be trusted in any total.');
    }
    if (r.amountUnknown) {
      add('amount-unknown', 'high', r, 'The amount was never filled in, so this cost is missing from every total.');
    }
    if (!r.hasReceipt && r.amount > RECEIPT_EXPECTED_ABOVE) {
      add('missing-receipt', 'low', r, `No receipt is attached to a ${r.currency} ${r.amount.toFixed(2)} expense.`);
    }
    // Same day, same money, same words: two entries of one cost is the single
    // most common way a ledger drifts, and it is cheap to spot exactly.
    const key = [r.scope, r.bookId, r.date, r.amount, r.currency, lower(r.description)].join('|');
    if (seen.has(key)) {
      add('possible-duplicate', 'medium', r,
        `Same date, amount and description as another entry (${seen.get(key)}).`);
    } else {
      seen.set(key, r.id || r.description);
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => (order[a.severity] - order[b.severity]) || str(b.date).localeCompare(str(a.date)));

  // Whatever the app's own to-do list already knows, folded in unchanged so the
  // panel and the To-do tab cannot disagree about what needs attention.
  const signals = (ctx.attentionSignals?.signals || []).map(sig => ({
    group: str(sig.group), status: str(sig.status),
    label: str(sig.label), detail: str(sig.detail),
  }));

  return {
    scanned: rows.length,
    byKind: findings.reduce((acc, f) => { acc[f.kind] = (acc[f.kind] || 0) + 1; return acc; }, {}),
    ...capRows(findings),
    appAttentionSignals: signals.slice(0, 40),
    note: 'Every finding is a checked rule, not a judgement. A category-alias finding can be fixed with '
      + 'proposeCorrection; the publisher still has to approve it before anything is written.',
  };
}

// ── PROPOSING A CORRECTION ───────────────────────────────────────────────────
//
// This writes NOTHING. It confirms the row exists, works out what the change
// would actually be, and hands back a description of it. The panel renders that
// as a card, the publisher approves it, and the panel performs the write
// through the same save path the Expenses screen uses — offline queue, merge
// and all. Keeping the write out of here is what makes the whole tool surface
// safe to hand to a model.

const PROPOSAL_KINDS = ['recategorizeExpense', 'setExpenseTrip'];

function findExpenseById(ctx, scope, bookId, id) {
  const wanted = str(id);
  if (!wanted) return null;
  if (scope !== 'book') {
    const hit = (ctx.taxCenter?.businessExpenses || []).find(e => e && str(e.id) === wanted);
    if (hit) return { expense: hit, scope: 'business', bookId: null };
  }
  if (scope !== 'business') {
    for (const [id2, book] of selectedBooks(ctx, bookId)) {
      const hit = (stateFor(ctx, id2)?.expenses || []).find(e => e && str(e.id) === wanted);
      if (hit) return { expense: hit, scope: 'book', bookId: id2, bookTitle: str(book.title) };
    }
  }
  return null;
}

function proposeCorrection(args = {}, ctx = {}) {
  const kind = str(args.kind);
  if (!PROPOSAL_KINDS.includes(kind)) {
    return { ok: false, error: `Unknown correction "${kind}". Only ${PROPOSAL_KINDS.join(' and ')} can be proposed.` };
  }
  const found = findExpenseById(ctx, str(args.scope) || 'any', args.bookId, args.expenseId);
  if (!found) {
    return { ok: false, error: `No expense with id "${str(args.expenseId)}" exists, so nothing can be changed.` };
  }

  const { expense, scope, bookId, bookTitle } = found;
  const field = kind === 'recategorizeExpense' ? 'cat' : 'trip';
  const before = str(expense[field]);
  let after = str(args.value).trim();

  if (kind === 'recategorizeExpense') {
    if (!after) return { ok: false, error: 'A category is required.' };
    after = canonicalExpenseCategory(after, 'Other');
    const known = ctx.expenseCategories;
    if (Array.isArray(known) && known.length && !known.includes(after)) {
      return { ok: false, error: `"${after}" is not one of this app's expense categories.` };
    }
  }
  if (before === after) {
    return { ok: false, error: 'That is already the stored value, so there is nothing to change.' };
  }

  return {
    ok: true,
    proposal: {
      kind, field, scope, bookId: bookId || null, book: bookTitle || null,
      expenseId: str(expense.id),
      description: str(expense.desc),
      date: str(expense.date),
      amount: roundCents(num(expense.amount)),
      currency: normalizeCurrencyCode(expense.currency, 'CAD'),
      before: before || null,
      after,
      reason: str(args.reason),
    },
    note: 'Nothing has been changed. This is shown to the publisher for approval.',
  };
}

// ── THE TOOL SURFACE HANDED TO THE MODEL ─────────────────────────────────────
//
// Descriptions are written for a reader who knows nothing about this codebase,
// because that is exactly what the model is. Where a field means something
// specific to this business — that consignment revenue is the publisher's cut,
// that an "event" is assembled rather than stored — the description says so,
// since a wrong assumption there produces a confident wrong answer.

const DATE = { type: 'STRING', description: 'A date as YYYY-MM-DD.' };
const BOOK_ID = { type: 'STRING', description: 'Restrict to one book by its id. Omit for every book.' };

export const INTEL_TOOL_SCHEMAS = [
  {
    name: 'queryLedger',
    description:
      'The single cross-book money ledger in Canadian dollars: sales, shipping income, book expenses, '
      + 'artist payouts and business expenses together. Use this whenever the question is about totals, '
      + 'profit or a comparison across books, because it is the only tool whose figures are all in one currency.',
    parameters: {
      type: 'OBJECT',
      properties: {
        year: { type: 'STRING', description: 'A four-digit year, or "all". Defaults to "all".' },
        dateFrom: DATE, dateTo: DATE, bookId: BOOK_ID,
        sourceType: {
          type: 'STRING',
          description: 'Narrow to one kind of row: sale, shippingIncome, bookExpense, artistPayout or businessExpense.',
        },
        category: { type: 'STRING', description: 'An expense category name.' },
        trip: { type: 'STRING', description: 'The name of a trip or event.' },
        text: { type: 'STRING', description: 'Free text matched against description, category, reference and invoice.' },
        includeVoided: { type: 'BOOLEAN', description: 'Include cancelled rows. Defaults to false.' },
      },
    },
  },
  {
    name: 'querySales',
    description:
      'Individual sales with their channel, quantity and takings, in each book\'s own currency. '
      + 'Use it for "what sold, where, and how much of it" questions. Consignment rows report the '
      + 'publisher\'s cut after the store\'s commission, not the shelf price. Amounts are never converted '
      + 'between currencies here, so do not add different currencies together.',
    parameters: {
      type: 'OBJECT',
      properties: {
        bookId: BOOK_ID,
        channel: { type: 'STRING', description: 'One channel, e.g. Website, POS, Fair, Consignment.' },
        dateFrom: DATE, dateTo: DATE,
        text: { type: 'STRING', description: 'Free text matched the way the History screen searches.' },
        includeGratuities: { type: 'BOOLEAN', description: 'Include gifted copies, which earn nothing. Defaults to false.' },
      },
    },
  },
  {
    name: 'queryExpenses',
    description:
      'Costs, either the publisher\'s own business expenses or the ones attached to a book. '
      + 'Returns a per-category breakdown and flags rows with no receipt attached.',
    parameters: {
      type: 'OBJECT',
      properties: {
        scope: { type: 'STRING', description: '"business", "book" or "all". Defaults to "all".' },
        bookId: BOOK_ID,
        category: { type: 'STRING', description: 'An expense category name.' },
        trip: { type: 'STRING', description: 'The name of a trip or event.' },
        dateFrom: DATE, dateTo: DATE,
        missingReceiptOnly: { type: 'BOOLEAN', description: 'Only rows with no receipt attached.' },
        text: { type: 'STRING', description: 'Free text matched against description, category and trip.' },
        includeVoided: { type: 'BOOLEAN', description: 'Include cancelled rows. Defaults to false.' },
      },
    },
  },
  {
    name: 'queryEvents',
    description:
      'Fairs, markets and business trips: what each one cost, what was budgeted for it, what sold there, '
      + 'and the margin where both sides are in the same currency. This app does not store events as such — '
      + 'each one is assembled from expenses tagged with the trip and from sales made in person during its '
      + 'dates or naming it in the order notes. Use this for any "how did we do at X" question.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Part of an event name, e.g. "Toronto". Omit for every event.' },
        year: { type: 'STRING', description: 'A four-digit year, or "all".' },
        dateFrom: DATE, dateTo: DATE,
        includeSales: { type: 'BOOLEAN', description: 'Match sales to each event. Defaults to true.' },
      },
    },
  },
  {
    name: 'queryCatalog',
    description:
      'Each book: price, production cost, print run, how many copies are where, the split between '
      + 'publisher and author, the mix of sales by channel, and progress towards covering its production cost.',
    parameters: {
      type: 'OBJECT',
      properties: {
        bookId: BOOK_ID,
        includeBreakEven: { type: 'BOOLEAN', description: 'Include break-even progress. Defaults to true.' },
      },
    },
  },
  {
    name: 'findAnomalies',
    description:
      'Checks the expense records against fixed rules and reports what fails: a category stored under an old '
      + 'spelling, a foreign-currency row with no exchange rate, a missing amount, a sizeable expense with no '
      + 'receipt, and entries that look like the same cost recorded twice. These are checked rules, not opinions — '
      + 'report exactly what comes back and do not add findings of your own.',
    parameters: {
      type: 'OBJECT',
      properties: {
        scope: { type: 'STRING', description: '"business", "book" or "all". Defaults to "all".' },
        dateFrom: DATE, dateTo: DATE,
      },
    },
  },
  {
    name: 'proposeCorrection',
    description:
      'Stage a correction to ONE expense for the publisher to approve. This does not change anything — it '
      + 'checks the change is possible and shows it to them as an approve-or-dismiss card. Only ever propose a '
      + 'correction you can point at a findAnomalies result for, and propose each one separately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        kind: { type: 'STRING', description: 'Either "recategorizeExpense" or "setExpenseTrip".' },
        scope: { type: 'STRING', description: '"business" or "book", from the finding.' },
        bookId: BOOK_ID,
        expenseId: { type: 'STRING', description: 'The id of the expense to change.' },
        value: { type: 'STRING', description: 'The category or trip name it should have instead.' },
        reason: { type: 'STRING', description: 'One short sentence the publisher will read explaining why.' },
      },
      required: ['kind', 'expenseId', 'value'],
    },
  },
];

const HANDLERS = {
  queryLedger, querySales, queryExpenses, queryEvents, queryCatalog, findAnomalies, proposeCorrection,
};

export const INTEL_TOOL_NAMES = Object.keys(HANDLERS);

/**
 * Run one tool by name.
 *
 * A model naming a tool that does not exist, or handing a tool something it
 * cannot use, is an ordinary event rather than a crash: the error comes back as
 * a normal result so the loop can feed it in and let the model correct itself.
 * Throwing here would end the turn with nothing to show for it.
 */
export function runIntelTool(name, args = {}, ctx = {}) {
  const fn = HANDLERS[name];
  if (!fn) {
    return { error: `There is no tool called "${str(name)}". Available: ${INTEL_TOOL_NAMES.join(', ')}.` };
  }
  try {
    return fn(args && typeof args === 'object' ? args : {}, ctx);
  } catch (e) {
    return { error: `${name} could not be answered: ${str(e && e.message) || 'unknown error'}` };
  }
}
