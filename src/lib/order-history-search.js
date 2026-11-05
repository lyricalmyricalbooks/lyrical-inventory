/**
 * order-history-search.js — find one order in a book's whole history.
 *
 * Order History is the busiest money table in the app and the only large one
 * with no way to search it. The tax ledger, the customer list, the Stripe
 * reconciliation queue and the receipt gallery all have a search box; here the
 * question "what happened with order 1042?" or "which sales went to Massy
 * Books?" meant pressing "Show all", waiting for four hundred rows to paint,
 * and reading with the browser's own find bar.
 *
 * Everything below is a pure read over the rows `buildOrderTimeline()` already
 * built. Nothing is re-sorted, re-tallied or mutated: this module only decides
 * which of those rows the renderer is handed, so the running Stock After column
 * keeps the values the timeline stamped on it rather than a second, divergent
 * walk over a smaller set.
 *
 * **Text only, deliberately.** Dates and amounts are not searchable here. A
 * publisher typing `12` wants order 12, and folding dates into the haystack
 * would bury it under every order placed on the 12th of any month. The fields
 * that are searched are the ones the placeholder names, and no others.
 */

/**
 * The words a channel can be found by.
 *
 * A row stores `POS` but the table paints "In Person", so someone searching
 * what they can see would otherwise match nothing. This mirrors the badge
 * mapping in `formatChannelBadge()` — keep the two in step if a channel is
 * added.
 */
export function channelSearchWords(chan) {
  const raw = String(chan ?? '').trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  if (lower === 'website' || lower === 'big cartel') return [raw, 'Website', 'Big Cartel', 'online'];
  if (lower === 'pos' || lower === 'fair' || lower === 'event' || lower === 'in person') {
    return [raw, 'In Person', 'POS', 'fair', 'event'];
  }
  if (lower === 'consignment' || lower === 'store') return [raw, 'Store', 'Consignment'];
  if (lower === 'direct') return [raw, 'Direct'];
  if (lower === 'gratuity') return [raw, 'Gratuity', 'gift', 'gifted'];
  return [raw];
}

/**
 * Every string one timeline row can be found by.
 *
 * Handles all three row shapes the timeline and the approval queue produce:
 * `{type:'hist', h, i}`, `{type:'consign', e}` and the pending-artist
 * `{type:'pending', h}`. Unknown shapes fall through to an empty list rather
 * than throwing — a row that can't be described simply never matches.
 */
export function historyRowSearchWords(row) {
  if (!row || typeof row !== 'object') return [];

  if (row.type === 'consign') {
    const e = row.e || {};
    const words = ['Consignment', e.storeName, e.notes, e.type];
    if (e.type === 'Shipment') words.push('sent', 'shipment', 'shipped out');
    if (e.type === 'Return') {
      words.push('return', 'returned');
      words.push(e.status === 'restocked' ? 'restocked' : 'written off');
    }
    if (e.voided) words.push('void', 'voided');
    return words.filter(Boolean).map(String);
  }

  const h = row.h || {};
  const words = [h.num, h.notes, ...channelSearchWords(h.chan)];

  // The "Entered by" column falls back to a derived name when the record has
  // none, so search has to fall back the same way or the pill on screen is
  // unsearchable.
  words.push(h.enteredBy || (h.artistPending ? 'Artist' : 'Publisher'));

  if (h.gratuity) words.push('Gratuity', 'gift', 'gifted');
  if (h.voided) words.push('void', 'voided');
  if (h.shipped) words.push('shipped');
  if (h.artistPending) words.push('pending', 'artist');
  // "Awaiting approval", not the "Awaiting Publisher" the author-side button
  // reads: folding that phrase in would make a search for `publisher` — which
  // means "entered by the publisher" everywhere else — also return every row
  // still waiting on one.
  if (row.type === 'pending' || h.pendingAuth) words.push('submitted', 'awaiting approval');

  // A row stamped with another currency wears that code as a badge, so the code
  // is on screen and has to be findable — it is how a publisher pulls up the
  // handful of sales stranded in a previous currency.
  if (h.cur) words.push(h.cur);
  if (h.payment && h.payment.currency) words.push(h.payment.currency);

  return words.filter(Boolean).map(String);
}

/**
 * Split a query into the terms every row must carry.
 *
 * Multi-term queries are AND-ed, which is what makes a two-word search useful:
 * "massy return" narrows, where an OR would widen to every return anywhere.
 */
// Lower case with accents folded, so "montreal" finds "Montréal".
const fold = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function historySearchTerms(query) {
  return fold(String(query ?? ''))
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** True when the query is narrowing anything at all. */
export function historySearchIsActive(query) {
  return historySearchTerms(query).length > 0;
}

/** Does this row carry every term? Substring matching, case-insensitive. */
export function historyRowMatches(row, terms) {
  if (!terms || !terms.length) return true;
  const haystack = fold(historyRowSearchWords(row).join(' \u0000 '));
  return terms.every((t) => haystack.includes(t));
}

/**
 * Apply the search. Order is preserved exactly — the caller still walks the
 * result newest-first itself, and each row keeps the `i` index its Edit button
 * is keyed on, because the row descriptors are passed through untouched.
 */
export function filterHistoryRows(rows, query) {
  const list = Array.isArray(rows) ? rows : [];
  const terms = historySearchTerms(query);
  if (!terms.length) return list;
  return list.filter((row) => historyRowMatches(row, terms));
}

/**
 * A plain sentence describing what is on screen, for the line under the search
 * box. No HTML and no markup — the caller escapes and wraps it.
 *
 * `scope` is the channel filter's label when one is on ("In Person"), so the
 * count can't be mistaken for the whole book's history when it is really one
 * channel's slice of it.
 */
export function describeHistorySearch(query, { shown = 0, total = 0, scope = '' } = {}) {
  const trimmed = String(query ?? '').trim();
  const active = historySearchIsActive(trimmed);
  const orderWord = (n) => (n === 1 ? 'order' : 'orders');
  const scopeName = String(scope ?? '').trim();
  const within = scopeName ? ` ${scopeName}` : '';

  if (!active) {
    return {
      active: false,
      headline: `${total}${within} ${orderWord(total)} on record`,
      detail: 'Search by order number, channel, note, store, or who entered it.',
    };
  }

  // The empty result is the one case where a count alone is useless — it has to
  // say the rows still exist and the search is what is hiding them, or it reads
  // as though the book lost its history.
  const detail = shown === 0
    ? `Nothing matches “${trimmed}” — the other ${total}${within} ${orderWord(total)} are hidden by this search.`
    : `Matching “${trimmed}”. Everything else is hidden until you clear it.`;

  return {
    active: true,
    headline: `Showing ${shown} of ${total}${within} ${orderWord(total)}`,
    detail,
  };
}
