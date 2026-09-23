import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mergePart } from '../src/lib/merge-state.js';
import { fmtD } from '../src/lib/money.js';
import {
  SYNC_CONFLICTS_KEY, MAX_SYNC_CONFLICTS,
  isMeaningfulConflict, changedFields, comparedFields,
  recordConflicts, listConflicts, dismissConflict, writeConflicts,
  locateConflictTarget, applyConflictRestore,
  describeRecord, formatFieldValue, fieldLabel, describeConflictCount,
  renderConflictListHtml, renderConflictItemHtml,
} from '../src/lib/sync-conflicts.js';

// fmtD is the app's own date format; its month abbreviation depends on the
// runtime's locale data ("Sep" vs "Sept"), so date expectations go through it.
const D = (iso) => fmtD(iso);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// A Storage stand-in. `limit` makes setItem throw past a byte size, the way a
// full localStorage quota does.
function memoryStorage({ limit = Infinity, failGet = false, failSet = false } = {}) {
  const map = new Map();
  return {
    map,
    getItem(k) { if (failGet) throw new Error('blocked'); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) {
      if (failSet) throw new Error('blocked');
      if (String(v).length > limit) throw new Error('QuotaExceededError');
      map.set(k, String(v));
    },
  };
}

const sale = (over = {}) => ({ num: '1001', chan: 'Big Cartel', qty: 2, price: 20, date: '2026-09-12', notes: '', after: 40, cur: 'CAD', ...over });
const ledgerSale = (over = {}) => ({ id: 111, storeId: 7, storeName: 'Paper Moon', type: 'Sale', date: '2026-09-10', qty: 3, rate: 40, amountDue: 36, paid: 'pending', notes: '', status: 'pending', ...over });

describe('which conflicts are worth showing', () => {
  it('ignores a sale whose two versions differ only in the running stock balance', () => {
    expect(isMeaningfulConflict({ part: 'hist', key: 'c:x', local: sale({ after: 38 }), remote: sale({ after: 41 }) })).toBe(false);
  });

  it('keeps a sale that was cancelled on one device', () => {
    expect(isMeaningfulConflict({ part: 'hist', key: 'c:x', local: sale(), remote: sale({ voided: true }) })).toBe(true);
  });

  it('ignores a consignment mirror in History — its figures come from the ledger row', () => {
    const mirror = (o) => sale({ chan: 'Consignment', consignmentLink: true, ...o });
    expect(isMeaningfulConflict({ part: 'hist', key: 'c:x', local: mirror({ qty: 2, price: 12 }), remote: mirror({ qty: 3, price: 12, voided: true }) })).toBe(false);
  });

  it('still treats copies and price as real on an ordinary sale', () => {
    expect(isMeaningfulConflict({ part: 'hist', key: 'uid:u1', local: sale({ uid: 'u1', qty: 2 }), remote: sale({ uid: 'u1', qty: 3 }) })).toBe(true);
  });

  it('ignores store counters rebuilt from the ledger, but not the amount owed', () => {
    const store = (o) => ({ id: 7, name: 'Paper Moon', sent: 10, sold: 4, returned: 0, outstanding: 6, amountOwed: 50, ...o });
    expect(isMeaningfulConflict({ part: 'stores', key: 'id:7', local: store(), remote: store({ sold: 5, outstanding: 5 }) })).toBe(false);
    expect(isMeaningfulConflict({ part: 'stores', key: 'id:7', local: store(), remote: store({ amountOwed: 0 }) })).toBe(true);
  });

  it('ignores a ledger row whose only difference is the invoice number copied from the invoice', () => {
    expect(isMeaningfulConflict({ part: 'ledger', key: 'id:111', local: ledgerSale({ invoiceNum: 'INV-1' }), remote: ledgerSale({ invoiceNum: 'INV-2' }) })).toBe(false);
  });

  it('ignores recomputed book totals and the invoice counter', () => {
    for (const k of ['stock', 'sold', 'revenue', 'chStats', 'invoiceSeq']) {
      expect(isMeaningfulConflict({ part: `metadata.${k}`, key: k, local: 1, remote: 2 })).toBe(false);
    }
    expect(isMeaningfulConflict({ part: 'metadata.artistPaymentLink', key: 'artistPaymentLink', local: 'a', remote: 'b' })).toBe(true);
  });

  it('treats blank, null and missing as the same', () => {
    expect(isMeaningfulConflict({ part: 'ledger', key: 'id:111', local: ledgerSale({ notes: '' }), remote: { ...ledgerSale(), notes: undefined } })).toBe(false);
  });

  it('agrees with what the real merge reports', () => {
    // Both devices recorded a different sale, so each one's running balance
    // for an older shared row moved. The merge calls that a conflict; nobody
    // edited anything, so it must not reach the owner.
    const base = [sale({ after: 40 })];
    const local = [sale({ num: '1002', after: 39 }), sale({ after: 41 })];
    const remote = [sale({ num: '1003', after: 38 }), sale({ after: 42 })];
    const { conflicts } = mergePart('hist', base, remote, local);
    expect(conflicts.length).toBe(1);
    expect(conflicts.filter(isMeaningfulConflict)).toEqual([]);
  });
});

