import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  LEDGER_TYPE_FILTERS,
  emptyLedgerFilter,
  ledgerFilterIsActive,
  ledgerStoreOptions,
  filterLedgerEntries,
  ledgerTypeCounts,
  describeLedgerFilter,
  ledgerTotalsScope,
} from '../src/lib/consignment-ledger-filter.js';
import { consignmentLedgerTotals } from '../src/lib/consignment.js';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

// A ledger shaped like the real one: shipments and returns are minted with
// amountDue 0, only Sale rows carry money and a paid/pending status.
const ledger = [
  { id: 1, storeId: 11, storeName: 'Atlantis Books', type: 'Shipment', qty: 20, amountDue: 0, status: 'sent' },
  { id: 2, storeId: 11, storeName: 'Atlantis Books', type: 'Sale', qty: 5, amountDue: 60, status: 'pending', cur: 'EUR' },
  { id: 3, storeId: 11, storeName: 'Atlantis Books', type: 'Sale', qty: 3, amountDue: 36, status: 'paid', cur: 'EUR' },
  { id: 4, storeId: 11, storeName: 'Atlantis Books', type: 'Return', qty: 2, amountDue: 0, status: 'restocked' },
  { id: 5, storeId: '22', storeName: 'Shakespeare & Co', type: 'Shipment', qty: 10, amountDue: 0, status: 'sent' },
  { id: 6, storeId: '22', storeName: 'Shakespeare & Co', type: 'Sale', qty: 4, amountDue: 48, status: 'pending', cur: 'EUR' },
  { id: 7, storeId: '22', storeName: 'Shakespeare & Co', type: 'Sale', qty: 1, amountDue: 12, status: 'pending', cur: 'EUR', voided: true },
];

describe('filterLedgerEntries', () => {
  it('returns the ledger untouched when nothing is being narrowed', () => {
    const out = filterLedgerEntries(ledger, emptyLedgerFilter());
    expect(out).toBe(ledger);
  });

  it('narrows to one store', () => {
    const out = filterLedgerEntries(ledger, { ...emptyLedgerFilter(), storeId: 11 });
    expect(out.map(e => e.id)).toEqual([1, 2, 3, 4]);
  });

  it('matches a store id picked from a <select>, where every value is a string', () => {
    // The regression this guards: store ids are numbers for stores added in the
    // app and strings for imported ones, but a picker only ever hands back a
    // string. A strict compare silently matched nothing.
    expect(filterLedgerEntries(ledger, { storeId: '11' }).map(e => e.id)).toEqual([1, 2, 3, 4]);
    expect(filterLedgerEntries(ledger, { storeId: 22 }).map(e => e.id)).toEqual([5, 6, 7]);
  });

  it('narrows to one kind of movement', () => {
    expect(filterLedgerEntries(ledger, { type: 'Shipment' }).map(e => e.id)).toEqual([1, 5]);
    expect(filterLedgerEntries(ledger, { type: 'Return' }).map(e => e.id)).toEqual([4]);
  });

  it('combines store and type', () => {
    expect(filterLedgerEntries(ledger, { storeId: 11, type: 'Sale' }).map(e => e.id)).toEqual([2, 3]);
  });

  it('unpaid-only means money still owed — not paid, not voided, not stock movements', () => {
    const out = filterLedgerEntries(ledger, { unpaidOnly: true });
    expect(out.map(e => e.id)).toEqual([2, 6]);
    // id 3 is paid, id 7 is a voided pending sale, ids 1/4/5 moved stock not money.
    expect(out.some(e => e.voided)).toBe(false);
    expect(out.some(e => e.status === 'paid')).toBe(false);
  });

  it('preserves ledger order, so the caller can still walk it newest-first by index', () => {
    const out = filterLedgerEntries(ledger, { type: 'Sale' });
    expect(out.map(e => e.id)).toEqual([2, 3, 6, 7]);
  });

  it('never mutates the ledger it was given', () => {
    const snapshot = JSON.stringify(ledger);
    filterLedgerEntries(ledger, { storeId: 11, type: 'Sale', unpaidOnly: true });
    expect(JSON.stringify(ledger)).toBe(snapshot);
  });

  it('is safe on junk input', () => {
    expect(filterLedgerEntries(null, { storeId: 1 })).toEqual([]);
    expect(filterLedgerEntries(undefined, emptyLedgerFilter())).toEqual([]);
    expect(filterLedgerEntries([null, undefined, ...ledger], { storeId: 11 }).map(e => e.id)).toEqual([1, 2, 3, 4]);
  });
});

