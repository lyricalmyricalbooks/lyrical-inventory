// The phone's All Books screen: a masthead, three figures, filter chips and
// one row per title. Pure — the caller passes plain book facts and gets HTML.
import { escapeHtml as esc } from './html.js';

export const PHONE_BOOK_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'low', label: 'Low' },
  { key: 'out', label: 'Sold out' },
  { key: 'stores', label: 'At stores' },
];

// One status per book, worst first: nothing left, running low, then whether
// it has earned back what it cost to make.
export function phoneBookStatus({ onHand = 0, threshold = 0, brokeEven = false } = {}) {
  if (onHand <= 0) return { key: 'out', text: '✕ Sold out', tone: 'red' };
  if (threshold > 0 && onHand <= threshold) return { key: 'low', text: '⚠ Low', tone: 'amber' };
  if (brokeEven) return { key: 'paid', text: '✓ Paid for itself', tone: 'green' };
  return { key: 'selling', text: '● Selling', tone: 'plain' };
}

export function phoneBookMatches(book, filter) {
  const status = phoneBookStatus(book).key;
  if (filter === 'low') return status === 'low';
  if (filter === 'out') return status === 'out';
  if (filter === 'stores') return (book.atStores || 0) > 0;
  return true;
}

const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;

/**
 * books: [{ id, title, author, priceText, printed, onHand, threshold,
 *           brokeEven, atStores, accent }]
 */
export function phoneBooksHtml(books, filter = 'all') {
  const active = PHONE_BOOK_FILTERS.some((f) => f.key === filter) ? filter : 'all';
  const onHand = books.reduce((n, b) => n + Math.max(0, b.onHand || 0), 0);
  const low = books.filter((b) => ['low', 'out'].includes(phoneBookStatus(b).key)).length;
  const shown = books.filter((b) => phoneBookMatches(b, active));
  const fig = (label, value, tone = '') => `<div class="ledger-fig${tone ? ` is-${tone}` : ''}"><span class="ledger-label">${label}</span><span class="ledger-value tnum">${value}</span></div>`;
  const chips = PHONE_BOOK_FILTERS.map((f) => {
    const on = f.key === active;
    return `<button type="button" class="book-chip${on ? ' is-on' : ''}" aria-pressed="${on}" onclick="setPhoneBooksFilter('${f.key}')">${f.label}</button>`;
  }).join('');
  const rows = shown.map((b) => {
    const status = phoneBookStatus(b);
    const meta = [b.author, b.priceText, b.printed ? `${b.printed} printed` : ''].filter(Boolean).map(esc).join(' · ');
    const cover = COLOUR.test(String(b.accent || '').trim()) ? ` style="background:${String(b.accent).trim()}"` : '';
    const idJs = esc(JSON.stringify(String(b.id)));
    return `<button type="button" class="phone-book-row" onclick="switchBook(${idJs})" aria-label="${esc(b.title)}: ${esc(b.onHand)} on hand, ${esc(status.text.slice(2))}">
      <span class="phone-book-cover" aria-hidden="true"${cover}></span>
      <span class="phone-book-txt"><span class="phone-book-title">${esc(b.title)}</span><span class="phone-book-meta">${meta}</span><span class="phone-pill is-${status.tone}">${status.text}</span></span>
      <span class="phone-book-end"><span class="phone-book-count tnum">${esc(b.onHand)}</span><span class="phone-book-unit">on hand</span></span>
    </button>`;
  }).join('');
  const empty = `<p class="phone-sheet-empty">No books match “${esc(PHONE_BOOK_FILTERS.find((f) => f.key === active).label)}”.</p>`;
  return `<div class="phone-kicker">Catalogue · ${books.length} ${books.length === 1 ? 'title' : 'titles'}</div>
    <h1 class="phone-masthead">Books</h1>
    <div class="phone-ledger is-three">${fig('On hand', onHand)}${fig('Titles', books.length)}${fig('Running low', low, low ? 'low' : '')}</div>
    <div class="phone-chips" role="group" aria-label="Show books">${chips}</div>
    <div class="phone-sheet">${rows || empty}</div>`;
}