describe('changedFields / comparedFields', () => {
  it('points at the nested payment detail that changed', () => {
    const a = sale({ payment: { method: 'Cash', rate: 1 } });
    const b = sale({ payment: { method: 'Card', rate: 1 } });
    expect(changedFields('hist', a, b)).toEqual(['payment.method']);
  });

  it('lists differing fields first, and never ids or derived fields', () => {
    const fields = comparedFields('ledger', ledgerSale(), ledgerSale({ qty: 4, notes: 'recount' }));
    expect(fields.slice(0, 2)).toEqual(['qty', 'notes']);
    expect(fields).not.toContain('id');
    expect(comparedFields('hist', sale(), sale({ qty: 3 }))).not.toContain('after');
  });

  it('compares plain values as one "value"', () => {
    expect(changedFields('', 'a', 'b')).toEqual(['value']);
    expect(changedFields('', 'a', 'a')).toEqual([]);
  });
});

describe('recording conflicts on this device', () => {
  const book = { bookId: 'b1', bookTitle: 'Moon Poems', cur: 'CAD' };

  it('records only meaningful conflicts, as snapshots, newest first', () => {
    const storage = memoryStorage();
    const local = ledgerSale({ qty: 3 });
    const remote = ledgerSale({ qty: 4 });
    const conflicts = [
      { part: 'ledger', key: 'id:111', local, remote },
      { part: 'metadata.stock', key: 'stock', local: 5, remote: 6 },
    ];
    const { added } = recordConflicts(storage, { ...book, conflicts, now: 1000 });
    expect(added).toHaveLength(1);
    local.qty = 99; // a later edit to the live row must not rewrite history
    const [entry] = listConflicts(storage);
    expect(entry).toMatchObject({ bookId: 'b1', bookTitle: 'Moon Poems', part: 'ledger', key: 'id:111', at: 1000 });
    expect(entry.kept.qty).toBe(3);
    expect(entry.other.qty).toBe(4);

    recordConflicts(storage, { ...book, conflicts: [{ part: 'ledger', key: 'id:222', local: ledgerSale({ id: 222 }), remote: ledgerSale({ id: 222, qty: 9 }) }], now: 2000 });
    expect(listConflicts(storage).map(e => e.key)).toEqual(['id:222', 'id:111']);
  });

  it('does not duplicate the same conflict reported twice by a retried save', () => {
    const storage = memoryStorage();
    const c = { part: 'ledger', key: 'id:111', local: ledgerSale(), remote: ledgerSale({ qty: 4 }) };
    recordConflicts(storage, { ...book, conflicts: [c], now: 1 });
    recordConflicts(storage, { ...book, conflicts: [c], now: 2 });
    const entries = listConflicts(storage);
    expect(entries).toHaveLength(1);
    expect(entries[0].at).toBe(2);
  });

  it(`keeps at most ${MAX_SYNC_CONFLICTS}, dropping the oldest`, () => {
    const storage = memoryStorage();
    for (let i = 0; i < MAX_SYNC_CONFLICTS + 10; i++) {
      recordConflicts(storage, { ...book, conflicts: [{ part: 'ledger', key: `id:${i}`, local: ledgerSale({ id: i }), remote: ledgerSale({ id: i, qty: 50 }) }], now: i });
    }
    const entries = listConflicts(storage);
    expect(entries).toHaveLength(MAX_SYNC_CONFLICTS);
    expect(entries[0].key).toBe(`id:${MAX_SYNC_CONFLICTS + 9}`);
    expect(entries.at(-1).key).toBe('id:10');
  });

  it('keeps the newest when the browser runs out of room', () => {
    const storage = memoryStorage();
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, bookId: 'b1', part: 'ledger', key: `id:${i}`, kept: {}, other: { pad: 'x'.repeat(200) } }));
    const full = JSON.stringify({ v: 1, entries: many }).length;
    const tight = memoryStorage({ limit: Math.floor(full / 3) });
    const stored = writeConflicts(tight, many);
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.length).toBeLessThan(20);
    expect(stored[0].id).toBe('e0');
    expect(listConflicts(tight)).toHaveLength(stored.length);
    expect(writeConflicts(storage, many)).toHaveLength(20);
  });

  it('never throws when storage is blocked', () => {
    const c = { part: 'ledger', key: 'id:1', local: ledgerSale(), remote: ledgerSale({ qty: 4 }) };
    expect(() => recordConflicts(memoryStorage({ failGet: true, failSet: true }), { ...book, conflicts: [c] })).not.toThrow();
    expect(() => recordConflicts(null, { ...book, conflicts: [c] })).not.toThrow();
    expect(listConflicts(memoryStorage({ failGet: true }))).toEqual([]);
  });

  it('reads garbage in storage as "nothing recorded"', () => {
    const storage = memoryStorage();
    storage.setItem(SYNC_CONFLICTS_KEY, '{not json');
    expect(listConflicts(storage)).toEqual([]);
  });

  it('dismisses one entry by id', () => {
    const storage = memoryStorage();
    recordConflicts(storage, { ...book, conflicts: [
      { part: 'ledger', key: 'id:1', local: ledgerSale({ id: 1 }), remote: ledgerSale({ id: 1, qty: 4 }) },
      { part: 'ledger', key: 'id:2', local: ledgerSale({ id: 2 }), remote: ledgerSale({ id: 2, qty: 4 }) },
    ] });
    const [first] = listConflicts(storage);
    const rest = dismissConflict(storage, first.id);
    expect(rest).toHaveLength(1);
    expect(listConflicts(storage).map(e => e.id)).not.toContain(first.id);
    expect(dismissConflict(storage, 'nope')).toHaveLength(1);
  });
});

