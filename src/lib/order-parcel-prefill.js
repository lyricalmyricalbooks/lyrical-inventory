// Turning an online order into a ready-to-quote parcel.
//
// Picking a web order as the shipping destination used to fill in the address
// and stop there. Everything the parcel actually needs — which book is in the
// box, how many copies, what it is worth to customs — was already known from
// the order and had to be re-entered by hand anyway: open the package preset
// dropdown, find the book, set the quantity, fix the customs value, press
// Calculate. Five interactions to restate what the order already said.
//
// This module reads an order's lines and answers the parcel question directly.
// It is deliberately pure — no DOM, no state, no network — so the rules about
// which book sizes the box, what may be filled in silently, and what a human
// still has to look at are testable on their own. The DOM half lives in
// features/shipping.js and the ledger half in features/bigcartel.js.
//
// The one rule that matters most here is `autoSafe`. bigCartelOrderLines
// returns a `confidence` per line, and 'price' means the storefront itemized
// nothing and the book was deduced by dividing what was paid by a list price.
// That guess picks the wrong book whenever two titles share a price, so it is
// good enough to pre-fill a form a publisher is looking at and NOT good enough
// to deduct stock without being asked. Only 'exact' lines clear that bar.

const clean = (value) => String(value ?? '').trim();

const GENERIC_CUSTOMS_VALUE = 25;

/** Per-copy weight in pounds, for deciding which of two books sizes the box. */
function weightInPounds(book) {
  const raw = Number.parseFloat(book?.shipWeight);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  switch (clean(book.shipWeightUnit).toLowerCase()) {
    case 'oz': return raw / 16;
    case 'kg': return raw * 2.20462;
    case 'g': return raw / 453.592;
    default: return raw;
  }
}

