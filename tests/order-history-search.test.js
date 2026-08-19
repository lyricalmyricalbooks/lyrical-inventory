import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  channelSearchWords,
  historyRowSearchWords,
  historySearchTerms,
  historySearchIsActive,
  historyRowMatches,
  filterHistoryRows,
  describeHistorySearch,
} from '../src/lib/order-history-search.js';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

// Rows shaped exactly as buildOrderTimeline() emits them: direct sales carry
// their index into state.hist, consignment movements carry the ledger entry,
// and an artist's unapproved sale arrives as a third shape with no index.
const rows = [
  { type: 'hist', i: 0, h: { num: '1042', chan: 'POS', qty: 2, price: 40, notes: 'Vancouver zine fair', enteredBy: 'Publisher', date: '2026-07-11' } },
  { type: 'hist', i: 1, h: { num: '1043', chan: 'Website', qty: 1, price: 40, notes: 'gift wrap requested', shipped: true, date: '2026-07-12' } },
  { type: 'hist', i: 2, h: { num: '1044', chan: 'Direct', qty: 1, price: 32, notes: '', cur: 'EUR', payment: { currency: 'EUR' }, date: '2026-07-14' } },
  { type: 'hist', i: 3, h: { num: '1045', chan: 'POS', qty: 1, price: 0, gratuity: true, notes: 'review copy', voided: true, date: '2026-07-15' } },
  { type: 'consign', e: { storeId: 11, storeName: 'Massy Books', type: 'Shipment', qty: 20, notes: 'first drop', date: '2026-06-02' } },
  { type: 'consign', e: { storeId: 11, storeName: 'Massy Books', type: 'Return', status: 'restocked', qty: 3, notes: '', date: '2026-08-01' } },
  { type: 'pending', h: { num: 'SUB-9', chan: 'Fair', qty: 1, price: 40, artistPending: true, _subKey: 'k1', date: '2026-08-10' } },
];

describe('historySearchTerms', () => {
  it('is empty for a blank, missing or whitespace-only query', () => {
    expect(historySearchTerms('')).toEqual([]);
    expect(historySearchTerms('   ')).toEqual([]);
    expect(historySearchTerms(undefined)).toEqual([]);
    expect(historySearchTerms(null)).toEqual([]);
    expect(historySearchIsActive('  ')).toBe(false);
    expect(historySearchIsActive('massy')).toBe(true);
  });

  it('lowercases and splits on any run of whitespace', () => {
    expect(historySearchTerms('  Massy   BOOKS ')).toEqual(['massy', 'books']);
  });
});

describe('filterHistoryRows', () => {
  it('hands back the very same array when nothing is being narrowed', () => {
    // Identity, not just equality: renderHist() paginates this list, and a
    // fresh copy on every keystroke would defeat that for no gain.
    expect(filterHistoryRows(rows, '')).toBe(rows);
    expect(filterHistoryRows(rows, '   ')).toBe(rows);
  });

  it('survives a missing or malformed row list', () => {
    expect(filterHistoryRows(null, 'massy')).toEqual([]);
    expect(filterHistoryRows(undefined, '')).toEqual([]);
  });

  it('finds an order by its number', () => {
    const out = filterHistoryRows(rows, '1043');
    expect(out).toHaveLength(1);
    expect(out[0].h.num).toBe('1043');
  });

  it('finds an order by a word in its note', () => {
    expect(filterHistoryRows(rows, 'zine').map(r => r.h.num)).toEqual(['1042']);
  });

  it('finds consignment movements by the store they involve', () => {
    const out = filterHistoryRows(rows, 'massy');
    expect(out).toHaveLength(2);
    expect(out.every(r => r.type === 'consign')).toBe(true);
  });

  it('matches the channel name the table actually paints, not the stored one', () => {
    // The regression this guards: rows store "POS" and "Fair" but the badge
    // reads "In Person". Searching for what is on screen has to work, or the
    // box looks broken to anyone who has not seen the raw records.
    const out = filterHistoryRows(rows, 'in person');
    expect(out.map(r => r.h.num).sort()).toEqual(['1042', '1045', 'SUB-9']);
    expect(filterHistoryRows(rows, 'website').map(r => r.h.num)).toEqual(['1043']);
  });

  it('AND-s several terms so a two-word search narrows rather than widens', () => {
    expect(filterHistoryRows(rows, 'massy return').map(r => r.e.type)).toEqual(['Return']);
    expect(filterHistoryRows(rows, 'massy')).toHaveLength(2);
  });

  it('is case-insensitive', () => {
    expect(filterHistoryRows(rows, 'MASSY BOOKS')).toHaveLength(2);
  });

  it('finds the rows stranded in another currency by their code', () => {
    expect(filterHistoryRows(rows, 'eur').map(r => r.h.num)).toEqual(['1044']);
  });

  it('finds a voided row, a gift and an artist submission by their own words', () => {
    expect(filterHistoryRows(rows, 'void').map(r => r.h.num)).toEqual(['1045']);
    expect(filterHistoryRows(rows, 'gratuity').map(r => r.h.num)).toEqual(['1045']);
    expect(filterHistoryRows(rows, 'submitted').map(r => r.h.num)).toEqual(['SUB-9']);
  });

  it('falls back to the same "Entered by" name the column shows', () => {
    // The column prints Publisher/Artist when the record carries no name, so
    // the search has to fall back identically or the pill is unsearchable.
    expect(filterHistoryRows(rows, 'publisher').map(r => r.h.num).sort())
      .toEqual(['1042', '1043', '1044', '1045']);
    expect(filterHistoryRows(rows, 'artist').map(r => r.h.num)).toEqual(['SUB-9']);
  });

  it('does not let an artist submission answer to "publisher"', () => {
    // The author-side row reads "Awaiting Publisher", but "publisher" means
    // "entered by the publisher" everywhere else on this screen, and one word
    // cannot honestly mean both.
    expect(filterHistoryRows(rows, 'publisher').map(r => r.h.num)).not.toContain('SUB-9');
    expect(filterHistoryRows(rows, 'awaiting').map(r => r.h.num)).toEqual(['SUB-9']);
  });

  it('passes row descriptors through by identity, so each keeps its edit index', () => {
    // The invariant that matters most here: openEditHist(i) is keyed on the
    // index the timeline stamped. Rebuilding rows instead of passing them
    // through would point every Edit button at the wrong order.
    const out = filterHistoryRows(rows, '1042');
    expect(out[0]).toBe(rows[0]);
    expect(out[0].i).toBe(0);
  });

  it('preserves the newest-first order the timeline was already in', () => {
    const out = filterHistoryRows(rows, 'books');
    expect(out.map(r => rows.indexOf(r))).toEqual([4, 5]);
  });

  it('does not match on dates or amounts', () => {
    // Deliberate: folding dates in would bury order 12 under every order
    // placed on the 12th of any month.
    expect(filterHistoryRows(rows, '2026-07-11')).toHaveLength(0);
    expect(filterHistoryRows(rows, '40.00')).toHaveLength(0);
  });
});

