// An invoice bills a STORE, not a book — one invoice can list copies of several
// titles (see the "Un Fantastico Altrove + The Hound" case). But state is stored
// per book, so an invoice physically lives in exactly one book's document.
//
// Without these helpers the invoice is only ever visible from the book that
// happened to be open when it was written: switch to the other title it bills
// and the invoice has vanished, even though the publisher is looking at a book
// that invoice charges for.
//
// The fix keeps storage as it is — one owning book, so there's a single writer
// and no cross-document write to go wrong offline — and makes VISIBILITY span
// every book the invoice covers. `bookIds` records that span; it's stamped at
// save time and re-derived on read, so invoices written before this existed
// surface under all their titles without needing a re-save.
//
// DOM- and Firestore-free so the matching rules can be unit-tested directly.

// Titles a line item's free-text description names. Descriptions are typed by
// hand ("The Hound ( Production cost wholesale discount =$52 per book)"), so
// this is a containment test against the known titles rather than a parse.
// Longest title first: with both "The Hound" and "The Hound II" on the shelf,
// a line naming the sequel must not also register as the original.
export function booksNamedInText(text, books) {
  const hay = String(text || '').toLowerCase();
  if (!hay.trim()) return [];
  const candidates = (books || [])
    .filter(b => b && b.id && String(b.title || '').trim())
    .sort((a, b) => String(b.title).length - String(a.title).length);

  const found = [];
  let remaining = hay;
  for (const b of candidates) {
    const title = String(b.title).toLowerCase().trim();
    if (remaining.includes(title)) {
      found.push(b.id);
      // Consume the match so a shorter title nested inside it can't also claim
      // this same stretch of text.
      remaining = remaining.split(title).join(' ');
    }
  }
  return found;
}

// The title a single line bills for. `bookId` is what the publisher picked in
// the editor (or what an imported line was stamped with) and always wins; a
// hand-typed line falls back to the title its description names, and a line
// naming none belongs to the book issuing the invoice.
export function lineItemBookId(item, ownerBookId, books) {
  if (item && item.bookId) return item.bookId;
  const named = booksNamedInText(item && item.description, books);
  return named[0] || ownerBookId;
}

// Every book an invoice belongs to: the book that owns it, whatever its line
// items were explicitly stamped with, and any title named in a description.
// Owner always included — an invoice never disappears from the book holding it,
// even if every description was written without a recognisable title.
export function deriveInvoiceBookIds(inv, ownerBookId, books) {
  const ids = [];
  const add = id => { if (id && !ids.includes(id)) ids.push(id); };

  add(ownerBookId);
  for (const it of ((inv && inv.items) || [])) {
    add(it.bookId);                                  // explicit wins
    for (const id of booksNamedInText(it.description, books)) add(id);
  }
  return ids;
}

// The books an invoice is visible from. Prefers the stored span (what the
// publisher last saved) and falls back to deriving it, so an invoice saved
// before `bookIds` existed still shows up under every title it bills.
export function invoiceBookIds(inv, ownerBookId, books) {
  if (inv && Array.isArray(inv.bookIds) && inv.bookIds.length) {
    // Guard the owner: a stored span that somehow omits the book physically
    // holding the invoice would hide it from its own shelf.
    return inv.bookIds.includes(ownerBookId) ? inv.bookIds.slice() : [ownerBookId, ...inv.bookIds];
  }
  return deriveInvoiceBookIds(inv, ownerBookId, books);
}

// True when `bookId` is one of the books this invoice bills.
export function invoiceCoversBook(inv, ownerBookId, bookId, books) {
  return invoiceBookIds(inv, ownerBookId, books).includes(bookId);
}

// Every invoice visible from `bookId`, across all book states — the ones this
// book owns plus the ones another book owns but that bill this title too.
// Returns descriptors `{ inv, ownerBookId, shared }`, where `shared` marks an
// invoice held by a different book (it is read here, written there).
// `skipBookId` filters out books that shouldn't contribute (test books).
export function invoicesForBook(states, books, bookId, skipBookId) {
  const out = [];
  if (!states || !bookId) return out;
  for (const ownerBookId of Object.keys(states)) {
    if (typeof skipBookId === 'function' && skipBookId(ownerBookId)) continue;
    const list = (states[ownerBookId] || {}).invoices;
    if (!Array.isArray(list)) continue;
    for (const inv of list) {
      if (!invoiceCoversBook(inv, ownerBookId, bookId, books)) continue;
      out.push({ inv, ownerBookId, shared: ownerBookId !== bookId });
    }
  }
  return out;
}

// Locate an invoice by id across every book, so viewing, editing, deleting or
// paying one works from whichever title the publisher opened it from — and so
// the write lands on the book that actually holds it.
// Returns { inv, ownerBookId } or null.
export function findInvoiceAcrossBooks(states, id, preferBookId) {
  if (!states || !id) return null;
  // Check the caller's book first: same-book edits stay O(1) and an id
  // collision across books can't steal the one in front of the publisher.
  const order = Object.keys(states);
  if (preferBookId && order.includes(preferBookId)) {
    order.splice(order.indexOf(preferBookId), 1);
    order.unshift(preferBookId);
  }
  for (const ownerBookId of order) {
    const list = (states[ownerBookId] || {}).invoices;
    if (!Array.isArray(list)) continue;
    const inv = list.find(i => i && i.id === id);
    if (inv) return { inv, ownerBookId };
  }
  return null;
}

