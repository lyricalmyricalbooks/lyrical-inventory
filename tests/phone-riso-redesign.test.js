// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { phoneBooksHtml, phoneBookStatus, sortPhoneBooks, nextPhoneBooksSort } from '../src/lib/phone-books.js';
import { fairTileHtml } from '../src/lib/fair-mode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = read('index.html');
const mainJs = read('src/main.js');
const riso = read('src/styles/phone-riso.css');

describe('All Books on a phone', () => {
  const books = [
    { id: 'a', title: 'Harbour <Lights>', author: 'Ruth', priceText: 'CA$24', printed: 120, onHand: 51, threshold: 10, brokeEven: true, atStores: 6, accent: '#2E6DA4' },
    { id: 'b', title: 'Ember', onHand: 7, threshold: 10, atStores: 0, accent: 'red;background:url(x)' },
    { id: 'c', title: 'Gone', onHand: 0, threshold: 5, atStores: 2 },
  ];
  test('status is worst-first: sold out, low, paid for itself, selling', () => {
    expect(phoneBookStatus({ onHand: 0, brokeEven: true }).key).toBe('out');
    expect(phoneBookStatus({ onHand: 3, threshold: 5, brokeEven: true }).key).toBe('low');
    expect(phoneBookStatus({ onHand: 30, threshold: 5, brokeEven: true }).key).toBe('paid');
    expect(phoneBookStatus({ onHand: 30, threshold: 5 }).key).toBe('selling');
  });
  test('sorts by revenue, sold or title, ties falling back to the title', () => {
    const rows = [{ title: 'B', revenue: 5, sold: 9 }, { title: 'A', revenue: 5, sold: 1 }, { title: 'C', revenue: 9, sold: 2 }];
    expect(sortPhoneBooks(rows, 'revenue').map((b) => b.title)).toEqual(['C', 'A', 'B']);
    expect(sortPhoneBooks(rows, 'sold').map((b) => b.title)).toEqual(['B', 'C', 'A']);
    expect(sortPhoneBooks(rows, 'title').map((b) => b.title)).toEqual(['A', 'B', 'C']);
    expect(sortPhoneBooks(rows, 'nonsense').map((b) => b.title)).toEqual(['C', 'A', 'B']);
    expect(['revenue', 'sold', 'title'].map(nextPhoneBooksSort)).toEqual(['sold', 'title', 'revenue']);
  });
  test('figures, channel bar and escaped ranked rows', () => {
    const ranked = [
      { id: 'a', title: 'Harbour <Lights>', revenue: 900, revenueText: 'CA$900', sold: 40, onHand: 51, threshold: 10 },
      { id: 'b"x', title: 'Ember', revenue: 300, revenueText: 'CA$300', sold: 20, onHand: 7, threshold: 10 },
      { id: 'c', title: 'Gone', revenue: 0, sold: 0, onHand: 0 },
    ];
    const mix = [{ name: 'Fairs', pct: 60, color: '#2E6DA4' }, { name: 'Web', pct: 40, color: 'red;background:url(x)' }, { name: 'None', pct: 0 }];
    document.body.innerHTML = phoneBooksHtml({ books: ranked, totals: { revenueText: 'CA$1,200', sold: 60, owedText: 'CA$80' }, mix });
    expect([...document.querySelectorAll('.phone-kpi-value')].map((n) => n.textContent)).toEqual(['CA$1,200', '60', 'CA$80']);
    const rows = [...document.querySelectorAll('.phone-rank-row')];
    expect(rows.map((r) => r.querySelector('.phone-rank-title').textContent)).toEqual(['Harbour <Lights>', 'Ember', 'Gone']);
    expect(rows[1].dataset.book).toBe('b"x');
    expect(rows.every((r) => r.dataset.action === 'nav.book')).toBe(true);
    expect([...document.querySelectorAll('.phone-rank-stock')].map((n) => n.textContent)).toEqual(['51 left', '7 left', 'Sold out']);
    expect(rows[0].querySelector('.phone-rank-track span').getAttribute('style')).toBe('width:100%');
    // Only a plain colour reaches the style attribute; empty shares drop out.
    const segs = [...document.querySelectorAll('.phone-mix-bar span')].map((n) => n.getAttribute('style'));
    expect(segs).toEqual(['flex:60;background:#2E6DA4', 'flex:40']);
    expect(document.querySelector('.phone-sort-btn').textContent).toContain('Revenue');
    expect(document.querySelector('.phone-mix-more').getAttribute('aria-expanded')).toBe('false');
  });
  test('no books says so, and no sales hides the channel bar', () => {
    document.body.innerHTML = phoneBooksHtml({ books: [] });
    expect(document.querySelector('.phone-sheet-empty').textContent).toContain('No books yet');
    expect(document.querySelector('.phone-mix')).toBeNull();
    expect(document.querySelector('.phone-mix-more')).toBeNull();
  });
  test('wired into the overview', () => {
    expect(html).toMatch(/id="all-books-phone"/);
    expect(mainJs).toMatch(/renderPhoneBooks\(allBooksVisible\);/);
  });
});

