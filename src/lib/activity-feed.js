// ── RECENT ACTIVITY ────────────────────────────────────────────────────────
//
// One chronological answer to "what has actually been happening in the shop?",
// merged across every book.
//
// Nothing here is recorded specially for the feed. Every entry is DERIVED from
// records the app already writes when the publisher sells, ships, spends or
// invoices — which is the whole point: a feed with its own write path would be
// one more thing to keep in sync offline, and would start disagreeing with the
// ledgers the moment a write failed. Derive it and it cannot drift.
//
// The app already has a cross-book event normaliser in the Tax Centre
// (`_tcBuildLedger`), and a per-book one in `buildOrderTimeline`. This is the
// landing-page cousin: not year-filtered, and it carries the sources those two
// skip — consignment shipments and returns, stock handed to the author,
// invoices, and payouts.
//
// Three details the source data forces on us, each of which has bitten before:
//
//   1. `hist` rows have NO id (see lib/merge-state.js) — identity there is by
//      content. Every other array mints a `Date.now()` id. So keys are
//      synthesized rather than read.
//   2. Dates arrive in three shapes: date-only 'YYYY-MM-DD' (most rows), a full
//      ISO datetime (payout requests), and raw epoch ms (invoice createdAt).
//      They all have to land on one sortable number.
//   3. A row's money is denominated in the currency stamped ON THAT ROW, not in
//      whatever the book's currency says today — a book's currency can be
//      edited after the fact. Hence entryNativeCode() everywhere, and no totals
//      anywhere: this feed never adds two amounts together, so it can never add
//      two currencies together.

import { fmt, entryNativeCode, getBookCurrencyCode } from './money.js';

/** How many events the feed returns unless the caller asks for more. */
export const ACTIVITY_LIMIT = 40;

/**
 * Turn any of the three stored date shapes into one sortable epoch number.
 *
 * Date-only strings are pinned to local noon rather than midnight, the same
 * trick `fmtD` uses: midnight UTC lands on the previous calendar day for
 * anyone west of Greenwich, which would shuffle a day's events into the wrong
 * bucket for exactly the publisher this app is built for.
 */