// The other titles an invoice bills, as display names — what the invoice list
// shows so a shared invoice reads as deliberate rather than as a stray record.
export function otherBookTitles(inv, ownerBookId, bookId, books) {
  const byId = new Map((books || []).filter(b => b && b.id).map(b => [b.id, b]));
  return invoiceBookIds(inv, ownerBookId, books)
    .filter(id => id !== bookId)
    .map(id => (byId.get(id) || {}).title)
    .filter(Boolean);
}

// ── How much of an invoice belongs to each title ─────────────────────────
// A shop pays ONE bill covering several books, but the publisher still has to
// know what each title earned — that is what each author's share is worked out
// from. Splitting by hand off the line items is the step this removes.

const cents = n => Math.round((Number(n) || 0) * 100);

// Split `amount` across `weights` so the parts are whole cents that add back up
// to `amount` exactly. Plain per-share rounding leaves the parts a cent or two
// off the invoice total, which is precisely the kind of drift that makes a
// payout look wrong. Largest-remainder: floor every share, then hand the
// leftover cents to the shares that lost the most in the rounding.
function allocate(amount, weights) {
  const totalCents = cents(amount);
  const weightSum = weights.reduce((a, w) => a + w, 0);
  if (!weights.length) return [];
  if (weightSum <= 0) {
    // Nothing to weight by (a zero-value invoice, or every line free): give it
    // all to the first title rather than inventing a split.
    return weights.map((_, i) => (i === 0 ? totalCents / 100 : 0));
  }
  const exact = weights.map(w => (totalCents * w) / weightSum);
  const floors = exact.map(Math.floor);
  let remainder = totalCents - floors.reduce((a, c) => a + c, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
    floors[order[k].i]++;
  }
  return floors.map(c => c / 100);
}

// Per-title breakdown of one invoice: what each book contributed before the
// invoice-level discount and tax, and what it comes to after both are shared
// out in proportion. The `total` column sums to the invoice total exactly.
// Returns [] when the invoice has no line items.
export function invoiceBookSplit(inv, ownerBookId, books) {
  const items = (inv && inv.items) || [];
  if (!items.length) return [];

  const byId = new Map((books || []).filter(b => b && b.id).map(b => [b.id, b]));
  const order = [];
  const subtotals = new Map();
  for (const it of items) {
    const bid = lineItemBookId(it, ownerBookId, books);
    if (!subtotals.has(bid)) { subtotals.set(bid, 0); order.push(bid); }
    subtotals.set(bid, subtotals.get(bid) + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0));
  }

  const weights = order.map(bid => Math.max(0, cents(subtotals.get(bid))));
  // Prefer the invoice's stored total; fall back to the line sum so a partly
  // filled draft still splits sensibly.
  const subtotalSum = order.reduce((a, bid) => a + subtotals.get(bid), 0);
  const grand = (inv && inv.total != null) ? Number(inv.total) || 0 : subtotalSum;
  const totals = allocate(grand, weights);
  const weightSum = weights.reduce((a, w) => a + w, 0);

  return order.map((bid, i) => ({
    bookId: bid,
    title: (byId.get(bid) || {}).title || bid,
    subtotal: Math.round(subtotals.get(bid) * 100) / 100,
    share: weightSum > 0 ? weights[i] / weightSum : (i === 0 ? 1 : 0),
    total: totals[i],
  }));
}

// One title's slice of an invoice, or null when that title isn't on it.
export function invoiceShareForBook(inv, ownerBookId, bookId, books) {
  return invoiceBookSplit(inv, ownerBookId, books).find(r => r.bookId === bookId) || null;
}

// ── Numbering ────────────────────────────────────────────────────────────
// Numbers are per-book ("INV-ALTROV-2026-004"), which reads as an error to a
// shop holding a bill that also charges for another title. An invoice covering
// more than one book gets a neutral prefix built from the business name
// instead, so the number names the publisher rather than one of its titles.

export const NEUTRAL_PREFIX_FALLBACK = 'LMB';

// Initials of the business name — "Lyricalmyrical Books" → "LB". A single-word
// name keeps its first letters instead ("Nightjar" → "NIGHT") so the prefix is
// still recognisable rather than one bare letter. Derived from the name printed
// on the invoice, so the number reads as the publisher's rather than a title's.
export function neutralInvoicePrefix(businessName) {
  const words = String(businessName || '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return NEUTRAL_PREFIX_FALLBACK;
  if (words.length === 1) return words[0].slice(0, 5).toUpperCase();
  return words.map(w => w[0]).join('').slice(0, 6).toUpperCase();
}

// The prefix an invoice number carries: "INV-ALTROV-2026-004" → "ALTROV".
// Returns '' for anything not in that shape.
export function invoiceNumberPrefix(num) {
  const m = /^INV-(.+)-(\d{4})-(\d+)$/.exec(String(num || '').trim());
  return m ? m[1] : '';
}

// The next free sequence number for one prefix and year, across every book's
// invoices — a neutral-prefixed number is shared between books, so counting
// only the issuing book's list would hand out the same number twice.
export function nextInvoiceSeq(allInvoices, prefix, year) {
  let max = 0;
  for (const inv of (allInvoices || [])) {
    const m = /^INV-(.+)-(\d{4})-(\d+)$/.exec(String((inv && inv.num) || '').trim());
    if (!m) continue;
    if (m[1] !== prefix || m[2] !== String(year)) continue;
    max = Math.max(max, parseInt(m[3], 10) || 0);
  }
  return max + 1;
}

export function buildInvoiceNumber(prefix, year, seq) {
  return `INV-${prefix}-${year}-${String(seq).padStart(3, '0')}`;
}

