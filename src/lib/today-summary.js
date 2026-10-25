// ── "TODAY SO FAR" ON THE PHONE HOME ────────────────────────────────────
//
// What was sold today across every book, whichever way it was sold: the
// register, Manual entry, the website, a consignment shop. Pure, so the home
// strip and the tests share one rule.
//
// What counts matches the Dashboard's revenue, so the strip never disagrees
// with History for the same day:
//   - a sale still held by the artist counts (the Dashboard counts it too)
//   - a consignment sale counts at the stored price, the publisher's share
//   - a voided row, a gratuity (a free copy) and another day's row do not
// Totals are kept per currency and never converted.

/**
 * @param {{ id: string, currency?: string, hist?: object[] }[]} books
 * @param {string} day  YYYY-MM-DD, the same form rows are stamped with
 * @returns {{ sales: number, units: number, totals: Record<string, number> }}
 */
export function salesForDay(books, day) {
  const seen = new Set();
  const totals = {};
  let units = 0;
  for (const book of books || []) {
    for (const h of book.hist || []) {
      if (!h || h.voided || h.gratuity || h.chan === 'Gratuity' || h.date !== day) continue;
      const qty = Number(h.qty) || 0;
      if (qty <= 0) continue;
      const amount = qty * (Number(h.price) || 0);
      const cur = h.cur || book.currency || 'CAD';
      totals[cur] = (totals[cur] || 0) + amount;
      units += qty;
      // One checkout can span several books (same number, same channel): one sale.
      // A row with no number is a sale of its own.
      seen.add(h.num ? `${h.chan}|${h.num}` : `row|${book.id}|${seen.size}`);
    }
  }
  return { sales: seen.size, units, totals };
}

// A row's identity across two copies of the same ledger: its event id when it
// has one, otherwise the fields a sale is made of.
function rowKey(h) {
  return h.sheetsId ? `id|${h.sheetsId}` : `row|${h.chan}|${h.num}|${h.date}|${h.qty}|${h.price}`;
}

/**
 * Today's sales that are on this phone but not yet in the cloud. Only books
 * with a change waiting are passed a `savedHist` — the ledger as the cloud last
 * confirmed it; every other book is skipped. Counted the same way as
 * salesForDay, so "3 sold, 1 waiting" can't add up to more than was sold.
 *
 * @param {{ id: string, hist?: object[], savedHist?: object[] }[]} books
 * @param {string} day  YYYY-MM-DD
 * @returns {{ sales: number, units: number }}
 */
export function unsentSalesForDay(books, day) {
  const seen = new Set();
  let units = 0;
  for (const book of books || []) {
    if (!Array.isArray(book.savedHist)) continue;
    const saved = new Set(book.savedHist.filter(Boolean).map(rowKey));
    for (const h of book.hist || []) {
      if (!h || h.voided || h.gratuity || h.chan === 'Gratuity' || h.date !== day) continue;
      const qty = Number(h.qty) || 0;
      if (qty <= 0 || saved.has(rowKey(h))) continue;
      units += qty;
      seen.add(h.num ? `${h.chan}|${h.num}` : `row|${book.id}|${seen.size}`);
    }
  }
  return { sales: seen.size, units };
}
