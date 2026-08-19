/**
 * consignment-ledger-filter.js — pure narrowing of the consignment ledger.
 *
 * The per-book consignment ledger renders every shipment, sale and return the
 * book has ever had, newest first, with no way to narrow it. That is fine for a
 * book at two stores and unusable for one at twenty: the question actually asked
 * of this screen is "what has THIS store done, and what do they still owe me?",
 * and answering it meant reading a two-year list by eye.
 *
 * Everything here is a pure read over the entries the ledger already holds — no
 * re-tallying, no re-sorting, no mutation. The money totals underneath the table
 * keep coming from `consignmentLedgerTotals()`; this module only decides which
 * rows that function is handed, so a filtered total is the same arithmetic over
 * a smaller set rather than a second, divergent one.
 */

/**
 * The three movements a consignment entry can be, in the order they happen to a
 * copy: it goes out, it sells, or it comes back.
 *
 * `key` matches the `type` string minted by the send/sale/return paths in
 * main.js. The labels are deliberately the shop owner's words rather than the
 * stored ones — "Shipment" is what the record is called, "Sent out" is what
 * happened.
 */
export const LEDGER_TYPE_FILTERS = [
  { key: 'Shipment', label: 'Sent out', glyph: '📦' },
  { key: 'Sale', label: 'Sold', glyph: '💰' },
  { key: 'Return', label: 'Returned', glyph: '↩' },
];

/** A filter that hides nothing — the state the ledger opens in. */
export function emptyLedgerFilter() {
  return { storeId: null, type: null, unpaidOnly: false };
}

/**
 * Store ids are minted in two places (`Date.now()` numbers for stores added in
 * the app, strings for rows that arrived from a spreadsheet import), so a
 * filter picked from a `<select>` — where every value is a string — has to
 * compare loosely or it silently matches nothing.
 */
function sameStore(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

/** True when the filter is narrowing anything at all. */
export function ledgerFilterIsActive(filter) {
  if (!filter) return false;
  return !!(filter.storeId || filter.type || filter.unpaidOnly);
}

/**
 * The stores that actually appear in this ledger, with how many rows each one
 * has — the list the store picker is built from.
 *
 * Deliberately derived from the ledger and not from `state.stores`: a store the
 * publisher has since removed still owns its historical rows, and leaving it out
 * of the picker would make those rows unreachable. Sorted by name so the picker
 * order is stable across renders instead of following insertion order.
 */
export function ledgerStoreOptions(entries) {
  const byId = new Map();
  for (const e of entries || []) {
    if (!e || e.storeId === null || e.storeId === undefined) continue;
    const id = String(e.storeId);
    let bucket = byId.get(id);
    if (!bucket) {
      bucket = { id: e.storeId, name: String(e.storeName ?? '').trim() || 'Unnamed store', count: 0 };
      byId.set(id, bucket);
    }
    // A store renamed part-way through its history keeps whichever name its
    // rows carry most recently; the ledger renders per-row names either way.
    const name = String(e.storeName ?? '').trim();
    if (name) bucket.name = name;
    bucket.count += 1;
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Apply the filter. Order is preserved exactly — the caller still walks the
 * result newest-first itself.
 *
 * `unpaidOnly` means "money a store still owes me": a pending sale that has not
 * been voided. A voided row moved no money, and a paid one is closed, so
 * neither belongs in the answer to that question.
 */
export function filterLedgerEntries(entries, filter) {
  const list = Array.isArray(entries) ? entries : [];
  if (!ledgerFilterIsActive(filter)) return list;
  return list.filter((e) => {
    if (!e) return false;
    if (filter.storeId && !sameStore(e.storeId, filter.storeId)) return false;
    if (filter.type && e.type !== filter.type) return false;
    if (filter.unpaidOnly && (e.voided || e.status !== 'pending')) return false;
    return true;
  });
}

/**
 * How many rows each type toggle would leave, given the rest of the filter.
 *
 * Counted with that toggle's own dimension removed, so the number on a chip
 * says "what you would see if you pressed this" rather than "what you can see
 * now" — a chip reading 0 is then an honest dead end rather than an artefact of
 * a different chip already being on.
 */
export function ledgerTypeCounts(entries, filter) {
  const base = filter || emptyLedgerFilter();
  const counts = {};
  for (const { key } of LEDGER_TYPE_FILTERS) {
    counts[key] = filterLedgerEntries(entries, { ...base, type: key }).length;
  }
  counts.unpaid = filterLedgerEntries(entries, { ...base, unpaidOnly: true }).length;
  return counts;
}

/**
 * A plain sentence describing what is on screen, for the line under the
 * controls. No HTML, no markup — the caller escapes and wraps it.
 *
 * `storeName` is passed in rather than looked up because the caller already
 * holds the picker's option list.
 */
export function describeLedgerFilter(filter, { shown = 0, total = 0, storeName = '' } = {}) {
  const active = ledgerFilterIsActive(filter);
  const entryWord = (n) => (n === 1 ? 'entry' : 'entries');
  if (!active) {
    return {
      active: false,
      headline: `${total} ${entryWord(total)}`,
      detail: 'Every shipment, sale and return for this book.',
      parts: [],
    };
  }

  const parts = [];
  if (filter.storeId) parts.push(String(storeName || '').trim() || 'one store');
  if (filter.type) {
    const found = LEDGER_TYPE_FILTERS.find((t) => t.key === filter.type);
    parts.push((found ? found.label : filter.type).toLowerCase());
  }
  if (filter.unpaidOnly) parts.push('still unpaid');

  // The empty result is the one case where a count alone is useless — it has to
  // say that the rows exist and the filter is what is hiding them, or it reads
  // as "this book has no consignment history".
  const detail = shown === 0
    ? `Nothing here matches — the other ${total} ${entryWord(total)} are hidden by this filter.`
    : `Totals below cover these ${shown} ${entryWord(shown)} only.`;

  return {
    active: true,
    headline: `Showing ${shown} of ${total} ${entryWord(total)}`,
    detail,
    parts,
  };
}

/**
 * The label the totals row wears when the ledger is narrowed to one store, so
 * "Still owed to you" can't be mistaken for the whole book's outstanding
 * balance when it is really one shop's.
 */
export function ledgerTotalsScope(filter, storeName) {
  if (!filter || !filter.storeId) return '';
  const name = String(storeName || '').trim();
  return name ? `from ${name}` : 'from this store';
}
