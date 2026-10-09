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