describe('ledgerFilterIsActive', () => {
  it('is false for a fresh filter and true once anything is narrowed', () => {
    expect(ledgerFilterIsActive(emptyLedgerFilter())).toBe(false);
    expect(ledgerFilterIsActive(null)).toBe(false);
    expect(ledgerFilterIsActive({ storeId: 11 })).toBe(true);
    expect(ledgerFilterIsActive({ type: 'Sale' })).toBe(true);
    expect(ledgerFilterIsActive({ unpaidOnly: true })).toBe(true);
  });
});

describe('ledgerStoreOptions', () => {
  it('lists each store once with its row count, alphabetically', () => {
    expect(ledgerStoreOptions(ledger)).toEqual([
      { id: 11, name: 'Atlantis Books', count: 4 },
      { id: '22', name: 'Shakespeare & Co', count: 3 },
    ]);
  });

  it('is derived from the ledger, so a removed store keeps its history reachable', () => {
    // The store list in state can lose a store; its rows can't. If the picker
    // were built from state.stores those rows would become unreachable.
    const opts = ledgerStoreOptions([{ storeId: 99, storeName: 'Closed Down Books', type: 'Sale', qty: 1 }]);
    expect(opts).toEqual([{ id: 99, name: 'Closed Down Books', count: 1 }]);
  });

  it('survives rows with no usable name or no store at all', () => {
    const opts = ledgerStoreOptions([
      { storeId: 5, storeName: '', type: 'Sale' },
      { storeId: 5, storeName: '  ', type: 'Sale' },
      { type: 'Sale' },
      null,
    ]);
    expect(opts).toEqual([{ id: 5, name: 'Unnamed store', count: 2 }]);
  });

  it('is empty for an empty ledger', () => {
    expect(ledgerStoreOptions([])).toEqual([]);
    expect(ledgerStoreOptions(null)).toEqual([]);
  });
});

describe('ledgerTypeCounts', () => {
  it('counts each chip as if it alone were pressed, on top of the rest of the filter', () => {
    const counts = ledgerTypeCounts(ledger, { storeId: 11 });
    expect(counts).toEqual({ Shipment: 1, Sale: 2, Return: 1, unpaid: 1 });
  });

  it('reports a real dead end as zero rather than hiding it', () => {
    const counts = ledgerTypeCounts(ledger, { storeId: '22' });
    expect(counts.Return).toBe(0);
  });

  it('ignores whatever type is currently selected, so a chip never counts itself out', () => {
    // With "Shipment" on, the Sale chip must still say how many sales there
    // are — otherwise every unselected chip reads 0 and looks broken.
    expect(ledgerTypeCounts(ledger, { type: 'Shipment' }).Sale).toBe(4);
  });
});

