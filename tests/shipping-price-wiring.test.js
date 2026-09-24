// Shipping that doesn't pay for itself is said at the moment it can still be
// fixed: beside each rate while picking a label, when a label is linked to
// its order, and once a month per destination.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

let app, shipping;
const order = (over = {}) => ({
  num: 'LM-501', chan: 'Website', qty: 1, price: 40, date: '2026-09-20',
  shipCountry: 'US', shipState: 'NY', shippingPaid: 12, ...over,
});

beforeAll(async () => {
  app = await loadApp({
    books: [makeBook({ id: 'a', title: 'A' }), makeBook({ id: 'b', title: 'B' })],
    states: {
      a: { hist: [order()] },
      // The same order's second book: its shipping charge repeats, it isn't extra.
      b: { hist: [order({ shippingPaid: 12 })] },
    },
  });
  shipping = await import('../src/features/shipping.js');
}, 30000);

beforeEach(() => {
  localStorage.removeItem('lm-postage-loss-seen');
  app.main.TAX_CENTER.businessExpenses = [
    { ref: 'canadapost:111', cat: 'Shipping & Postage', vendor: 'Canada Post', amount: 18.5, baseAmount: 18.5,
      shippingMatchStatus: 'matched', shippingOrderNumber: 'LM-501', date: '2026-09-21' },
  ];
});

describe('one order, however many books', () => {
  it('counts a two-book order once, with its charge taken once', () => {
    const rows = shipping.websiteOrdersForPricing().filter(o => o.num === '#LM-501');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ qty: 2, paid: 12, postage: 18.5, region: 'US' });
  });
});

describe('beside each rate', () => {
  it('says which labels the customer’s shipping charge covers', () => {
    const dest = document.getElementById('ship-prefill-dest') || Object.assign(document.createElement('div'), { id: 'ship-prefill-dest' });
    if (!dest.isConnected) document.body.appendChild(dest);
    dest.dataset.orderNumber = 'LM-501';
    shipping.renderCanadaPostRatesCard([
      { serviceCode: 'A', serviceName: 'Tracked Packet', totalPrice: 10.5, taxes: 0 },
      { serviceCode: 'B', serviceName: 'Expedited', totalPrice: 19, taxes: 0 },
    ], { stCountryCode: 'US', isOffline: true });
    const card = document.getElementById('canadapost-rates-card');
    expect(card.querySelector('.rate-coverage-note').textContent).toMatch(/customer paid \$12\.00.*1 of these 2 options cost more/);
    const tags = [...card.querySelectorAll('.rate-coverage-tag')].map(t => t.textContent);
    expect(tags[0]).toMatch(/Covered/);
    expect(tags[1]).toMatch(/\$7\.00 more than the customer paid/);
  });
});

describe('when a label comes in over the charge', () => {
  it('stays quiet on a first look, then says a newly linked loser once', () => {
    expect(shipping.checkNewPostageLosses()).toEqual([]);
    const fresh = shipping.checkNewPostageLosses({ justBought: { num: 'LM-777', postage: 30 } });
    expect(fresh).toEqual([]);
    // A new order whose label cost more than its charge.
    app.main.states.a.hist.push(order({ num: 'LM-600', date: new Date().toISOString().slice(0, 10), shippingPaid: 10 }));
    const said = shipping.checkNewPostageLosses({ justBought: { num: 'LM-600', postage: 16 } });
    expect(said.map(o => o.num)).toEqual(['#LM-600']);
    expect(shipping.checkNewPostageLosses({ justBought: { num: 'LM-600', postage: 16 } })).toEqual([]);
  });
});

describe('Canada Post labels bought in the app', () => {
  it('are repaired so the shipping figures can see them, and tied to their order', () => {
    app.main.states.a.hist.push(order({ num: 'LM-800', trackingNumber: '7023 4567 8901 2345' }));
    app.main.TAX_CENTER.businessExpenses = [
      { ref: 'canadapost:7023456789012345', category: 'Shipping & Postage', amount: 14.25, currency: 'CAD', trackingPin: '7023456789012345' },
      { ref: 'canadapost:999', category: 'Shipping & Postage', amount: 9, currency: 'CAD', simulated: true },
    ];
    expect(shipping.repairInAppCanadaPostExpenses()).toBe(1);
    const [real, practice] = app.main.TAX_CENTER.businessExpenses;
    expect(real).toMatchObject({ cat: 'Shipping & Postage', baseAmount: 14.25, shippingMatchStatus: 'matched', shippingOrderNumber: '#LM-800' });
    expect(practice.cat).toBeUndefined();
    expect(shipping.websiteOrdersForPricing().find(o => o.num === '#LM-800').postage).toBe(14.25);
    expect(shipping.repairInAppCanadaPostExpenses()).toBe(0);
  });
});
