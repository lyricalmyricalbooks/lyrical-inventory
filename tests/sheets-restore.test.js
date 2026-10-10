// "Sync from Google Sheet" rebuilds a book from its tab. The function is lifted
// out of main.js (which cannot be imported in a test) and run on rows shaped
// exactly as the Apps Script's getBookData returns them.
import { describe, it, expect } from 'vitest';
import { extractDecl } from './helpers/extract-decl.js';
import { getBookCurrencyCode, normalizeCurrencyCode, roundCents } from '../src/lib/money.js';
import { deriveOnHand, recalculateBookStatsFromHistory } from '../src/lib/inventory.js';
import { reconcileConsignmentMirrors } from '../src/lib/consignment.js';

const book = { id: 'zine', title: 'Night Zine', currency: 'CA$', maxPrint: 100 };

function restore(rows, state = { stores: [], invoices: [] }) {
  const deps = {
    getState: () => state,
    showToast: () => {},
    getBookCurrencyCode, normalizeCurrencyCode, roundCents,
    recalculateBookStatsFromHistory, deriveOnHand, reconcileConsignmentMirrors,
    recomputeAfters: () => {},
    saveState: async () => {},
    renderAll: () => {}, updateDash: () => {}, closeM: () => {},
    today: () => '2026-10-10',
  };
  const src = [
    extractDecl('SHEET_RESTORE_TYPES'),
    extractDecl('parseAndValidateDate'),
    'let _sheetsRestoreData = __data;',
    extractDecl('confirmRestoreBookDataFromSheets'),
    'return confirmRestoreBookDataFromSheets();',
  ].join('\n');
  const run = new Function(...Object.keys(deps), '__data', 'window', `return (async () => {\n${src}\n})();`);
  return run(...Object.values(deps), { book, rows }, {}).then(() => state);
}

const row = (over) => ({
  _eventId: '', Date: '2026-09-01T04:00:00.000Z', Book: 'Night Zine', Type: 'order', 'Event/Num': '#1',
  'Store/Chan': 'Website', Qty: 1, Currency: 'CAD', 'Price/Rate': 30, 'Total/Amount': 30,
  'CAD Equivalent': 30, Status: 'OK', Notes: '', Invoice: '', ...over,
});

describe('restoring a book from its sheet tab', () => {
  it('puts the postage a customer paid back on its order', async () => {
    const s = await restore([
      row({ _eventId: 'evt-1' }),
      row({ _eventId: 'evt-1-shipping', Type: 'shipping', 'Store/Chan': 'Website shipping', Qty: '', 'Price/Rate': '', 'Total/Amount': 8.5 }),
      row({ _eventId: 'evt-2', 'Event/Num': '#2' }),
    ]);
    const orders = s.hist.filter(h => !h.consignmentLink);
    expect(orders).toHaveLength(2);
    expect(orders.find(h => h.sheetsId === 'evt-1').shippingPaid).toBe(8.5);
    expect(orders.find(h => h.sheetsId === 'evt-2').shippingPaid).toBeUndefined();
  });

  it('matches postage by order number when the order had no id', async () => {
    const s = await restore([
      row({ _eventId: '', 'Event/Num': '#77' }),
      row({ _eventId: 'ship-77-shipping', Type: 'shipping', 'Event/Num': '#77', 'Total/Amount': 6 }),
    ]);
    expect(s.hist[0].shippingPaid).toBe(6);
  });

  it('restores an inventory write-off without inventing a store for it', async () => {
    const s = await restore([
      row({ _eventId: 'evt-w', Type: 'consignment', 'Event/Num': 'Inventory Disposal', 'Store/Chan': '', Qty: 4, 'Total/Amount': 0, Status: 'written off', Notes: 'Water damaged' }),
    ]);
    expect(s.stores).toEqual([]);
    expect(s.ledger).toHaveLength(1);
    expect(s.ledger[0]).toMatchObject({ type: 'Inventory Disposal', qty: 4, notes: 'Water damaged', status: 'written off', sheetsId: 'evt-w' });
    expect(s.ledger[0].storeId).toBeUndefined();
  });

  it('still rebuilds consignment at its store', async () => {
    const s = await restore([
      row({ _eventId: 'evt-c', Type: 'consignment', 'Event/Num': 'Sale', 'Store/Chan': 'Rooneys', Qty: 2, 'Price/Rate': 40, 'Total/Amount': 36, Status: 'pending' }),
    ]);
    expect(s.stores.map(st => st.name)).toEqual(['Rooneys']);
    expect(s.ledger[0]).toMatchObject({ type: 'Sale', storeName: 'Rooneys', amountDue: 36 });
  });
});
