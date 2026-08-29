import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  suggestRecoveredOrderNumber,
  recoveredOrderPrefill,
  validateRecoveredOrder,
  buildRecoveredOrderEntry,
} from '../src/lib/manual-website-order.js';
import {
  enrichShippoExpense,
  normalizeShippingOrderNumber,
  reconcileShippingExpense,
} from '../src/lib/shipping-reconciliation.js';
import { appSource } from './helpers/extract-decl.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The exact shape the worklist hands over: a Shippo label whose recipient never
// turned up in the Gmail scan, so no order exists for it anywhere in the app.
const strandedExpense = {
  ref: 'shippo:4f2a9cbd77e4419e9b1f0f2d3c4b5a69',
  shippoTransactionId: '4f2a9cbd77e4419e9b1f0f2d3c4b5a69',
  amount: 17.81,
  currency: 'CAD',
  date: '2026-08-21',
  recipientName: 'Zackary Focker',
  recipientEmail: 'zack@example.com',
  recipientPostal: 'V5L 3X8',
  recipientStreet1: '1820 Commercial Dr',
  recipientCity: 'Vancouver',
  recipientState: 'BC',
  recipientCountry: 'CA',
  shippingMatchStatus: 'unmatched',
};

describe('recovering a website order the scan missed', () => {
  it('derives a stable, valid order number from the label itself', () => {
    const number = suggestRecoveredOrderNumber(strandedExpense);
    expect(number).toBe('#RECOV-4B5A69');
    // Whatever it suggests must survive the app's own order-number parser,
    // or the postage still could not link to it.
    expect(normalizeShippingOrderNumber(number)).toBe('#RECOV-4B5A69');
    expect(suggestRecoveredOrderNumber(strandedExpense)).toBe(number);
  });

  it('falls back to the ref when the transaction id was never stored', () => {
    expect(suggestRecoveredOrderNumber({ ref: 'shippo:abc123def456' })).toBe('#RECOV-DEF456');
    expect(suggestRecoveredOrderNumber({})).toBe('');
  });

  it('prefills the form from the label recipient', () => {
    expect(recoveredOrderPrefill(strandedExpense)).toMatchObject({
      customer: 'Zackary Focker',
      email: 'zack@example.com',
      addr1: '1820 Commercial Dr',
      city: 'Vancouver',
      province: 'BC',
      postal: 'V5L 3X8',
      country: 'CA',
      date: '2026-08-21',
    });
  });

  it('never renders "undefined" for a label imported before addresses were kept', () => {
    const legacy = { ref: 'shippo:old', recipientName: 'Zackary Focker', date: '2026-08-21' };
    const prefill = recoveredOrderPrefill(legacy);
    Object.values(prefill).forEach(value => expect(typeof value).toBe('string'));
    expect(prefill.country).toBe('Canada');
    expect(prefill.city).toBe('');
  });
});

describe('recovered order validation', () => {
  const good = {
    orderNumber: 'ZACK-880021',
    bookId: 'hound',
    date: '2026-08-21',
    qty: 1,
    price: 40,
    shippingPaid: 0,
    customer: 'Zackary Focker',
  };

  it('accepts a complete form', () => {
    expect(validateRecoveredOrder(good, { takenOrderNumbers: ['#GPWT-916083'] })).toEqual([]);
  });

  it('rejects an order number the ledger already holds, however it is written', () => {
    const errors = validateRecoveredOrder(good, { takenOrderNumbers: ['#zack-880021'] });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('orderNumber');
  });

  it('rejects a number the app could not match postage against', () => {
    expect(validateRecoveredOrder({ ...good, orderNumber: 'ZACK880021' })[0].field).toBe('orderNumber');
    expect(validateRecoveredOrder({ ...good, orderNumber: '' })[0].field).toBe('orderNumber');
  });

  it('rejects fractional, zero and negative quantities', () => {
    expect(validateRecoveredOrder({ ...good, qty: 0 })[0].field).toBe('qty');
    expect(validateRecoveredOrder({ ...good, qty: 1.5 })[0].field).toBe('qty');
    expect(validateRecoveredOrder({ ...good, qty: -2 })[0].field).toBe('qty');
  });

  it('allows a free order and free shipping but not negative money', () => {
    expect(validateRecoveredOrder({ ...good, price: 0, shippingPaid: 0 })).toEqual([]);
    expect(validateRecoveredOrder({ ...good, price: -1 })[0].field).toBe('price');
    expect(validateRecoveredOrder({ ...good, shippingPaid: -1 })[0].field).toBe('shippingPaid');
  });

  it('requires a book, a real date and a customer name', () => {
    expect(validateRecoveredOrder({ ...good, bookId: '' })[0].field).toBe('bookId');
    expect(validateRecoveredOrder({ ...good, date: '21/08/2026' })[0].field).toBe('date');
    expect(validateRecoveredOrder({ ...good, customer: '   ' })[0].field).toBe('customer');
  });

  it('reports every bad field at once rather than one at a time', () => {
    const errors = validateRecoveredOrder({ orderNumber: '', bookId: '', qty: 0, price: -1, date: '', customer: '' });
    expect(errors.map(e => e.field)).toEqual(['orderNumber', 'bookId', 'qty', 'price', 'date', 'customer']);
  });
});

