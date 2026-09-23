// The morning after a day of selling in person.
//
// A market day ends with a box of books, a cash tin, a card reader and no
// energy. The register and the card reader each recorded their part, but
// nothing ever put them side by side, so a missing sale or a stock count that
// is suddenly off was noticed weeks later, if at all. This builds one summary
// of the most recent in-person day, to show the next time the app is opened.
//
// Pure: no DOM, no ledger writes.

export const IN_PERSON_CHANNELS = new Set(['Book Fair', 'POS', 'Fair', 'Event', 'In Person']);

/** How far back a day can be and still be worth summarising. */
export const MARKET_DAY_LOOKBACK_DAYS = 4;

function paidBy(entry) {
  const note = String(entry?.notes || '').toLowerCase();
  if (/card reader|\bcard\b|stripe/.test(note)) return 'card';
  if (/\bcash\b/.test(note)) return 'cash';
  return 'other';
}

/**
 * The most recent day before `today` with in-person sales that has not been
 * summarised yet, or '' when there is none.
 */
export function latestMarketDay(rows = [], { today = '', shownFor = '', lookbackDays = MARKET_DAY_LOOKBACK_DAYS } = {}) {
  const todayMs = Date.parse(today);
  let best = '';
  (Array.isArray(rows) ? rows : []).forEach(({ entry }) => {
    if (!entry || entry.voided || !IN_PERSON_CHANNELS.has(entry.chan)) return;
    const day = String(entry.date || '').slice(0, 10);
    if (!day || day >= today || (shownFor && day <= shownFor)) return;
    if (Number.isFinite(todayMs) && todayMs - Date.parse(day) > lookbackDays * 86400000) return;
    if (day > best) best = day;
  });
  return best;
}

/** Totals for one day: copies per book, how it was paid, and what is left. */
export function summariseMarketDay(rows = [], day = '', { books = {}, stockOf = () => null, unmatched = 0 } = {}) {
  const perBook = new Map();
  const pay = { card: 0, cash: 0, other: 0 };
  let copies = 0;
  (Array.isArray(rows) ? rows : []).forEach(({ bookId, entry }) => {
    if (!entry || entry.voided || !IN_PERSON_CHANNELS.has(entry.chan)) return;
    if (String(entry.date || '').slice(0, 10) !== day) return;
    const qty = Number(entry.qty) || 0;
    copies += qty;
    perBook.set(bookId, (perBook.get(bookId) || 0) + qty);
    pay[paidBy(entry)] += qty;
  });
  const lines = [...perBook.entries()]
    .map(([bookId, qty]) => ({ bookId, qty, title: books[bookId]?.title || 'a book', left: stockOf(bookId) }))
    .sort((a, b) => b.qty - a.qty);
  return { day, copies, lines, pay, unmatched: Number(unmatched) || 0 };
}

/** The card's words. */
export function describeMarketDay(summary) {
  if (!summary || !summary.copies) return { title: '', detail: '', count: 0 };
  const { copies, lines, pay, unmatched } = summary;
  const books = lines.slice(0, 3).map(line => `${line.title} ${line.qty}`).join(', ')
    + (lines.length > 3 ? `, and ${lines.length - 3} more` : '');
  const paid = [pay.card ? `${pay.card} by card` : '', pay.cash ? `${pay.cash} cash` : '', pay.other ? `${pay.other} other` : '']
    .filter(Boolean).join(', ');
  const low = lines.filter(line => Number.isFinite(line.left) && line.left <= 3)
    .map(line => `${line.title} (${line.left} left)`);
  let detail = `${copies} cop${copies === 1 ? 'y' : 'ies'} sold: ${books}.`;
  if (paid) detail += ` Paid ${paid}.`;
  if (unmatched) detail += ` ${unmatched} card payment${unmatched === 1 ? '' : 's'} still need${unmatched === 1 ? 's' : ''} a book picked.`;
  if (low.length) detail += ` Running low: ${low.join(', ')}.`;
  return { title: `Your ${formatDay(summary.day)} at the table`, detail, count: copies, needsYou: unmatched > 0 };
}

function formatDay(day) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'day';
  return d.toLocaleDateString('en-CA', { weekday: 'long' });
}
