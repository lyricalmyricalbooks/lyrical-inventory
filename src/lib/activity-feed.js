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
    auto: false,
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
    if (!h || h.artistPending || h.consignmentLink) return;
    // hist has no id, so the key is built from whatever identity the row does
    // carry — the sheets event id, the order number, else its position.
    const rowKey = `${book?.id || '?'}:${h.sheetsId || h.num || i}`;
    const cur = entryNativeCode(h, book);
    const qty = qtyOf(h.qty);
    const who = String(h.shipName || '').trim();
    const order = h.num ? ` (${h.num})` : '';

    // A reversed sale: the sale itself no longer counts, but the reversal is
    // exactly the kind of thing the owner needs to be able to see happened.
    if (h.voided) {
      if (h.voidedAt || h.voidedReason) {
        const rev = event({
          book, date: h.voidedAt || h.date, tie: h.voidedAt, kind: 'reversal', icon: '↩️',
          text: `Sale reversed — ${copies(qty)}${book?.title || 'a book'}${order}${h.voidedReason ? ` · ${h.voidedReason}` : ''}`,
          amount: `−${fmt(qty * (Number(h.price) || 0), cur)}`,
          tone: 'neg',
        });
        rev.key = `hist-void:${rowKey}`;
        out.push(rev);
      }
      return;
    }

    const via = /card reader/i.test(String(h.notes || ''))
      ? 'the card reader'
      : (String(h.chan || '').trim() || 'Direct');
    const ev = h.gratuity
      ? event({
        book, date: h.date, tie: h.id, kind: 'gratuity', icon: '🎁',
        text: `Gifted ${copies(qty)}${book?.title || 'a copy'}`,
      })
      : event({
        book, date: h.date, tie: h.id, kind: h.autoRecorded ? 'sale-auto' : 'sale', icon: h.autoRecorded ? '⚡' : '🛒',
        text: `${h.autoRecorded ? 'Recorded for you' : 'Sale recorded'} — ${copies(qty)}${book?.title || 'a book'} via ${via}${who && h.autoRecorded ? `, ${who}` : ''}`,
        amount: `+${fmt(qty * (Number(h.price) || 0), cur)}`,
        tone: 'pos',
      });
    ev.key = `hist:${rowKey}`;
    // Done without anyone pressing anything — shown with an "Automatic" mark.
    if (h.autoRecorded && !h.gratuity) ev.auto = true;
    out.push(ev);

    // The parcel's journey, from the dates already stamped on the order.
    if (h.shipped && h.shippedDate) {
      const sent = event({
        book, date: h.shippedDate, tie: h.id, kind: 'shipped', icon: '📦',
        text: `Sent ${who ? `${who}’s` : 'an'} order${order}${h.trackingNumber
          ? (h.trackingSource === 'bigcartel' ? ' — tracking from Big Cartel' : ' — tracking added')
          : ''}`,
      });
      sent.key = `hist-shipped:${rowKey}`;
      out.push(sent);
    }
    if (h.deliveredDate) {
      const got = event({
        book, date: h.deliveredDate, tie: h.id, kind: 'delivered', icon: '📬',
        text: `Delivered to ${who || 'the customer'}${order}`,
      });
      got.key = `hist-delivered:${rowKey}`;
      // Only the parcel watch writes a delivery date; nobody types one in.
      got.auto = true;
      out.push(got);
    }
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
    const invKey = `${book?.id || '?'}:${inv.id || inv.num}`;
    const store = inv.storeName || 'a store';
    const num = String(inv.num || '').trim();
    const ev = event({
      book, date: inv.date || inv.createdAt, tie: inv.createdAt || inv.id, kind: 'invoice', icon: '📄',
      text: `Invoice ${num} raised for ${store}`.replace('  ', ' '),
      amount: fmt(Number(inv.total) || 0, cur),
    });
    ev.key = `invoice:${invKey}`;
    out.push(ev);

    // Paid — and whether the card payment settled it without anyone's help.
    if (inv.status === 'paid' && inv.paidAt) {
      const paid = event({
        book, date: inv.paidAt, tie: inv.paidAt, kind: 'invoice-paid', icon: '✅',
        text: `${store} paid invoice ${num}${inv.stripeChargeId ? ' by card' : ''}`.replace('  ', ' '),
        amount: `+${fmt(Number(inv.total) || 0, cur)}`,
        tone: 'pos',
      });
      paid.key = `invoice-paid:${invKey}`;
      paid.auto = !!inv.stripeChargeId;
      out.push(paid);
    }

    (Array.isArray(inv.stripePartPayments) ? inv.stripePartPayments : []).forEach((part, i) => {
      const got = event({
        book, date: part.at, tie: part.at, kind: 'invoice-part', icon: '🧾',
        text: `${store} paid part of invoice ${num} by card`.replace('  ', ' '),
        amount: `+${fmt((Number(part.amountMinor) || 0) / 100, part.currency || cur)}`,
        tone: 'pos',
      });
      got.key = `invoice-part:${invKey}:${part.chargeId || i}`;
      got.auto = true;
      out.push(got);
    });

    // Reminders the app emailed about this invoice. Only ones that went out.
    (Array.isArray(inv.reminders) ? inv.reminders : []).forEach((r, i) => {
      if (!r || r.status !== 'sent') return;
      const sent = event({
        book, date: r.at, tie: r.at, kind: 'invoice-reminder', icon: '✉️',
        text: `Payment reminder emailed to ${store} for invoice ${num}`.replace('  ', ' '),
      });
      sent.key = `invoice-reminder:${invKey}:${r.at || i}`;
      sent.auto = r.kind === 'auto';
      out.push(sent);
    });
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
 * Shipping labels and filed receipts: business-wide costs that live in the
 * Tax Centre rather than under any one book, so the per-book walk above never
 * saw them. Each keeps its own currency, like everything else here.
 */
function businessExpenseEvents(expenses) {
  const out = [];
  (Array.isArray(expenses) ? expenses : []).forEach((e, i) => {
    if (!e || e.voided) return;
    const ref = String(e.ref || '');
    const isLabel = ref.startsWith('shippo:') || ref.startsWith('canadapost:');
    if (!isLabel && !e.importedFromEmail) return;
    const cur = e.currency || e.origCurrency || 'CAD';
    const amount = Number(e.amount) || 0;
    const ev = event({
      book: null,
      date: e.importedAt || e.date,
      tie: e.id,
      kind: isLabel ? 'postage' : 'receipt',
      icon: isLabel ? '🏷️' : '🧾',
      text: isLabel
        ? `Shipping label${e.shippingOrderNumber ? ` for ${e.shippingOrderNumber}` : ''}${e.postageSource === 'canadapost' ? ' (bought on the Canada Post website)' : ''} — ${String(e.desc || 'postage').trim()}`
        : `Receipt filed — ${String(e.vendor || e.desc || 'an expense').trim()}${e.cat ? ` (${e.cat})` : ''}`,
      amount: amount ? `−${fmt(Math.abs(amount), cur)}` : null,
      tone: amount ? 'neg' : null,
    });
    ev.key = `business-expense:${e.id || ref || i}`;
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
  all.push(...businessExpenseEvents(opts.businessExpenses));
  // Newest day first, then the later-recorded row within a day. Array.sort is
  // stable, so rows that match on both keep the order they were collected in —
  // which for `hist` is already newest-first (it is unshifted, not pushed).
  all.sort((a, b) => (b.sortKey - a.sortKey) || (b.tie - a.tie));
  return limit ? all.slice(0, limit) : all;
}