describe('the recovered history entry', () => {
  const entry = buildRecoveredOrderEntry({
    orderNumber: 'zack-880021',
    date: '2026-08-21',
    qty: 2,
    price: 40,
    shippingPaid: 17.81,
    customer: 'Zackary Focker',
    email: 'zack@example.com',
    addr1: '1820 Commercial Dr',
    city: 'Vancouver',
    province: 'BC',
    postal: 'V5L 3X8',
    country: 'CA',
  }, { stockAfter: 48 });

  it('looks exactly like a scanned website sale to everything downstream', () => {
    expect(entry).toMatchObject({
      num: '#ZACK-880021',
      chan: 'Website',
      qty: 2,
      price: 40,
      after: 48,
      date: '2026-08-21',
      shipName: 'Zackary Focker',
      shipAddr1: '1820 Commercial Dr',
      shipPostal: 'V5L 3X8',
      shippingPaid: 17.81,
      sheetsId: 'bc-ZACK-880021',
    });
  });

  it('adds up the money the same way the orders queue does', () => {
    expect(entry.merchandisePaid).toBe(80);
    expect(entry.subtotal).toBe(80);
    expect(entry.totalPaid).toBe(97.81);
  });

  it('records that this row was rebuilt from a label, not parsed from an email', () => {
    expect(entry.notes).toBe('Recovered from postage');
    expect(entry.recoveredFromPostage).toBe(true);
  });

  it('carries a shipping address, so the shipping portal can offer it again', () => {
    // getRecentShippingOrders() keys off shipName + shipAddr1 — without both,
    // a recovered customer stays invisible in the destination picker.
    expect(entry.shipName).toBeTruthy();
    expect(entry.shipAddr1).toBeTruthy();
  });

  it('is immediately matchable by the postage it was created for', () => {
    expect(reconcileShippingExpense({ sourceOrderNumber: entry.num, date: '2026-08-21' }, [entry]))
      .toMatchObject({ shippingOrderNumber: '#ZACK-880021', shippingMatchStatus: 'matched' });
  });
});

describe('Shippo import keeps the full delivery address', () => {
  it('stores every address field the recovery form needs', () => {
    const enriched = enrichShippoExpense(
      { date: '2026-08-21', amount: 17.81, currency: 'CAD' },
      { object_id: 'tx1' },
      {
        object_id: 'shp1',
        address_to: {
          name: 'Zackary Focker', email: 'zack@example.com', zip: 'V5L 3X8',
          street1: '1820 Commercial Dr', street2: 'Unit 4', city: 'Vancouver',
          state: 'BC', country: 'CA', phone: '+16045550101',
        },
      },
      {},
      [],
    );
    expect(enriched).toMatchObject({
      recipientStreet1: '1820 Commercial Dr',
      recipientStreet2: 'Unit 4',
      recipientCity: 'Vancouver',
      recipientState: 'BC',
      recipientCountry: 'CA',
      recipientPhone: '+16045550101',
      shippingMatchStatus: 'unmatched',
    });
  });

  it('leaves the new fields as empty strings when Shippo returns no address', () => {
    const enriched = enrichShippoExpense({ date: '2026-08-21' }, {}, {}, {}, []);
    expect(enriched.recipientStreet1).toBe('');
    expect(enriched.recipientCountry).toBe('');
  });
});

describe('the worklist offers a way out of an unmatched label', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  it('wires the recovery form into the page', () => {
    expect(html).toContain('id="m-recover-website-order"');
    expect(html).toContain('onclick="saveRecoverWebsiteOrder()"');
    expect(html).toContain('onchange="onRecoverWebsiteOrderBookChange()"');
    expect(html).toContain("attemptCloseModal('recover-website-order')");
  });

  it('offers the recovery button on every unmatched row', () => {
    expect(appSource).toContain('onclick="openRecoverWebsiteOrder(this.dataset.ref)"');
  });

  it('explains an empty dropdown instead of leaving a dead control', () => {
    expect(appSource).toContain('No website orders on file yet');
    expect(appSource).toContain('No orders on file');
  });

  it('exposes the recovery handlers to the inline onclick attributes', () => {
    expect(appSource).toContain('openRecoverWebsiteOrder, onRecoverWebsiteOrderBookChange, saveRecoverWebsiteOrder');
  });

  it('writes the recovered order through the ledger path, not a bare push', () => {
    expect(appSource).toContain('commitRecoveredWebsiteOrder');
    // Stock, channel stats and the Sheets row must all move together.
    expect(appSource).toMatch(/commitRecoveredWebsiteOrder[\s\S]{0,2600}chStats\['Website'\]/);
    expect(appSource).toMatch(/commitRecoveredWebsiteOrder[\s\S]{0,2600}syncToSheets/);
  });
});