describe('channelSearchWords / historyRowSearchWords', () => {
  it('returns nothing for a blank channel rather than a stray empty string', () => {
    expect(channelSearchWords('')).toEqual([]);
    expect(channelSearchWords(null)).toEqual([]);
  });

  it('keeps an unrecognised channel searchable by its own name', () => {
    expect(channelSearchWords('Wholesale')).toEqual(['Wholesale']);
  });

  it('describes a row shape it does not recognise as unsearchable, not as a crash', () => {
    expect(historyRowSearchWords(null)).toEqual([]);
    expect(historyRowSearchWords({ type: 'hist' })).not.toContain(undefined);
    expect(historyRowMatches({ type: 'nonsense' }, ['x'])).toBe(false);
  });

  it('never leaks an undefined into the haystack', () => {
    for (const row of rows) {
      expect(historyRowSearchWords(row).every(w => typeof w === 'string' && w.length)).toBe(true);
    }
  });
});

describe('describeHistorySearch', () => {
  it('invites a search when none is running, and says what can be searched', () => {
    const d = describeHistorySearch('', { shown: 40, total: 40 });
    expect(d.active).toBe(false);
    expect(d.headline).toBe('40 orders on record');
    expect(d.detail).toMatch(/order number/i);
    expect(d.detail).toMatch(/store/i);
  });

  it('counts one order in the singular', () => {
    expect(describeHistorySearch('', { shown: 1, total: 1 }).headline).toBe('1 order on record');
  });

  it('says how much of the whole it is showing', () => {
    const d = describeHistorySearch('massy', { shown: 2, total: 40 });
    expect(d.active).toBe(true);
    expect(d.headline).toBe('Showing 2 of 40 orders');
    expect(d.detail).toContain('massy');
  });

  it('says the rest are hidden when nothing matches, not that there is nothing', () => {
    // Without this the empty table reads as "this book has no history", which
    // is the opposite of what happened.
    const d = describeHistorySearch('massy', { shown: 0, total: 40 });
    expect(d.detail).toContain('40');
    expect(d.detail).toMatch(/hidden by this search/);
    expect(d.detail).toContain('massy');
  });

  it('names the channel filter when one is also on, so the count is not read as the whole book', () => {
    const d = describeHistorySearch('fair', { shown: 3, total: 12, scope: 'In Person' });
    expect(d.headline).toBe('Showing 3 of 12 In Person orders');
    const idle = describeHistorySearch('', { shown: 12, total: 12, scope: 'In Person' });
    expect(idle.headline).toBe('12 In Person orders on record');
  });

  it('keeps its copy free of anything technical', () => {
    const texts = [
      describeHistorySearch('', { shown: 9, total: 9 }),
      describeHistorySearch('x', { shown: 0, total: 9 }),
      describeHistorySearch('x', { shown: 2, total: 9 }),
    ].flatMap(d => [d.headline, d.detail]);
    for (const t of texts) {
      expect(t).not.toMatch(/firestore|timeline|filter\(|undefined|null|row\b/i);
    }
  });
});

describe('the search bar in the page', () => {
  it('is permanent markup, so typing never loses the caret', () => {
    // A field rebuilt by innerHTML on every keystroke drops focus mid-word.
    expect(html).toMatch(/id="hist-search"[^>]*oninput="histSearchInput\(this\.value\)"/);
    expect(mainJs).not.toMatch(/innerHTML[^\n]*id="hist-search"/);
  });

  it('announces its result count through a live region that survives each render', () => {
    expect(html).toMatch(/id="hist-search-status"[^>]*aria-live="polite"/);
    // Only the contents are rewritten — the node itself is never replaced.
    expect(mainJs).toMatch(/const status = \$\('hist-search-status'\)/);
  });

  it('is a labelled search landmark with a real visible label', () => {
    expect(html).toMatch(/id="hist-search-bar"[^>]*role="search"/);
    expect(html).toMatch(/aria-label="Search this book's order history"/);
    expect(html).toContain('<span class="ledger-filter-label">Find an order</span>');
  });

  it('reuses the ledger filter bar furniture instead of a parallel set of classes', () => {
    expect(html).toMatch(/class="ledger-filter-bar" id="hist-search-bar"/);
    expect(html).toContain('class="ledger-filter-status" id="hist-search-status"');
  });

  it('offers a way to clear the search, hidden until there is one to clear', () => {
    expect(html).toMatch(/id="hist-search-clear"[^>]*onclick="clearHistSearch\(\)"[^>]*hidden/);
  });
});

describe('the search box styling', () => {
  const block = css.slice(css.indexOf('.ledger-filter-input {'));

  it('gets a full touch target and matches the picker beside it', () => {
    expect(block).toMatch(/min-height:\s*var\(--target-min\)/);
    expect(block).toMatch(/font-family:\s*'DM Mono', monospace/);
  });

  it('has hover and focus-visible feedback', () => {
    expect(css).toContain('.ledger-filter-input:hover');
    expect(css).toContain('.ledger-filter-input:focus-visible');
    expect(block).toMatch(/outline:\s*var\(--focus-ring-width\)/);
  });

  it('themes itself with tokens rather than a literal colour', () => {
    const decl = css.slice(css.indexOf('.ledger-filter-input {'), css.indexOf('.hist-search-field'));
    expect(decl).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(decl).toMatch(/background:\s*var\(--surface-raised\)/);
    expect(decl).toMatch(/color:\s*var\(--content-primary\)/);
  });

  it('goes full width on a narrow container via the existing container query', () => {
    expect(css).toMatch(/\.ledger-filter-select,\s*\n\s*\.ledger-filter-input \{/);
  });
});

describe('renderHist wiring', () => {
  it('exposes both handlers on window so the inline attributes resolve', () => {
    expect(mainJs).toMatch(/Object\.assign\(window, \{ histSearchInput, clearHistSearch \}\)/);
  });

  it('searches the rows the channel filter already narrowed, so the two compose', () => {
    expect(mainJs).toMatch(/filterHistoryRows\(inScope, searchQuery\)/);
  });

  it('resets pagination when the query changes', () => {
    // Otherwise a new search inherits "showing 200 of 200" from the last one.
    expect(mainJs).toMatch(/const pageSig = `\$\{activeBook\}\|\$\{chanFilter \?\? ''\}\|\$\{searchQuery\}`/);
  });

  it('drops the search when the book changes', () => {
    // A query carried across a book switch opens the next book on a table that
    // looks empty for no visible reason.
    expect(mainJs).toMatch(/_histSearchBook !== activeBook/);
  });

  it('debounces at the same 200ms the tax ledger search uses', () => {
    const fn = mainJs.slice(mainJs.indexOf('function histSearchInput'));
    expect(fn.slice(0, 400)).toMatch(/setTimeout\(\(\) => \{ renderHist\(\); \}, 200\)/);
  });

  it('keeps the reconciliation strip on the whole book, not on the search result', () => {
    expect(mainJs).toMatch(/if \(chanFilter === null && inScope\.length\)/);
  });

  it('shows a no-match empty state with a way back rather than the never-sold one', () => {
    expect(mainJs).toContain('histNoSearchMatchHtml(describedSearch)');
    const fn = mainJs.slice(mainJs.indexOf('function histNoSearchMatchHtml'));
    expect(fn.slice(0, 600)).toContain('empty-state sys-empty');
    expect(fn.slice(0, 600)).toContain('clearHistSearch()');
  });

  it('escapes the query before it reaches the page', () => {
    // The query is user text and lands in innerHTML on both the status line and
    // the no-match panel.
    const bar = mainJs.slice(mainJs.indexOf('function renderHistSearchBar'));
    expect(bar.slice(0, 1400)).toMatch(/escapeHtml\(described\.headline\)/);
    expect(bar.slice(0, 1400)).toMatch(/escapeHtml\(described\.detail\)/);
  });
});