export function activityTimestamp(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const pinned = Date.parse(`${raw}T12:00:00`);
    return Number.isFinite(pinned) ? pinned : 0;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The day an event belongs to, for grouping and display. */
function dayOf(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const ts = activityTimestamp(value);
  if (!ts) return '';
  return new Date(ts).toISOString().slice(0, 10);
}

/** Numeric ids are `Date.now()` stamps; anything else sorts as 0. */
function tieOf(id) {
  const n = Number(id);
  return Number.isFinite(n) ? n : 0;
}

const qtyOf = (v) => Math.max(0, parseInt(v, 10) || 0);

/** "3× " for a multi-copy row, nothing for a single. Keeps the sentence short. */
function copies(qty) {
  const n = qtyOf(qty);
  return n > 1 ? `${n}× ` : '';
}

/**
 * One normalized event. `text` is already written for the shop owner — the
 * renderer only wraps it in markup.
 */
function event({ book, date, tie, kind, icon, text, amount = null, tone = null }) {
  return {
    key: '',
    kind,
    date: dayOf(date),
    sortKey: activityTimestamp(date),
    tie: tieOf(tie),
    bookId: book?.id || '',
    bookTitle: book?.title || '',
    accent: book?.accent || '',
    icon,
    text,
    amount,
    tone,
  };
}

/**
 * Every event from one book, unsorted.
 *
 * Consignment sales are read from the LEDGER, not from history: the app writes
 * a mirror row into `hist` for each one (tagged `consignmentLink`) so the
 * History tab can show it, and reporting both would show every store sale
 * twice. The ledger row is the canonical one — the same call the on-hand math
 * makes in deriveOnHand().
 */
function eventsForBook(book, state) {
  const s = state || {};
  const out = [];
  const bookCur = getBookCurrencyCode(book);

  (s.hist || []).forEach((h, i) => {
    if (!h || h.voided || h.artistPending || h.consignmentLink) return;
    const cur = entryNativeCode(h, book);
    const qty = qtyOf(h.qty);
    const ev = h.gratuity
      ? event({
        book, date: h.date, tie: h.id, kind: 'gratuity', icon: '🎁',
        text: `Gifted ${copies(qty)}${book?.title || 'a copy'}`,
      })
      : event({
        book, date: h.date, tie: h.id, kind: 'sale', icon: '🛒',
        text: `Sale recorded — ${copies(qty)}${book?.title || 'a book'} via ${String(h.chan || '').trim() || 'Direct'}`,
        amount: `+${fmt(qty * (Number(h.price) || 0), cur)}`,
        tone: 'pos',
      });
    // hist has no id, so the key is built from whatever identity the row does
    // carry — the sheets event id, the order number, else its position.
    ev.key = `hist:${book?.id || '?'}:${h.sheetsId || h.num || i}`;
    out.push(ev);
  });

  (s.ledger || []).forEach((e) => {
    if (!e || e.voided) return;
    const cur = entryNativeCode(e, book);
    const qty = qtyOf(e.qty);
    const store = e.storeName || 'a store';
    let ev = null;
    if (e.type === 'Shipment') {
      ev = event({
        book, date: e.date, tie: e.id, kind: 'consign-shipment', icon: '📦',
        text: `Sent ${copies(qty)}${book?.title || 'books'} to ${store}`,
      });
    } else if (e.type === 'Sale') {
      const due = Number(e.amountDue) || 0;
      ev = event({
        book, date: e.date, tie: e.id, kind: 'consign-sale', icon: '🏪',
        text: `${store} sold ${copies(qty)}${book?.title || 'a book'}`,
        amount: due > 0 ? `+${fmt(due, cur)}` : null,
        tone: due > 0 ? 'pos' : null,
      });
    } else if (e.type === 'Return') {
      ev = e.status === 'restocked'
        ? event({
          book, date: e.date, tie: e.id, kind: 'consign-return', icon: '↩️',
          text: `${copies(qty)}${book?.title || 'books'} came back from ${store}`,
        })
        : event({
          book, date: e.date, tie: e.id, kind: 'write-off', icon: '🗑',
          text: `${copies(qty)}${book?.title || 'books'} written off after return from ${store}`,
        });
    }
    if (ev) {
      ev.key = `ledger:${book?.id || '?'}:${e.id}`;
      out.push(ev);
    }
  });

  (s.expenses || []).forEach((e) => {
    if (!e) return;
    const cur = e.currency || bookCur;
    const ev = event({
      book, date: e.date, tie: e.id, kind: 'expense', icon: '🧾',
      text: `Expense logged — ${String(e.desc || 'an expense').trim()}`,
      amount: `−${fmt(Math.abs(Number(e.amount) || 0), cur)}`,
      tone: 'neg',
    });
    ev.key = `expense:${book?.id || '?'}:${e.id}`;
    out.push(ev);
  });

  (s.invoices || []).forEach((inv) => {
    if (!inv) return;
    const cur = inv.currencyCode || inv.currency || bookCur;
    const ev = event({
      book, date: inv.date || inv.createdAt, tie: inv.createdAt || inv.id, kind: 'invoice', icon: '📄',
      text: `Invoice ${inv.num || ''} raised for ${inv.storeName || 'a store'}`.replace('  ', ' '),
      amount: fmt(Number(inv.total) || 0, cur),
    });
    ev.key = `invoice:${book?.id || '?'}:${inv.id || inv.num}`;
    out.push(ev);
  });

  (s.artistPayouts || []).forEach((p) => {
    if (!p) return;
    const cur = entryNativeCode(p, book);
    const ev = event({
      book, date: p.date, tie: p.id, kind: 'payout', icon: '💸',
      text: `Paid ${book?.author || 'the artist'} their share of ${book?.title || 'this book'}`,
      amount: `−${fmt(Math.abs(Number(p.amount) || 0), cur)}`,
      tone: 'neg',
    });
    ev.key = `payout:${book?.id || '?'}:${p.id}`;
    out.push(ev);
  });

  (s.payoutRequests || []).forEach((r) => {
    if (!r || r.settled) return;
    const ev = event({
      book, date: r.requestedAt, tie: r.id, kind: 'payout-request', icon: '🙋',
      text: `${book?.author || 'The artist'} asked to be paid for ${book?.title || 'this book'}`,
      amount: fmt(Number(r.amount) || 0, r.currency || bookCur),
    });
    ev.key = `payout-request:${book?.id || '?'}:${r.id}`;
    out.push(ev);
  });

  (s.stockTransfers || []).forEach((t) => {
    if (!t) return;
    const qty = qtyOf(t.qty);
    const toAuthor = t.direction === 'to_author';
    const ev = event({
      book, date: t.date, tie: t.id, kind: 'stock-transfer', icon: '📚',
      text: toAuthor
        ? `${copies(qty)}${book?.title || 'books'} handed to ${book?.author || 'the author'}`
        : `${copies(qty)}${book?.title || 'books'} came back from ${book?.author || 'the author'}`,
    });
    ev.key = `stock-transfer:${book?.id || '?'}:${t.id}`;
    out.push(ev);
  });

  return out;
}

/**
 * The whole catalogue's recent activity, newest first.
 *
 * @param {Array} books   the books to include — the caller filters out test books
 * @param {Object} states  bookId → state, as held by the app
 * @param {{limit?: number}} [opts]
 * @returns {Array} at most `limit` events, newest first
 */
export function buildActivityFeed(books, states, opts = {}) {
  const limit = Number.isFinite(opts.limit) ? Math.max(0, opts.limit) : ACTIVITY_LIMIT;
  const list = Array.isArray(books) ? books : [];
  const all = [];
  for (const book of list) {
    if (!book) continue;
    all.push(...eventsForBook(book, (states || {})[book.id]));
  }
  // Newest day first, then the later-recorded row within a day. Array.sort is
  // stable, so rows that match on both keep the order they were collected in —
  // which for `hist` is already newest-first (it is unshifted, not pushed).
  all.sort((a, b) => (b.sortKey - a.sortKey) || (b.tie - a.tie));
  return limit ? all.slice(0, limit) : all;
}
