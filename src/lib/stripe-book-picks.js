// The book the publisher picked for a kind of Stripe payment, remembered so
// the next payment like it lands in "Ready" with that book already filled in.
//
// WHY THIS EXISTS
// A fair tap with no title, at a price two books share, can't be placed by
// the app. She picks the book by hand, and on the next fair day she picks the
// same book for the same tap again. Once she has picked it, the app offers
// that book next time. It is only ever a suggestion: a remembered book goes
// to "Ready", where she confirms it; it never records a sale by itself.
//
// WHAT "A PAYMENT LIKE THIS" MEANS
// Same currency, same amount to the cent, and the same note on it (the
// description, lowercased with spacing tidied, empty for an untitled tap).
//
// HOW IT SYNCS
// Like the "Not a book sale" list (stripe-dismissals.js): entries in the Tax
// Centre document, merged across devices as a union (UNION_METADATA_KEYS in
// merge-state.js). Each entry is "p|<payment kind>|<book>|<ms>"; the latest
// one for a kind of payment wins.

/** The Tax Centre field that holds the list. */
export const STRIPE_BOOK_PICKS_KEY = 'stripeBookPicks';

/** Picks older than this are dropped. */
export const PICK_KEEP_MS = 400 * 86400000;

const ENTRY = /^p\|([^|]{1,800})\|([A-Za-z0-9_-]{1,120})\|(\d{1,16})$/;

function parse(entry) {
  const match = ENTRY.exec(String(entry || ''));
  return match ? { key: match[1], bookId: match[2], at: Number(match[3]) } : null;
}

/** The kind of payment this is, as a key safe to store, or '' when it has no amount. */
export function pickKey(payment) {
  const cents = Math.round(Number(payment?.amount) * 100);
  const currency = String(payment?.currency || '').toUpperCase();
  if (!(cents > 0) || !/^[A-Z]{3}$/.test(currency)) return '';
  const note = String(payment?.description || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
  return encodeURIComponent(`${currency}:${cents}:${note}`);
}

/** The book last picked for payments like this one, or ''. */
export function rememberedBook(entries, payment) {
  const key = pickKey(payment);
  if (!key) return '';
  let best = null;
  (Array.isArray(entries) ? entries : []).forEach(raw => {
    const entry = parse(raw);
    if (entry && entry.key === key && (!best || entry.at > best.at)) best = entry;
  });
  return best ? best.bookId : '';
}

/**
 * The list with this pick added, older picks for the same kind of payment
 * and anything older than `keepMs` dropped. Returns the same array when the
 * pick is already the latest, so a caller can skip saving.
 */
export function withPick(entries = [], payment, bookId, now = Date.now(), keepMs = PICK_KEEP_MS) {
  const list = Array.isArray(entries) ? entries : [];
  const key = pickKey(payment);
  if (!key || !/^[A-Za-z0-9_-]{1,120}$/.test(String(bookId || ''))) return list;
  if (rememberedBook(list, payment) === bookId) return list;
  const kept = list.filter(raw => {
    const entry = parse(raw);
    return entry && entry.key !== key && now - entry.at <= keepMs;
  });
  return [...kept, `p|${key}|${bookId}|${Math.floor(now)}`];
}