describe('describeLedgerFilter', () => {
  it('states the plain count when nothing is filtered', () => {
    const d = describeLedgerFilter(emptyLedgerFilter(), { shown: 7, total: 7 });
    expect(d.active).toBe(false);
    expect(d.headline).toBe('7 entries');
    expect(d.parts).toEqual([]);
  });

  it('singularises one entry', () => {
    expect(describeLedgerFilter(emptyLedgerFilter(), { shown: 1, total: 1 }).headline).toBe('1 entry');
  });

  it('names what is being shown, in the owner’s words rather than the stored ones', () => {
    const d = describeLedgerFilter(
      { storeId: 11, type: 'Shipment', unpaidOnly: false },
      { shown: 1, total: 7, storeName: 'Atlantis Books' },
    );
    expect(d.active).toBe(true);
    expect(d.headline).toBe('Showing 1 of 7 entries');
    expect(d.parts).toEqual(['Atlantis Books', 'sent out']);
    expect(d.detail).toContain('Totals below cover these 1 entry only.');
  });

  it('says the rows are hidden rather than absent when the filter matches nothing', () => {
    // The failure this prevents: an owner filters to a store with no returns,
    // sees an empty table, and concludes the book has no consignment history.
    const d = describeLedgerFilter({ storeId: 22, type: 'Return' }, { shown: 0, total: 7, storeName: 'Shakespeare & Co' });
    expect(d.detail).toBe('Nothing here matches — the other 7 entries are hidden by this filter.');
  });

  it('falls back to a neutral phrase when a store name is missing', () => {
    expect(describeLedgerFilter({ storeId: 11 }, { shown: 4, total: 7 }).parts).toEqual(['one store']);
  });

  it('describes the unpaid filter as money, not status', () => {
    expect(describeLedgerFilter({ unpaidOnly: true }, { shown: 2, total: 7 }).parts).toEqual(['still unpaid']);
  });
});

describe('ledgerTotalsScope', () => {
  it('is blank unless the ledger is narrowed to one store', () => {
    expect(ledgerTotalsScope(emptyLedgerFilter(), 'Atlantis Books')).toBe('');
    expect(ledgerTotalsScope({ type: 'Sale' }, 'Atlantis Books')).toBe('');
    expect(ledgerTotalsScope(null, '')).toBe('');
  });

  it('names the store, so "still owed to you" can’t be read as the whole book’s balance', () => {
    expect(ledgerTotalsScope({ storeId: 11 }, 'Atlantis Books')).toBe('from Atlantis Books');
    expect(ledgerTotalsScope({ storeId: 11 }, '')).toBe('from this store');
  });
});

describe('filtered totals reconcile with the whole-ledger total', () => {
  // The invariant that makes the footer trustworthy: filtering hands the SAME
  // aggregation a smaller set, so the per-store totals must add back up to the
  // book's. A second, divergent tally is the bug this rules out.
  it('sums each store back to the unfiltered outstanding balance', () => {
    const all = consignmentLedgerTotals(ledger, 'EUR');
    const a = consignmentLedgerTotals(filterLedgerEntries(ledger, { storeId: 11 }), 'EUR');
    const b = consignmentLedgerTotals(filterLedgerEntries(ledger, { storeId: '22' }), 'EUR');
    expect(all[0].outstanding).toBeCloseTo(a[0].outstanding + b[0].outstanding, 2);
    expect(all[0].paid).toBeCloseTo(a[0].paid + b[0].paid, 2);
    expect(a[0].outstanding).toBeCloseTo(60, 2);
    expect(b[0].outstanding).toBeCloseTo(48, 2);
  });

  it('still excludes the voided sale under a filter', () => {
    const b = consignmentLedgerTotals(filterLedgerEntries(ledger, { storeId: '22' }), 'EUR');
    // Row 7 is a voided €12 pending sale — counting it would overstate the debt.
    expect(b[0].outstanding).toBeCloseTo(48, 2);
    expect(b[0].outstandingCount).toBe(1);
  });
});

