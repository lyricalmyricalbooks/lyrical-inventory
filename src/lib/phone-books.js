// The phone's All Books screen: a masthead, one strip of figures (revenue, sold,
// owed), one bar of where the catalogue sells, then the books ranked in one
// sheet. Pure — the caller passes plain book facts and gets HTML.
import { escapeHtml as esc } from './html.js';

export const PHONE_BOOK_SORTS = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'sold', label: 'Sold' },
  { key: 'title', label: 'Title' },
];

// One status per book, worst first: nothing left, running low, then whether
// it has earned back what it cost to make.
export function phoneBookStatus({ onHand = 0, threshold = 0, brokeEven = false } = {}) {
  if (onHand <= 0) return { key: 'out', text: '✕ Sold out', tone: 'red' };
  if (threshold > 0 && onHand <= threshold) return { key: 'low', text: '⚠ Low', tone: 'amber' };
  if (brokeEven) return { key: 'paid', text: '✓ Paid for itself', tone: 'green' };
  return { key: 'selling', text: '● Selling', tone: 'plain' };
}

export function phoneBooksSortKey(key) {
  return PHONE_BOOK_SORTS.some((s) => s.key === key) ? key : 'revenue';
}

/** The next sort in the cycle Revenue → Sold → Title → Revenue. */
export function nextPhoneBooksSort(key) {
  const i = PHONE_BOOK_SORTS.findIndex((s) => s.key === phoneBooksSortKey(key));
  return PHONE_BOOK_SORTS[(i + 1) % PHONE_BOOK_SORTS.length].key;
}

/** A sorted copy. Ties fall back to the title, so the order never jumps between renders. */
export function sortPhoneBooks(books, key) {
  const byTitle = (a, b) => String(a.title || '').localeCompare(String(b.title || ''));
  const sort = phoneBooksSortKey(key);
  const num = (field) => (a, b) => ((b[field] || 0) - (a[field] || 0)) || byTitle(a, b);
  return [...books].sort(sort === 'title' ? byTitle : num(sort));
}

const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
const colour = (value) => (COLOUR.test(String(value || '').trim()) ? String(value).trim() : '');

function stockLine(book) {
  const status = phoneBookStatus(book);
  if (status.key === 'out') return { text: 'Sold out', tone: 'red' };
  return { text: `${Math.max(0, book.onHand || 0)} left`, tone: status.key === 'low' ? 'amber' : '' };
}

/**
 * books:  [{ id, title, revenue, revenueText, sold, onHand, threshold, brokeEven }]
 * totals: { revenueText, sold, owedText }
 * mix:    [{ name, pct, color }] — channel shares of revenue, biggest first
 * sort:   'revenue' | 'sold' | 'title'
 * channelsOpen: whether the full channel table under the list is showing
 */
export function phoneBooksHtml({ books = [], totals = {}, mix = [], sort = 'revenue', channelsOpen = false } = {}) {
  const sortKey = phoneBooksSortKey(sort);
  const sortLabel = PHONE_BOOK_SORTS.find((s) => s.key === sortKey).label;
  const nextLabel = PHONE_BOOK_SORTS.find((s) => s.key === nextPhoneBooksSort(sortKey)).label;
  const ranked = sortPhoneBooks(books, sortKey);
  let maxSold = 0;
  for (const b of books) maxSold = Math.max(maxSold, b.sold || 0);

  const kpi = (label, value, cls = '') => `<div class="phone-kpi${cls}"><span class="phone-kpi-label">${label}</span><span class="phone-kpi-value tnum">${esc(value)}</span></div>`;
  const kpis = `<div class="phone-kpis">${kpi('Revenue', totals.revenueText || '—', ' is-lead')}${kpi('Sold', String(totals.sold ?? 0))}${kpi('Owed', totals.owedText || '—', totals.owedText ? ' is-owed' : '')}</div>`;

  const shares = mix.filter((m) => m.pct > 0);
  const bar = shares.length
    ? `<div class="phone-mix">
      <div class="phone-mix-bar" role="img" aria-label="Sales by channel: ${esc(shares.map((m) => `${m.name} ${m.pct}%`).join(', '))}">${shares.map((m) => {
        const c = colour(m.color);
        return `<span style="flex:${Number(m.pct) || 0}${c ? `;background:${c}` : ''}"></span>`;
      }).join('')}</div>
      <div class="phone-mix-legend" aria-hidden="true">${shares.map((m) => {
        const c = colour(m.color);
        return `<span><i${c ? ` style="background:${c}"` : ''}></i>${esc(m.name)} ${esc(m.pct)}%</span>`;
      }).join('')}</div>
    </div>`
    : '';

  const rows = ranked.map((b, i) => {
    const stock = stockLine(b);
    const width = maxSold > 0 ? Math.round((b.sold || 0) / maxSold * 100) : 0;
        const revenue = b.revenueText || '—';
    return `<button type="button" class="phone-rank-row" data-action="nav.book" data-book="${esc(String(b.id))}" aria-label="${esc(b.title)}: ${esc(revenue)} revenue, ${esc(b.sold || 0)} sold, ${esc(stock.text)}">
      <span class="phone-rank-n tnum" aria-hidden="true">${i + 1}</span>
      <span class="phone-rank-txt"><span class="phone-rank-title">${esc(b.title)}</span><span class="phone-rank-track" aria-hidden="true"><span style="width:${width}%"></span></span></span>
      <span class="phone-rank-end"><span class="phone-rank-rev tnum">${esc(revenue)}</span><span class="phone-rank-stock${stock.tone ? ` is-${stock.tone}` : ''}">${esc(stock.text)}</span></span>
      <span class="phone-rank-chev" aria-hidden="true">›</span>
    </button>`;
  }).join('');
  const empty = '<p class="phone-sheet-empty">No books yet.</p>';
  // The full channel table (revenue, units, per sale) opens right under the list.
  const more = shares.length
    ? `<button type="button" class="phone-mix-more" data-action="phoneBooks.channels" aria-expanded="${channelsOpen}" aria-controls="all-ch-analytics">${channelsOpen ? 'Hide sales by channel ▴' : 'Sales by channel ▾'}</button>`
    : '';
  const count = `${books.length} ${books.length === 1 ? 'book' : 'books'}`;

  return `<div class="phone-kicker">Catalogue · ${books.length} ${books.length === 1 ? 'title' : 'titles'}</div>
    <h1 class="phone-masthead">Books</h1>
    ${kpis}
    ${bar}
    <div class="phone-books-head"><h2 class="phone-books-count">${count}</h2><button type="button" class="phone-sort-btn" data-action="phoneBooks.sort" aria-label="Sorted by ${sortLabel.toLowerCase()}. Sort by ${nextLabel.toLowerCase()} instead">Sort: ${sortLabel} ▾</button></div>
    <div class="phone-sheet phone-rank">${rows || empty}</div>
    ${more}`;
}