describe('finding and restoring the record', () => {
  const entryFor = (c) => ({ id: 'e1', bookId: 'b1', bookTitle: 'Moon Poems', part: c.part, key: c.key, kept: JSON.parse(JSON.stringify(c.local)), other: JSON.parse(JSON.stringify(c.remote)) });

  it('swaps an id-keyed row that has not changed since, end to end through the real merge', () => {
    const base = [ledgerSale({ qty: 3 })];
    const local = [ledgerSale({ qty: 4 })];
    const remote = [ledgerSale({ qty: 5, notes: 'counted twice' })];
    const merged = mergePart('ledger', base, remote, local);
    const state = { ledger: merged.value };
    const entry = entryFor(merged.conflicts[0]);

    const target = locateConflictTarget(state, entry);
    expect(target.status).toBe('unchanged');
    expect(applyConflictRestore(state, entry, target)).toBe(true);
    expect(state.ledger).toHaveLength(1);
    expect(state.ledger[0]).toMatchObject({ qty: 5, notes: 'counted twice' });
    expect(locateConflictTarget(state, entry).status).toBe('restored');
  });

  it('reports a row edited again since, and one deleted since', () => {
    const entry = { id: 'e', bookId: 'b1', part: 'ledger', key: 'id:111', kept: ledgerSale({ qty: 4 }), other: ledgerSale({ qty: 5 }) };
    expect(locateConflictTarget({ ledger: [ledgerSale({ qty: 7 })] }, entry).status).toBe('changed');
    const gone = { ledger: [] };
    expect(locateConflictTarget(gone, entry).status).toBe('missing');
    applyConflictRestore(gone, entry);
    expect(gone.ledger).toEqual([ledgerSale({ qty: 5 })]);
  });

  it('is not fooled by a recomputed running balance when checking "unchanged"', () => {
    const entry = { id: 'e', bookId: 'b1', part: 'hist', key: 'uid:u1', kept: sale({ uid: 'u1', after: 40 }), other: sale({ uid: 'u1', voided: true }) };
    expect(locateConflictTarget({ hist: [sale({ uid: 'u1', after: 12 })] }, entry).status).toBe('unchanged');
  });

  it('finds a History row by the merge\'s own content key, among look-alikes', () => {
    const base = [sale({ payment: { method: 'Cash' } })];
    const local = [sale({ payment: { method: 'Card' } })];
    const remote = [sale({ payment: { method: 'E-transfer' } })];
    const merged = mergePart('hist', base, remote, local);
    expect(merged.conflicts).toHaveLength(1);
    const other = sale({ num: '2000' });
    const state = { hist: [other, ...merged.value] };
    const entry = entryFor(merged.conflicts[0]);
    const target = locateConflictTarget(state, entry);
    expect(target).toMatchObject({ status: 'unchanged', index: 1 });
    applyConflictRestore(state, entry, target);
    expect(state.hist[1].payment.method).toBe('E-transfer');
    expect(state.hist[0]).toBe(other);
  });

  it('re-adds a deleted sale at its date position (newest first)', () => {
    const entry = { id: 'e', bookId: 'b1', part: 'hist', key: 'uid:u9', kept: sale({ uid: 'u9', date: '2026-09-12' }), other: sale({ uid: 'u9', date: '2026-09-12', voided: true }) };
    const state = { hist: [sale({ num: 'a', date: '2026-09-20' }), sale({ num: 'b', date: '2026-09-01' })] };
    applyConflictRestore(state, entry);
    expect(state.hist.map(h => h.num)).toEqual(['a', '1001', 'b']);
  });

  it('restores a book setting and a row inside a metadata list', () => {
    const setting = { id: 'e', bookId: 'b1', part: 'metadata.artistPaymentLink', key: 'artistPaymentLink', kept: 'https://a', other: 'https://b' };
    const s = { artistPaymentLink: 'https://a', invoices: [{ id: 5, num: 'INV-5', notes: 'x' }] };
    expect(locateConflictTarget(s, setting).status).toBe('unchanged');
    applyConflictRestore(s, setting);
    expect(s.artistPaymentLink).toBe('https://b');

    const inv = { id: 'f', bookId: 'b1', part: 'metadata.invoices', key: 'id:5', kept: { id: 5, num: 'INV-5', notes: 'x' }, other: { id: 5, num: 'INV-5', notes: 'y' } };
    expect(locateConflictTarget(s, inv).status).toBe('unchanged');
    applyConflictRestore(s, inv);
    expect(s.invoices[0].notes).toBe('y');
  });

  it('restores a copy, so later edits to the state cannot rewrite the record on file', () => {
    const entry = { id: 'e', bookId: 'b1', part: 'ledger', key: 'id:111', kept: ledgerSale(), other: ledgerSale({ qty: 5 }) };
    const s = { ledger: [ledgerSale()] };
    applyConflictRestore(s, entry);
    s.ledger[0].qty = 1;
    expect(entry.other.qty).toBe(5);
  });
});

