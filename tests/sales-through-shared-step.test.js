// @vitest-environment jsdom
// A website order found by the scan, a website order recovered from a paid
// postage label, and a spreadsheet import all add sales to a book. They now go
// through the same step as the register and the order form, so each one moves
// stock, copies sold, revenue and the channel totals the same way, writes the
// same kind of history row, keeps the running Stock After right for a
// backdated sale, and counts its order number as applied.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { buildRecoveredOrderEntry } from '../src/lib/manual-website-order.js';

let app;
beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'harbour', listPrice: 40 })] });
}, 30000);

// One sale already on file, dated 10 October, leaving 90 of 100 copies.
const LATER_SALE = { num: 'M-1', chan: 'Book Fair', qty: 10, price: 40, after: 90, date: '2026-10-10', sheetsId: 'evt-later' };
beforeEach(async () => {
  await app.resetBook('harbour', {
    stock: 90, sold: 10, revenue: 400,
    chStats: { 'Book Fair': { txns: 1, units: 10, revenue: 400 } },
    hist: [{ ...LATER_SALE }],
  });
  app.window.switchBook('harbour');
});

const st = () => app.main.states.harbour;
const row = (num) => st().hist.find(h => h.num === num);

// What every sale row carries, whichever way it came in.
function expectSaleRow(h, { num, chan, qty, price, date }) {
  expect(h).toMatchObject({ num, chan, qty, price, date, payment: null, enteredBy: 'Publisher', cur: 'CAD' });
  expect(typeof h.sheetsId).toBe('string');
  expect(h.sheetsId.length).toBeGreaterThan(0);
  // Back-filled sales keep their own date in the activity feed.
  expect(h.recordedAt).toBeUndefined();
}

describe('a website order found by the scan', () => {
  it('moves the totals, writes a full row and keeps Stock After in date order', () => {
    app.main.orders.length = 0;
    app.main.orders.push({
      id: 'bc-1', orderNum: '#WEB-1', bookId: 'harbour', hasBook: true, qty: 2, price: 35,
      date: '2026-10-01', customer: 'Rae', email: 'rae@example.com', shippingPaid: 0,
    });
    app.window.applyOne('bc-1');

    expect(st()).toMatchObject({ stock: 88, sold: 12, revenue: 470 });
    expect(st().chStats.Website).toEqual({ txns: 1, units: 2, revenue: 70 });
    expectSaleRow(row('#WEB-1'), { num: '#WEB-1', chan: 'Website', qty: 2, price: 35, date: '2026-10-01' });
    expect(row('#WEB-1')).toMatchObject({ sheetsId: 'bc-WEB-1', notes: 'Big Cartel', shipName: 'Rae', shipEmail: 'rae@example.com' });
    // Dated before the fair sale: 98 left after it, 88 after the fair.
    expect(row('#WEB-1').after).toBe(98);
    expect(row('M-1').after).toBe(88);
    expect(app.main.getAllAppliedIds().has('bc-1')).toBe(true);
  });
});

describe('a website order recovered from a postage label', () => {
  it('moves the totals the same way and keeps Stock After in date order', () => {
    const form = { qty: 1, price: 40, orderNumber: 'GPW-7', date: '2026-10-03', customer: 'Sam', shippingPaid: 12 };
    const entry = app.main.commitRecoveredWebsiteOrder('harbour', form, ({ stockAfter }) => buildRecoveredOrderEntry(form, { stockAfter }));

    expect(entry).toBe(row('#GPW-7'));
    expect(st()).toMatchObject({ stock: 89, sold: 11, revenue: 440 });
    expect(st().chStats.Website).toEqual({ txns: 1, units: 1, revenue: 40 });
    expectSaleRow(entry, { num: '#GPW-7', chan: 'Website', qty: 1, price: 40, date: '2026-10-03' });
    expect(entry).toMatchObject({ sheetsId: 'bc-GPW-7', recoveredFromPostage: true, shippingPaid: 12, shipName: 'Sam' });
    expect(entry.after).toBe(99);
    expect(row('M-1').after).toBe(89);
  });
});

describe('a spreadsheet import', () => {
  it('moves the totals, writes full rows and hides imported numbers from the Orders tab', async () => {
    const csv = 'Order #,Date,Channel,Qty,Unit price,Notes\nA-1,2026-10-01,Website,2,40,first\nA-2,2026-10-12,Book Fair,1,30,\n';
    const file = new File([csv], 'orders.csv', { type: 'text/csv' });
    await app.window.handleImportFile({ target: { files: [file], value: '' } });
    await vi.waitFor(() => {
      expect(document.getElementById('import-summary').textContent).toContain('2 orders');
    }, { timeout: 3000, interval: 10 });
    // Read before the import so the cache is warm and has to be refreshed.
    expect(app.main.getAllAppliedIds().has('A-1')).toBe(false);
    app.window.confirmImport();

    expect(st()).toMatchObject({ stock: 87, sold: 13, revenue: 510 });
    expect(st().chStats.Website).toEqual({ txns: 1, units: 2, revenue: 80 });
    expect(st().chStats['Book Fair']).toEqual({ txns: 2, units: 11, revenue: 430 });
    expectSaleRow(row('A-1'), { num: 'A-1', chan: 'Website', qty: 2, price: 40, date: '2026-10-01' });
    expectSaleRow(row('A-2'), { num: 'A-2', chan: 'Book Fair', qty: 1, price: 30, date: '2026-10-12' });
    expect(row('A-1').notes).toBe('first');
    expect([row('A-1').after, row('M-1').after, row('A-2').after]).toEqual([98, 88, 87]);
    expect(app.main.getAllAppliedIds().has('A-1')).toBe(true);
  });
});
