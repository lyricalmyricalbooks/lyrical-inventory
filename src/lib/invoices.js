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