describe('Sell rows', () => {
  test('a stepper beside each row: − only once in the sale, + always', () => {
    document.body.innerHTML = fairTileHtml({ id: 'b1', title: 'Moth', priceText: '€20.00', qty: 0, stock: { tracked: true, onHand: 5, remaining: 5, level: 'ok' }, accent: '#123456' });
    expect(document.querySelector('.fm-tile-minus')).toBeNull();
    expect(document.querySelector('.fm-tile-qty').textContent).toBe('0');
    expect(document.querySelector('.fm-tile-plus').getAttribute('onclick')).toBe('posUpdateQty("b1", 1)');
    expect(document.querySelector('.fm-tile-cover').getAttribute('style')).toBe('background:#123456');
    document.body.innerHTML = fairTileHtml({ id: 'b1', title: 'Moth', priceText: '€20.00', qty: 2, stock: { tracked: true, onHand: 5, remaining: 3, level: 'low' } });
    expect(document.querySelector('.fm-tile').classList.contains('is-low')).toBe(true);
    expect(document.querySelector('.fm-tile-qty').textContent).toBe('2');
    expect(document.querySelector('.fm-tile-cover').hasAttribute('style')).toBe(false);
  });
  test('the Charge bar floats above the bottom bar, which stays put while a sale is open', () => {
    expect(riso).not.toMatch(/\.fm-bar:not\(\[hidden\]\)\) \.mnav \{ display: none; \}/);
    expect(riso).toMatch(/bottom: calc\(var\(--mnav-h\) \+ 30px/);
  });
});

describe('Today and Stores', () => {
  test('Today has book chips, a ledger and a Next up head', () => {
    expect(html).toMatch(/id="today-books"/);
    expect(html).toMatch(/id="today-ledger"/);
    expect(html).toMatch(/class="today-next-head"/);
    expect(mainJs).toMatch(/renderTodayLedger\(\);\s*renderBookChips\(\$\('today-books'\)\);/);
  });
  test('each store card leads with a row that opens it', () => {
    expect(mainJs).toMatch(/storePhoneRowHtml\(st, cur, isUnbalanced\)/);
    expect(riso).toMatch(/\.store-card:not\(\.is-open\) > :not\(\.store-row\) \{ display: none; \}/);
    expect(html).toMatch(/id="stores-phone-head"/);
  });
  test('every phone-only piece is hidden on wider screens', () => {
    // Unindented rules sit outside every @media block.
    const hiddenEverywhere = riso.split('\n').filter((l) => /^\.[^{]*\{ display: none; \}$/.test(l)).join(' ');
    for (const cls of ['.phone-menu-btn', '.more-sheet-foot', '.today-ledger', '.phone-books', '.store-row', '.fm-tile-step']) {
      expect(hiddenEverywhere).toContain(cls);
    }
  });
});

describe('Other screens', () => {
  test('the boxed book banner turns into a kicker over a masthead', () => {
    expect(riso).toMatch(/\.tab-panel > \.book-context:not\(#book-context-dash\):not\(#book-context-con\) \{/);
  });
  test('the lead figure loses its book-colour fill, which style.css forces with !important', () => {
    expect(riso).toMatch(/:is\(\.kpi-grid, \.recon-kpis\) > \.kpi\.is-lead \{[^}]*background: none !important;/);
  });
});

describe('Stores rows on a phone', () => {
  test('the status tag sits under the name so the city line stays on one line', () => {
    expect(riso).toMatch(/\.pub-shell \.store-row-end \{ display: contents; \}/);
    expect(riso).toMatch(/\.pub-shell \.store-row-owed \{[^}]*grid-row: 1;/);
    expect(riso).toMatch(/\.pub-shell \.store-row-end \.phone-pill \{[^}]*grid-row: 2; justify-self: start;/);
    expect(riso).toMatch(/\.pub-shell \.store-row-tag \{ grid-row: 1 \/ span 2;/);
  });
});

describe('Stripe payments figures on a phone', () => {
  test('the second row of figures sits a full ledger gap below the first, without widening the columns', () => {
    const rule = riso.match(/\.pub-shell #tab-reconcile \.recon-kpis \{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/row-gap:\s*var\(--space-4\)/);
    // "RECONCILED" is ~162px wide; a wider column gap pushes the right tile past the page edge.
    expect(rule[1]).not.toMatch(/column-gap/);
  });
});

test('upright phone: "Log an expense" steps down to a caps label under the Anton masthead', () => {
  const rule = riso.match(/\.pub-shell #tab-expenses > \.section-hed\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/font:\s*800 var\(--text-xs\) var\(--font-ui\)/);
  expect(rule[1]).toMatch(/color:\s*var\(--content-muted\)/);
  expect(riso).toMatch(/#tab-expenses > \.section-hed::after\s*\{[^}]*flex:\s*1/);
});

test('upright phone: "Log an order" steps down to a caps label under the Manual Order Entry masthead', () => {
  const rule = riso.match(/#tab-manual :is\(#man-sale-sect, #man-gift-sect\) > \.section-hed\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/font:\s*800 var\(--text-xs\) var\(--font-ui\)/);
  expect(rule[1]).toMatch(/color:\s*var\(--content-muted\)/);
  expect(riso).toMatch(/#man-gift-sect\) > \.section-hed::after\s*\{[^}]*flex:\s*1/);
});