describe('the filter bar wiring', () => {
  it('has a mount point in the consignment tab, ahead of the ledger table', () => {
    expect(html).toContain('id="con-ledger-filter"');
    expect(html.indexOf('id="con-ledger-filter"')).toBeLessThan(html.indexOf('id="ledger-body"'));
  });

  it('labels the control group for screen readers', () => {
    expect(html).toMatch(/id="con-ledger-filter"[^>]*aria-label="Narrow the consignment ledger"/);
  });

  it('reuses the existing ledger toggle pill rather than inventing a chip', () => {
    expect(mainJs).toContain('class="ledger-toggle-btn');
    expect(css).toContain('.ledger-toggle-btn:disabled');
  });

  it('exposes every handler its own markup calls', () => {
    for (const fn of ['setConLedgerStore', 'toggleConLedgerType', 'toggleConLedgerUnpaid', 'clearConLedgerFilter', 'showStoreLedger']) {
      expect(mainJs).toMatch(new RegExp(`\\n\\s*${fn},`));
    }
  });

  it('drives the totals from the filtered rows, not the whole ledger', () => {
    expect(mainJs).toContain('consignmentLedgerTotals(matched, ledgerBookCode)');
  });

  it('keeps the edit button pointed at the real ledger index under a filter', () => {
    // Rows are skipped inside the original backwards walk rather than mapped
    // over a filtered copy, so `openEditLedger(i)` still edits the right entry.
    expect(mainJs).toContain('if (visible && !visible.has(e)) continue;');
  });

  it('gives every store card a way into its own rows', () => {
    expect(mainJs).toMatch(/onclick="showStoreLedger\(/);
    expect(mainJs).toContain('📒 Ledger');
  });

  it('respects reduced motion when jumping to the ledger', () => {
    expect(mainJs).toMatch(/_prefersReducedMotion\(\) \? 'auto' : 'smooth'/);
  });

  it('sizes the picker to a real touch target and adapts on its own width', () => {
    expect(css).toMatch(/\.ledger-filter-select\s*\{[^}]*min-height:\s*var\(--target-min\)/);
    expect(css).toContain('@container (max-width: 560px)');
  });

  it('styles the bar from tokens, with no raw colour', () => {
    const block = css.slice(css.indexOf('.ledger-filter-bar {'), css.indexOf('@container (max-width: 560px)'));
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(block).not.toMatch(/\brgb\(/);
  });

  it('keeps the status line a permanent node so its live region can announce', () => {
    // A live region replaced wholesale on every render announces nothing, so
    // the controls and the status line are written separately.
    expect(html).toMatch(/id="con-ledger-status"[^>]*aria-live="polite"/);
    expect(mainJs).toContain("const status = $('con-ledger-status');");
    expect(mainJs).toContain('status.innerHTML = `<strong class="mono-num">');
    expect(mainJs).toContain('controls.innerHTML = `<label class="ledger-filter-field">');
  });

  it('starts hidden, so an unrendered bar is not an empty box above the table', () => {
    expect(html).toMatch(/id="con-ledger-filter"[^>]*\shidden\b/);
    expect(css).toContain('.ledger-filter-bar[hidden]');
  });

  it('never hides itself while a filter is on, which would strand the owner', () => {
    // The trap this closes: the "Ledger" button on a store card can filter a
    // ledger small enough that the bar would otherwise stay hidden — leaving a
    // narrowed table and no control to widen it again.
    expect(mainJs).toContain('if (!described.active && (!entries.length || (stores.length < 2 && entries.length < 8)))');
  });

  it('offers a way back out of an empty result', () => {
    expect(mainJs).toContain('No entries match this filter');
    expect(mainJs).toMatch(/consignmentLedgerNoMatchHtml[\s\S]{0,600}clearConLedgerFilter\(\)/);
  });
});

describe('LEDGER_TYPE_FILTERS', () => {
  it('covers exactly the three movements the ledger records', () => {
    expect(LEDGER_TYPE_FILTERS.map(t => t.key)).toEqual(['Shipment', 'Sale', 'Return']);
  });

  it('labels them in the owner’s words, not the stored ones', () => {
    expect(LEDGER_TYPE_FILTERS.map(t => t.label)).toEqual(['Sent out', 'Sold', 'Returned']);
  });

  it('matches the type strings the send/sale/return paths actually mint', () => {
    for (const { key } of LEDGER_TYPE_FILTERS) {
      expect(mainJs).toContain(`type: '${key}'`);
    }
  });
});