describe('plain-words descriptions', () => {
  const e = (part, other, extra = {}) => ({ id: 'x', bookId: 'b1', bookTitle: 'Moon Poems', cur: 'CAD', part, key: 'k', kept: other, other, ...extra });

  it('describes a sale the way the owner would say it', () => {
    expect(describeRecord(e('hist', sale()))).toBe(`Sale on ${D('2026-09-12')} — 2 × Moon Poems at CA$20.00 · order 1001`);
    expect(describeRecord(e('hist', sale({ gratuity: true, price: 0, num: '' })))).toBe(`Gifted copy on ${D('2026-09-12')} — 2 × Moon Poems`);
  });

  it('describes consignment, expenses, stores, payouts and settings', () => {
    expect(describeRecord(e('ledger', ledgerSale()))).toBe(`Sold at Paper Moon on ${D('2026-09-10')} — 3 copies, CA$36.00 due to you`);
    expect(describeRecord(e('ledger', ledgerSale({ type: 'Shipment', qty: 1 })))).toBe(`Sent to Paper Moon on ${D('2026-09-10')} — 1 copy`);
    expect(describeRecord(e('expenses', { id: 1, desc: 'Printing', amount: 120, currency: 'CAD', date: '2026-09-01' }))).toBe(`Expense on ${D('2026-09-01')} — Printing, CA$120.00`);
    expect(describeRecord(e('stores', { id: 7, name: 'Paper Moon' }))).toBe('Store details — Paper Moon');
    expect(describeRecord(e('artistPayouts', { id: 1, amount: 50, cur: 'CAD', date: '2026-09-02' }))).toBe(`Payment to the artist on ${D('2026-09-02')} — CA$50.00`);
    expect(describeRecord({ ...e('metadata.artistPaymentLink', 'b'), key: 'artistPaymentLink' })).toBe('Book setting — Artist payment link');
  });

  it('formats values without leaking "undefined" or "[object Object]"', () => {
    expect(formatFieldValue('notes', undefined)).toBe('—');
    expect(formatFieldValue('voided', true)).toBe('Yes');
    expect(formatFieldValue('price', 20, 'CAD')).toBe('CA$20.00');
    expect(formatFieldValue('date', '2026-09-12')).toBe(D('2026-09-12'));
    expect(D('2026-09-12')).toMatch(/^12 Sep/);
    expect(formatFieldValue('payment', { method: 'Cash', rate: 1 })).toBe('Method: Cash · Exchange rate: 1');
    expect(fieldLabel('payment.method')).toBe('Payment · Method');
    // A nested rate is an exchange rate, not the store's commission.
    expect(fieldLabel('payment.rate')).toBe('Payment · Exchange rate');
    expect(fieldLabel('rate')).toBe("Store's cut (%)");
    expect(fieldLabel('someNewField')).toBe('Some new field');
  });

  it('never puts the wrong currency symbol on an amount', () => {
    // A foreign payment's amount is in the payment's own currency.
    expect(formatFieldValue('payment.amount', 25, 'CAD')).toBe('25');
    // Customer-paid shipping is always CAD, even on a USD book.
    expect(formatFieldValue('shippingPaid', 8, 'USD')).toBe('CA$8.00');
    // The original amount of an expense is in its original currency.
    expect(formatFieldValue('origAmount', 90, 'CAD')).toBe('90');
  });

  it('says how many need a look', () => {
    expect(describeConflictCount(0)).toBe('Nothing needs review.');
    expect(describeConflictCount(1)).toBe('1 record changed on two devices at once needs a look.');
    expect(describeConflictCount(3)).toBe('3 records changed on two devices at once need a look.');
  });
});

