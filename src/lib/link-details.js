// Book details that differ between the shop's website and this app.
//
// The website lists, in `websiteLink/catalog.linked`, every printed edition it
// sells that is matched to a book here. Both apps compare those details with
// this app's own books by the same rule (docs/website-link.md › "Book details
// in step, and one search"), and both test it against the shared case in
// docs/link-details-fixture.json. Each app only ever offers to change its OWN
// book, after the owner presses a button.
//
// Everything here is pure and tested (tests/link-details.test.js). The list on
// the Website orders card is src/features/website-link.js.

export const DETAIL_FIELDS = Object.freeze(['title', 'author', 'isbn', 'price']);
export const MAX_DETAILS = 100;
export const MAX_LINKED = 500;

/** What each field is called on screen. */
export const DETAIL_FIELD_WORDS = Object.freeze({ title: 'Title', author: 'Author', isbn: 'ISBN', price: 'Price' });

// Canadian dollars, however the book writes it (the contract's rule).
const CANADIAN = /^(|cad|ca\$|c\$|\$)$/i;

const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);

/** A value tidied for comparing: spaces folded, ISBN bare and upper case, price with two decimals. */
export function detailValue(field, value) {
  if (field === 'price') return Number(value) > 0 ? (Math.round(Number(value) * 100) / 100).toFixed(2) : '';
  const v = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (field === 'isbn') return v === '—' ? '' : v.replace(/[\s-]+/g, '').toUpperCase();
  return v;
}

/** True when a book's currency means Canadian dollars (empty counts). */
export function isCanadian(currency) {
  return CANADIAN.test(String(currency ?? '').trim());
}

/**
 * The details the website and this app disagree on, by the shared rule:
 * linked editions grouped by app book (a group spanning two website books is
 * skipped), title and author always, ISBN and price only for a single edition,
 * price only for a book priced in Canadian dollars. A difference the owner left
 * as is (`kept`: id → signature) is left out before the list is sorted and cut
 * to 100. Sorted by title, then field.
 */
export function detailDifferences(linked, appBooks, kept = {}) {
  const left = kept && typeof kept === 'object' ? kept : {};
  const app = new Map((Array.isArray(appBooks) ? appBooks : []).filter(b => b && b.id).map(b => [b.id, b]));
  const groups = new Map();
  for (const row of (Array.isArray(linked) ? linked : []).slice(0, MAX_LINKED)) {
    if (!row || !row.inventoryBookId) continue;
    if (!groups.has(row.inventoryBookId)) groups.set(row.inventoryBookId, []);
    groups.get(row.inventoryBookId).push(row);
  }
  const out = [];
  for (const [inventoryBookId, rows] of groups) {
    const ours = app.get(inventoryBookId);
    if (!ours || new Set(rows.map(r => r.bookId)).size > 1) continue;
    const first = rows[0];
    const single = Number(first.sharedWith) === 1;
    const cad = isCanadian(ours.currency);
    for (const field of DETAIL_FIELDS) {
      if ((field === 'isbn' || field === 'price') && !single) continue;
      if (field === 'price' && !cad) continue;
      const shop = detailValue(field, first[field]);
      const mine = detailValue(field, ours[field]);
      if (shop === mine) continue;
      if (left[`${inventoryBookId}|${field}`] === JSON.stringify([shop, mine])) continue;
      out.push({
        id: `${inventoryBookId}|${field}`, inventoryBookId, bookId: first.bookId,
        variantId: single ? (first.variantId || null) : null,
        field, title: text(first.title, 200), shop, app: mine,
      });
    }
  }
  return out
    .sort((a, b) => a.title.localeCompare(b.title) || DETAIL_FIELDS.indexOf(a.field) - DETAIL_FIELDS.indexOf(b.field))
    .slice(0, MAX_DETAILS);
}

/** A difference's signature: "Leave as is" holds until either value changes. */
export function detailSignature(diff) {
  return JSON.stringify([diff && diff.shop, diff && diff.app]);
}

/** The differences still to show: those the owner hasn't left as they are (`kept`: id → signature). */
export function openDifferences(diffs, kept = {}) {
  const k = kept && typeof kept === 'object' ? kept : {};
  return (Array.isArray(diffs) ? diffs : []).filter(d => k[d.id] !== detailSignature(d));
}

/**
 * This app's books as the comparison reads them — the same fields the website
 * reads from settings/catalog: id, title, author, ISBN ("—" = none), list price
 * and the currency as stored.
 */
export function appBooksForDetails(books) {
  return (Array.isArray(books) ? books : []).filter(b => b && b.id).map(b => ({
    id: String(b.id),
    title: text(b.title, 200) || String(b.id),
    author: text(b.author, 200),
    isbn: text(b.isbn, 40).replace(/^—$/, ''),
    price: Number(b.listPrice) > 0 ? Math.round(Number(b.listPrice) * 100) / 100 : null,
    currency: text(b.currency, 8),
  }));
}

/**
 * The change "Use the website's" makes to this app's book, or null when there
 * is nothing to copy (nothing ever blanks a field). Price → listPrice.
 */
export function detailPatchForApp(diff) {
  if (!diff || !diff.shop) return null;
  if (diff.field === 'title') return { title: diff.shop };
  if (diff.field === 'author') return { author: diff.shop };
  if (diff.field === 'isbn') return { isbn: diff.shop };
  if (diff.field === 'price') {
    const price = Number(diff.shop);
    return price > 0 ? { listPrice: price } : null;
  }
  return null;
}

/** "Website: X · This app: Y", with "nothing" for an empty side. */
export function detailCompareWords(diff) {
  const show = (v) => (v ? (diff.field === 'price' ? `CA$${v}` : v) : 'nothing');
  return `Website: ${show(diff.shop)} · This app: ${show(diff.app)}`;
}

/** Remembered choices, newest last, at most `max` (the oldest are forgotten first). */
export function pruneKept(kept = {}, max = 300) {
  const entries = Object.entries(kept && typeof kept === 'object' ? kept : {}).filter(([, sig]) => typeof sig === 'string');
  return Object.fromEntries(entries.slice(-max));
}
