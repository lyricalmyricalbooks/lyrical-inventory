// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { phoneBooksHtml, phoneBookStatus, phoneBookMatches } from '../src/lib/phone-books.js';
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
  test('filters', () => {
    expect(books.filter((b) => phoneBookMatches(b, 'low')).map((b) => b.id)).toEqual(['b']);
    expect(books.filter((b) => phoneBookMatches(b, 'out')).map((b) => b.id)).toEqual(['c']);
    expect(books.filter((b) => phoneBookMatches(b, 'stores')).map((b) => b.id)).toEqual(['a', 'c']);
  });
  test('figures, chips and escaped rows', () => {
    document.body.innerHTML = phoneBooksHtml(books, 'all');
    const figs = [...document.querySelectorAll('.ledger-value')].map((n) => n.textContent);
    expect(figs).toEqual(['58', '3', '2']);
    expect(document.querySelectorAll('.phone-book-row')).toHaveLength(3);
    expect(document.querySelector('.phone-book-title').textContent).toBe('Harbour <Lights>');
    // Only a plain colour reaches the style attribute.
    const covers = [...document.querySelectorAll('.phone-book-cover')].map((n) => n.getAttribute('style'));
    expect(covers).toEqual(['background:#2E6DA4', null, null]);
    expect(document.querySelector('.book-chip.is-on').textContent).toBe('All');
  });
  test('an empty filter says so', () => {
    document.body.innerHTML = phoneBooksHtml([books[0]], 'out');
    expect(document.querySelector('.phone-sheet-empty').textContent).toContain('Sold out');
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
  test('the pinned total replaces the Sell / Manual entry bar while a sale is open', () => {
    expect(riso).toMatch(/\.pub-shell:has\(#tab-pos\.active [^)]*\.fm-bar:not\(\[hidden\]\)\) \.mnav \{ display: none; \}/);
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