describe('review screen markup', () => {
  const entry = {
    id: 'abc-1', bookId: 'b1', bookTitle: '<b>Moon</b> Poems', cur: 'CAD', at: Date.UTC(2026, 8, 22, 12, 5),
    part: 'ledger', key: 'id:111', kept: ledgerSale({ qty: 3 }), other: ledgerSale({ qty: 4 }),
  };

  it('shows an all-clear empty state', () => {
    const html = renderConflictListHtml([]);
    expect(html).toContain('Nothing to review');
    expect(html).toContain('empty-state');
  });

  it('renders both versions side by side with the differing detail flagged', () => {
    document.body.innerHTML = renderConflictListHtml([entry]);
    const item = document.querySelector('.sc-item');
    expect(item.getAttribute('data-conflict-id')).toBe('abc-1');
    expect(item.querySelector('.sc-book').textContent).toBe('<b>Moon</b> Poems'); // escaped, not markup
    const diffRows = [...item.querySelectorAll('tr.is-diff')];
    expect(diffRows).toHaveLength(1);
    expect(diffRows[0].querySelector('th').textContent).toContain('Copies');
    expect(diffRows[0].querySelector('.sc-diff-chip').textContent).toBe('Differs');
    expect([...diffRows[0].querySelectorAll('td')].map(td => td.textContent)).toEqual(['3', '4']);
    expect(item.querySelectorAll('tr.is-same').length).toBeGreaterThan(0);
    const buttons = [...item.querySelectorAll('.sc-actions button')];
    expect(buttons.map(b => b.textContent)).toEqual(["Keep this device's version", "Use the other device's version"]);
    expect(buttons[0].getAttribute('onclick')).toBe("keepSyncConflict('abc-1')");
    expect(buttons[1].getAttribute('onclick')).toBe("restoreSyncConflict('abc-1')");
    expect(item.textContent).toContain('1 detail differs');
    expect(item.textContent).not.toMatch(/undefined|\[object Object\]/);
  });

  it('labels each value for the stacked phone layout', () => {
    const html = renderConflictItemHtml(entry);
    expect(html).toContain('data-label="This device"');
    expect(html).toContain('data-label="Other device"');
  });
});

