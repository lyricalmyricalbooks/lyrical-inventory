/**
 * customer-segment.js — plain-language description of the buyer filters.
 *
 * The Customers tab has five independent filters (search text, book, sales
 * channel, total spend, order count) and three buttons that act on whatever
 * those filters leave behind: Copy segment, Export segment, Email segment.
 *
 * Nothing on that screen used to say which filters were on. A book filter left
 * over from last week is invisible, and the next "Email segment" quietly BCCs a
 * fraction of the mailing list — a mistake that is impossible to un-send. This
 * module turns the raw filter state into the sentence a person would say out
 * loud ("Book: Small Hours", "Spent over $100"), so the chip row and the empty
 * state can both name exactly what is narrowing the list.
 *
 * Pure and string-only on purpose: it never touches the DOM, never escapes
 * HTML (the caller owns escaping, because only the caller knows where the text
 * is going), and never filters anything itself — `_custApplyFilter()` in
 * main.js remains the single source of truth for who is actually in a segment.
 */

/** The channel values the filter <select> offers, spelled the way the owner reads them. */
export const SEGMENT_CHANNEL_LABELS = {
  'Website': 'Website',
  'In Person': 'In Person',
  'Book Fair': 'Book Fair',
  'Consignment': 'Consignment',
  'Stripe': 'Stripe (direct card)',
};

/** Order-count filter values → the phrase shown on the chip. */
export const SEGMENT_ORDER_LABELS = {
  repeat: 'Repeat buyers (2+ orders)',
  single: 'One order only',
};

const str = (v) => (typeof v === 'string' ? v : (v == null ? '' : String(v)));

/**
 * Describe the active buyer filters, newest-to-oldest in the order the controls
 * appear on screen so the chips read left-to-right like the filter panel above
 * them.
 *
 * @param {object} filters              raw filter state
 * @param {string} [filters.search]     free-text search on name/email
 * @param {string} [filters.bookId]     book id, '' for all books
 * @param {string} [filters.channel]    one of SEGMENT_CHANNEL_LABELS' keys
 * @param {string|number} [filters.spend] minimum total spend, '' for any
 * @param {string} [filters.orders]     'repeat' | 'single' | ''
 * @param {object} [opts]
 * @param {(id: string) => string} [opts.bookTitle] resolves a book id to its title
 * @returns {{id: string, label: string}[]} one entry per ACTIVE filter, [] when none are
 */
export function describeCustomerFilters(filters = {}, opts = {}) {
  const f = filters || {};
  const bookTitle = typeof opts.bookTitle === 'function' ? opts.bookTitle : null;
  const out = [];

  const search = str(f.search).trim();
  if (search) out.push({ id: 'search', label: `Search “${search}”` });

  const bookId = str(f.bookId).trim();
  if (bookId) {
    // A book that has since been deleted still has its id sitting in the
    // filter. Falling back to the id keeps the chip removable instead of
    // rendering "Book: undefined" over an invisible filter.
    const title = (bookTitle ? str(bookTitle(bookId)).trim() : '') || bookId;
    out.push({ id: 'book', label: `Book: ${title}` });
  }

  const channel = str(f.channel).trim();
  if (channel) {
    out.push({ id: 'channel', label: `Channel: ${SEGMENT_CHANNEL_LABELS[channel] || channel}` });
  }

  const spendRaw = str(f.spend).trim();
  const spend = Number(spendRaw);
  if (spendRaw && Number.isFinite(spend) && spend > 0) {
    out.push({ id: 'spend', label: `Spent over $${spend}` });
  }

  const orders = str(f.orders).trim();
  if (orders) out.push({ id: 'orders', label: SEGMENT_ORDER_LABELS[orders] || orders });

  return out;
}

/**
 * Join filter labels into one readable clause for a sentence:
 *   []            → ''
 *   [a]           → 'a'
 *   [a, b]        → 'a and b'
 *   [a, b, c]     → 'a, b and c'
 * Serial comma deliberately omitted — this is a sentence the owner reads, not a list.
 */
export function joinFilterLabels(entries = []) {
  const labels = (Array.isArray(entries) ? entries : [])
    .map(e => str(e && e.label).trim())
    .filter(Boolean);
  if (!labels.length) return '';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}