function positiveQty(value) {
  const qty = Math.floor(Number(value));
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

/**
 * The lines of a ledger history entry, in the same shape bigCartelOrderLines
 * produces for a storefront order.
 *
 * A history row records exactly one book — that is the shape applyOne() and
 * every recovery path write — so this is always zero or one line. It exists so
 * the "Recent Ledger Orders" entries in the destination picker get the same
 * parcel treatment as the storefront ones rather than being a second-class
 * path that still makes the publisher pick the book by hand.
 */
export function parcelLinesFromLedgerEntry(entry = {}, bookId = '', rawBooks = {}) {
  const books = rawBooks && typeof rawBooks === 'object' ? rawBooks : {};
  const row = entry && typeof entry === 'object' ? entry : {};
  const id = clean(bookId) || clean(row.bookId) || clean(row._bookId);
  if (!id || !books[id]) return [];
  const price = Number.parseFloat(row.price);
  return [{
    title: clean(books[id].title),
    bookId: id,
    qty: positiveQty(row.qty) || 1,
    unitPrice: Number.isFinite(price) && price >= 0 ? price : null,
    confidence: 'exact',
  }];
}

/**
 * Which catalog book should size the box.
 *
 * The most copies wins, because that is the bulk of the parcel. Two lines with
 * the same count are broken by per-copy weight — sizing a mixed box on the
 * heavier book overstates the postage slightly, and an overstated parcel is a
 * quote that is a little high, while an understated one is a label the carrier
 * bills you extra for at the depot.
 */
function chooseParcelBook(lines, books) {
  let best = null;
  lines.forEach(line => {
    if (!line.bookId || !books[line.bookId]) return;
    if (!best) { best = line; return; }
    if (line.qty > best.qty) { best = line; return; }
    if (line.qty === best.qty && weightInPounds(books[line.bookId]) > weightInPounds(books[best.bookId])) {
      best = line;
    }
  });
  return best;
}

/** What one copy is worth to customs, preferring what the buyer actually paid. */
function customsUnitValue(line, book) {
  const paid = Number.parseFloat(line?.unitPrice);
  if (Number.isFinite(paid) && paid > 0) return Math.round(paid * 100) / 100;
  const listed = Number.parseFloat(book?.shipCustomsVal ?? book?.listPrice ?? book?.price);
  if (Number.isFinite(listed) && listed > 0) return Math.round(listed * 100) / 100;
  return GENERIC_CUSTOMS_VALUE;
}

/**
 * The parcel this order implies: which preset to load, how many copies, what to
 * declare, and — the part the caller must respect — how much of that may happen
 * without a human looking at it.
 *
 * `confidence` grades the whole order:
 *   'exact'   every line matched a catalog title and they are all the same book.
 *   'mixed'   every line matched, but the box holds more than one title.
 *   'partial' at least one line could not be tied to the catalog, or a line was
 *             deduced from the amount paid rather than read from the order.
 *   'none'    nothing resolved; there is no parcel to propose.
 *
 * `autoSafe` is the gate on doing anything unattended, and only 'exact' passes
 * it, for two separate reasons that happen to land on the same orders. A mixed
 * box is not described by either book's saved dimensions, so its weight is the
 * publisher's to confirm; it also cannot be recorded as a sale, because the
 * ledger writes one row per order and deducting a two-title order from one
 * title takes the stock off the wrong book. A price-deduced line fails for a
 * third reason: it is a guess about which book was even sold.
 *
 * Everything short of 'exact' still gets the form filled in — a starting point
 * a publisher can see and correct is better than an empty box — it just never
 * moves stock or gets treated as confirmed.
 */
export function orderParcelPlan(rawLines = [], rawBooks = {}) {
  const books = rawBooks && typeof rawBooks === 'object' ? rawBooks : {};
  const lines = (Array.isArray(rawLines) ? rawLines : [])
    .map(line => ({ ...(line || {}), qty: positiveQty(line?.qty) }))
    .filter(line => line.qty > 0);

  const matched = lines.filter(line => line.bookId && books[line.bookId]);
  const unmatchedTitles = lines
    .filter(line => !line.bookId || !books[line.bookId])
    .map(line => clean(line.title) || 'an unnamed item')
    .filter(Boolean);

  const empty = {
    presetBookId: '',
    presetTitle: '',
    totalQty: 0,
    matchedQty: 0,
    distinctBooks: 0,
    unmatchedTitles,
    customsUnitValue: 0,
    customsDescription: '',
    confidence: 'none',
    autoSafe: false,
    lines,
  };
  if (!matched.length) return empty;

  const primary = chooseParcelBook(matched, books);
  if (!primary) return empty;

  const book = books[primary.bookId];
  const distinctBooks = new Set(matched.map(line => line.bookId)).size;
  const totalQty = lines.reduce((sum, line) => sum + line.qty, 0);
  const matchedQty = matched.reduce((sum, line) => sum + line.qty, 0);
  const guessed = matched.some(line => line.confidence !== 'exact');

  let confidence = 'exact';
  if (unmatchedTitles.length || guessed) confidence = 'partial';
  else if (distinctBooks > 1) confidence = 'mixed';

  return {
    presetBookId: primary.bookId,
    presetTitle: clean(book.title),
    totalQty,
    matchedQty,
    distinctBooks,
    unmatchedTitles,
    customsUnitValue: customsUnitValue(primary, book),
    customsDescription: clean(book.shipCustomsDesc)
      || `${clean(book.title) || 'Printed books'} - printed books`.slice(0, 80),
    confidence,
    autoSafe: confidence === 'exact',
    lines,
  };
}

/**
 * One plain sentence naming what was filled in, for the toast. Written for the
 * publisher: it says what is in the box, not which fields were written.
 */
export function describeParcelPlan(plan = {}) {
  if (!plan.presetBookId) return '';
  const copies = `${plan.totalQty} ${plan.totalQty === 1 ? 'copy' : 'copies'}`;
  if (plan.confidence === 'exact') return `${copies} of ${plan.presetTitle}`;
  if (plan.confidence === 'mixed') {
    return `${copies} across ${plan.distinctBooks} titles — sized on ${plan.presetTitle}, check the weight`;
  }
  if (plan.unmatchedTitles.length) {
    return `${copies}, sized on ${plan.presetTitle} — ${plan.unmatchedTitles.join(', ')} isn’t in your catalogue, so check the weight`;
  }
  return `${copies} of ${plan.presetTitle} (best guess from the amount paid — check the book and weight)`;
}