describe('wiring', () => {
  const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
  const mainJs = readFileSync(join(root, 'src/main.js'), 'utf8');

  it('has the dialog, its permanent live region, and the Backups card', () => {
    document.body.innerHTML = indexHtml.slice(indexHtml.indexOf('<div class="overlay" id="m-sync-conflicts"'), indexHtml.indexOf('<div class="sheets-setup"', indexHtml.indexOf('id="tab-backups"')));
    const modal = document.querySelector('#m-sync-conflicts .modal');
    expect(modal.firstElementChild.classList.contains('modal-title')).toBe(true);
    expect(document.querySelector('#sync-conflicts-live').getAttribute('aria-live')).toBe('polite');
    expect(document.querySelector('#sync-conflicts-body').contains(document.querySelector('#sync-conflicts-live'))).toBe(false);
    expect(document.querySelector('#tab-backups #sync-review-card #sync-review-open').getAttribute('onclick')).toBe('openSyncConflicts()');
  });

  it('exposes the inline handlers and restores through the same recompute as a merge', () => {
    expect(mainJs).toMatch(/Object\.assign\(window, \{ openSyncConflicts, keepSyncConflict, restoreSyncConflict/);
    const fn = mainJs.slice(mainJs.indexOf('async function restoreSyncConflict'), mainJs.indexOf('// Another tab on this device recorded'));
    expect(fn).toContain('confirmDialog(');
    expect(fn).not.toMatch(/window\.confirm|\bconfirm\(/);
    expect(fn.indexOf('applyConflictRestore(')).toBeLessThan(fn.indexOf('recomputeAfters('));
    expect(fn.indexOf('recomputeAfters(')).toBeLessThan(fn.indexOf('saveState('));
  });
});
