// Website orders brought into the books, driven through the real app.
//
// The website's inbox and the publish transaction are stood in for by small
// fakes; the publish fake runs the real decision function (planWebsitePublish)
// against what the app actually SAVED to the cloud, so "marked imported" here
// means the same thing it does on the server: the saved rows show the order.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { planWebsitePublish } from '../src/lib/website-link.js';

const BOOK = 'harbour';
const books = [makeBook({ id: BOOK, title: 'Harbour Lights', currency: 'CA$', listPrice: 40, maxPrint: 100 })];

const link = {
  ordersCb: null,
  statusCb: null,
  docs: {},        // the server's websiteOrders, by id
  publishes: [],
  consentWrites: [],
};

let app;
let feature;
const state = () => app.main.states[BOOK];

function webOrder(orderId, over = {}) {
  return {
    v: 1,
    orderId,
    number: `#${orderId}`,
    hash: 'h1',
    test: false,
    paidAt: '2026-10-11T15:00:00.000Z',
    paidDay: '2026-10-11',
    paymentMethod: 'Stripe',
    paymentStatus: 'paid',
    refundState: 'none',
    refund: null,
    stripePaymentIntentId: `pi_${orderId}`,
    totals: { subtotal: 80, discount: 0, discountCode: '', shipping: 12, tax: 0, total: 92, giftCard: 0 },
    charged: { currency: 'CAD', amountMinor: 9200 },
    customer: { name: 'Dana Reader', email: 'dana@example.com', phone: '', address: { street: '1 Main St', unit: '', city: 'Toronto', state: 'ON', zip: 'M4B 1B3', country: 'CA' } },
    fulfillment: { method: 'shipping', status: 'paid', trackingNumber: '', trackingCarrier: '', trackingUrl: '', shippedDay: null, labelSource: null },
    books: { [BOOK]: { net: 2, sold: 2, restocked: 0, unitCAD: 40, merchCAD: 80, preorder: false, titles: ['Harbour Lights'] } },
    firstBook: BOOK,
    unlinked: [],
    ...over,
  };
}

/** The website pushes (or re-pushes) an order: it lands in the inbox, pending. */
function push(web) {
  link.docs[web.orderId] = { ...(link.docs[web.orderId] || {}), web, pending: true };
  deliver();
}

function deliver() {
  const pending = Object.entries(link.docs).filter(([, d]) => d.pending).map(([id, d]) => ({ id, ...JSON.parse(JSON.stringify(d)) }));
  link.ordersCb(pending);
}

function setStatus(status) {
  link.statusCb(status);
}

const CONSENTED = { website: { at: new Date().toISOString() }, app: { importConsentAt: '2026-10-01T00:00:00.000Z' } };

async function fakePublish(args) {
  link.publishes.push(JSON.parse(JSON.stringify(args)));
  if (!app) return null;
  const saved = app.cloud.books[BOOK] ? JSON.parse(app.cloud.books[BOOK]) : null;
  const serverBooks = saved ? { [BOOK]: { hist: saved.hist || [], ledger: saved.ledger || [], metadata: saved } } : {};
  const now = new Date().toISOString();
  const plan = planWebsitePublish({ ...args, books: serverBooks, catalog: app.cloud.catalog, orderDocs: link.docs, now });
  plan.orderUpdates.forEach(({ orderId, data }) => {
    const docData = link.docs[orderId];
    Object.entries(data).forEach(([key, value]) => {
      if (key.startsWith('app.')) docData.app = { ...(docData.app || {}), [key.slice(4)]: value };
      else docData[key] = value;
    });
  });
  if (plan.orderUpdates.length) deliver();
  return { ok: true, at: now, feeds: plan.feeds.length, accepted: plan.accepted, refused: plan.refused, sent: plan.sent, current: plan.current, blocked: [], unavailable: [] };
}

beforeAll(async () => {
  app = await loadApp({
    books,
    overrides: {
      _fbWatchWebsiteOrders: (cb) => { link.ordersCb = cb; return () => {}; },
      _fbWatchWebsiteLinkStatus: (cb) => { link.statusCb = cb; cb(CONSENTED); return () => {}; },
      _fbSaveWebsiteLinkApp: async (data) => { link.consentWrites.push(data); },
      _fbPublishWebsiteLink: fakePublish,
    },
  });
  feature = await import('../src/features/website-link.js');
}, 30000);

beforeEach(async () => {
  link.docs = {};
  link.publishes = [];
  link.consentWrites = [];
  setStatus(CONSENTED);
  deliver();
  await app.resetBook(BOOK, { hist: [] });
  if (app.main.activeBook !== BOOK) app.window.switchBook(BOOK);
});

const waitFor = (fn) => vi.waitFor(fn, { timeout: 4000, interval: 10 });

describe('a new website order', () => {
  it('is added as a sale, stock goes down, and the order is marked done from the saved rows', async () => {
    push(webOrder('WEB-NEW1'));
    await waitFor(() => expect(state().hist.some(h => h.webOrderId === 'WEB-NEW1')).toBe(true));
    const row = state().hist.find(h => h.webOrderId === 'WEB-NEW1');
    expect(row).toMatchObject({
      uid: `web-WEB-NEW1-${BOOK}`, sheetsId: `web-WEB-NEW1-${BOOK}`, chan: 'Website', num: '#WEB-NEW1',
      qty: 2, price: 40, date: '2026-10-11', fulfilledOnWebsite: true, enteredBy: 'Website', shippingPaid: 12,
    });
    expect(state().stock).toBe(98);
    expect(app.cloud.lastSave(BOOK).state.hist.some(h => h.uid === row.uid)).toBe(true);

    await waitFor(() => expect(link.docs['WEB-NEW1'].pending).toBe(false));
    expect(link.docs['WEB-NEW1'].imported).toMatchObject({ hash: 'h1', effect: { [BOOK]: 2 } });
    expect(app.toast()).toMatch(/1 website sale added/);
  });

  it('is never added twice when the inbox delivers it again', async () => {
    push(webOrder('WEB-TWICE'));
    await waitFor(() => expect(link.docs['WEB-TWICE'].pending).toBe(false));
    link.docs['WEB-TWICE'].pending = true; // another device hadn't seen it yet
    deliver();
    await waitFor(() => expect(link.docs['WEB-TWICE'].pending).toBe(false));
    expect(state().hist.filter(h => h.webOrderId === 'WEB-TWICE')).toHaveLength(1);
    expect(state().stock).toBe(98);
  });
});

describe('an order already in the books by hand', () => {
  it('is linked to the website’s copy, never counted twice', async () => {
    await app.resetBook(BOOK, { hist: [{ num: '#WEB-HAND', chan: 'Website', qty: 2, price: 38, date: '2026-10-11', sheetsId: 'stripe-ch_9', notes: 'Stripe' }] });
    push(webOrder('WEB-HAND'));
    await waitFor(() => expect(state().hist[0].webOrderId).toBe('WEB-HAND'));
    expect(state().hist).toHaveLength(1);
    // Linked, not repriced: the hand-entered sale keeps the money it recorded.
    expect(state().hist[0]).toMatchObject({ uid: `web-WEB-HAND-${BOOK}`, sheetsId: 'stripe-ch_9', price: 38, notes: 'Stripe' });
    expect(state().stock).toBe(98);
    await waitFor(() => expect(link.docs['WEB-HAND'].pending).toBe(false));
  });

  it('a look-alike waits under Needs you until the owner says they are different sales', async () => {
    await app.resetBook(BOOK, { hist: [{ num: '', chan: 'In Person', qty: 2, price: 35, date: '2026-10-10', shipEmail: 'dana@example.com', sheetsId: 'pos-1' }] });
    push(webOrder('WEB-LOOK'));
    const card = document.getElementById('web-link-card');
    await waitFor(() => expect(card.textContent).toMatch(/Needs you/));
    expect(state().hist).toHaveLength(1);
    expect(link.docs['WEB-LOOK'].pending).toBe(true);

    card.querySelector('[data-wl-action="different"][data-order="WEB-LOOK"]').click();
    await waitFor(() => expect(state().hist).toHaveLength(2));
    expect(state().stock).toBe(96);
    await waitFor(() => expect(link.docs['WEB-LOOK'].pending).toBe(false));
    expect(link.docs['WEB-LOOK'].imported.decisions).toEqual({ [BOOK]: { choice: 'different' } });
  });

  it('remembers a "keep that sale" choice when the website pushes the order again', async () => {
    await app.resetBook(BOOK, { hist: [{ num: '#WEB-KEEP', chan: 'Website', qty: 1, price: 30, date: '2026-10-11', sheetsId: 'x9' }] });
    // Earlier the owner said that hand sale is a different sale from this order.
    const web = webOrder('WEB-KEEP', { books: { [BOOK]: { net: 1, sold: 1, unitCAD: 40, merchCAD: 40 } } });
    link.docs['WEB-KEEP'] = { web, pending: true, imported: { hash: 'h0', decisions: { [BOOK]: { choice: 'different' } } } };
    deliver();
    await waitFor(() => expect(link.docs['WEB-KEEP'].pending).toBe(false));
    expect(state().hist).toHaveLength(2);
    expect(link.docs['WEB-KEEP'].imported.decisions).toEqual({ [BOOK]: { choice: 'different' } });
  });

  it('"Same sale — use the website’s numbers" links the look-alike instead', async () => {
    await app.resetBook(BOOK, { hist: [{ num: '', chan: 'In Person', qty: 2, price: 35, date: '2026-10-10', shipEmail: 'dana@example.com', sheetsId: 'pos-2' }] });
    push(webOrder('WEB-SAME'));
    const card = document.getElementById('web-link-card');
    await waitFor(() => expect(card.querySelector('[data-wl-action="same"][data-order="WEB-SAME"]')).not.toBeNull());
    card.querySelector('[data-wl-action="same"][data-order="WEB-SAME"]').click();
    await waitFor(() => expect(state().hist[0].webOrderId).toBe('WEB-SAME'));
    expect(state().hist).toHaveLength(1);
    expect(state().hist[0]).toMatchObject({ chan: 'Website', price: 35, sheetsId: 'pos-2' });
    expect(state().stock).toBe(98);
  });
});

describe('refunds from the website', () => {
  it('voids the sale when every copy came back, and brings it back if the bank rejects the refund', async () => {
    push(webOrder('WEB-REF'));
    await waitFor(() => expect(link.docs['WEB-REF'].pending).toBe(false));
    expect(state().stock).toBe(98);

    push(webOrder('WEB-REF', { hash: 'h2', paymentStatus: 'refunded', refundState: 'full', books: { [BOOK]: { net: 0, sold: 2, restocked: 2, unitCAD: 40, merchCAD: 80 } } }));
    await waitFor(() => expect(state().hist.find(h => h.webOrderId === 'WEB-REF').voided).toBe(true));
    expect(state().stock).toBe(100);
    await waitFor(() => expect(link.docs['WEB-REF'].imported.hash).toBe('h2'));

    push(webOrder('WEB-REF', { hash: 'h3' }));
    await waitFor(() => expect(state().hist.find(h => h.webOrderId === 'WEB-REF').voided).toBe(false));
    expect(state().stock).toBe(98);
    expect(state().hist.filter(h => h.webOrderId === 'WEB-REF')).toHaveLength(1);
  });

  it('keeps the copies gone at no money when they did not come back', async () => {
    push(webOrder('WEB-GONE'));
    await waitFor(() => expect(link.docs['WEB-GONE'].pending).toBe(false));
    push(webOrder('WEB-GONE', { hash: 'h2', paymentStatus: 'refunded', refundState: 'full', books: { [BOOK]: { net: 2, sold: 2, restocked: 0, unitCAD: 40, merchCAD: 80 } } }));
    await waitFor(() => expect(state().hist.find(h => h.webOrderId === 'WEB-GONE').gratuity).toBe(true));
    const row = state().hist.find(h => h.webOrderId === 'WEB-GONE');
    expect(row).toMatchObject({ price: 0, qty: 2, voided: false, webRefunded: true });
    expect(state().stock).toBe(98);
    expect(state().revenue).toBe(0);
  });
});

describe('the first time', () => {
  it('asks before adding anything, then brings the orders in', async () => {
    setStatus({ website: { at: new Date().toISOString() }, app: {} });
    push(webOrder('WEB-FIRST'));
    const card = document.getElementById('web-link-card');
    await waitFor(() => expect(card.textContent).toContain('1 new · 0 already in your books (will be linked) · 0 need you'));
    expect(state().hist).toHaveLength(0);

    card.querySelector('[data-wl-action="consent"]').click();
    await waitFor(() => expect(state().hist).toHaveLength(1));
    expect(link.consentWrites[0].importConsentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('rehearsal orders', () => {
  it('are listed as a dry run and never recorded', async () => {
    push(webOrder('WEB-TEST', { test: true }));
    const card = document.getElementById('web-link-card');
    await waitFor(() => expect(card.textContent).toContain('Would take 2 copies of Harbour Lights off your stock.'));
    expect(state().hist).toHaveLength(0);
    expect(link.docs['WEB-TEST'].pending).toBe(true);

    card.querySelector('[data-wl-action="clear-test"][data-order="WEB-TEST"]').click();
    await waitFor(() => expect(link.docs['WEB-TEST'].pending).toBe(false));
    expect(link.docs['WEB-TEST'].imported.effect).toEqual({});
    await waitFor(() => expect(card.textContent).not.toContain('WEB-TEST'));
    expect(state().hist).toHaveLength(0);
  });
});

describe('postage bought here for a website order', () => {
  it('sends the label to the website from the saved rows, once', async () => {
    push(webOrder('WEB-SHIP'));
    await waitFor(() => expect(link.docs['WEB-SHIP'].pending).toBe(false));
    const row = state().hist.find(h => h.webOrderId === 'WEB-SHIP');
    Object.assign(row, { trackingNumber: '1234567890123456', carrier: 'canadapost', shipped: true, shippedDate: '2026-10-12' });
    await app.main.saveState(BOOK);
    await feature.publishWebsiteLinkNow();
    expect(link.docs['WEB-SHIP'].app).toMatchObject({
      shipmentWaiting: true,
      shipment: { trackingNumber: '1234567890123456', carrier: 'Canada Post', labelSource: 'canadapost', shippedAt: '2026-10-12', hash: '1234567890123456|Canada Post|2026-10-12' },
    });
    const before = link.publishes.length;
    await feature.publishWebsiteLinkNow();
    // Remembered as sent: not even offered to the transaction again.
    expect(link.publishes.slice(before).every(p => !(p.shipments || []).some(s => s.orderId === 'WEB-SHIP'))).toBe(true);
  });

  it('shows the website’s answer on the order', async () => {
    push(webOrder('WEB-ANS'));
    await waitFor(() => expect(link.docs['WEB-ANS'].pending).toBe(false));
    const row = state().hist.find(h => h.webOrderId === 'WEB-ANS');
    Object.assign(row, { trackingNumber: 'TRK1', shipped: true, shippedDate: '2026-10-12' });
    await app.main.saveState(BOOK);
    await feature.publishWebsiteLinkNow();
    const hash = link.docs['WEB-ANS'].app.shipment.hash;
    expect(feature.websiteShipmentNote(row).text).toBe('Label sent to the website — waiting for its answer');

    link.docs['WEB-ANS'].shipmentReply = { hash, result: 'refused', reason: 'The order has an open return', at: '2026-10-12T10:00:00.000Z' };
    link.docs['WEB-ANS'].pending = true;
    deliver();
    await waitFor(() => expect(state().hist.find(h => h.webOrderId === 'WEB-ANS').webShipment?.result).toBe('refused'));
    const note = feature.websiteShipmentNote(state().hist.find(h => h.webOrderId === 'WEB-ANS'));
    expect(note).toMatchObject({ tone: 'critical', text: 'Website couldn’t dispatch: The order has an open return' });
    await waitFor(() => expect(link.docs['WEB-ANS'].pending).toBe(false));
  });
});

describe('the rest of the app around a website sale', () => {
  it('keeps it off the Order History edit for copies, number and void', async () => {
    push(webOrder('WEB-EDIT'));
    await waitFor(() => expect(state().hist.some(h => h.webOrderId === 'WEB-EDIT')).toBe(true));
    const idx = state().hist.findIndex(h => h.webOrderId === 'WEB-EDIT');
    app.window.openEditHist(idx);
    expect(document.getElementById('edit-qty').disabled).toBe(true);
    expect(document.getElementById('edit-chan').disabled).toBe(true);
    expect(document.getElementById('edit-num').disabled).toBe(true);
    expect(document.getElementById('edit-web-note').hidden).toBe(false);
    expect(document.getElementById('edit-void-zone').style.display).toBe('none');
    // Even if the fields were changed, saving keeps the website's copies.
    document.getElementById('edit-qty').value = '9';
    app.window.saveEntryEdit();
    expect(state().hist[idx].qty).toBe(2);
    expect(state().stock).toBe(98);
  });

  it('classifies a website Stripe payment as coming in from the website', async () => {
    const c = app.main.classifyStripePayment({ id: 'ch_new', piId: 'pi_x', amount: 92, currency: 'CAD', created: Date.now(), description: '', metadata: { order_id: 'WEB-STRIPE' } });
    expect(c).toEqual({ kind: 'website', ref: 'WEB-STRIPE' });
  });
});

describe('review fixes, through the real app', () => {
  it('never applies an order from a cached snapshot; the server’s snapshot brings it in', async () => {
    link.docs['WEB-CACHE'] = { web: webOrder('WEB-CACHE'), pending: true };
    const pending = [{ id: 'WEB-CACHE', ...JSON.parse(JSON.stringify(link.docs['WEB-CACHE'])) }];
    link.ordersCb(pending, { fromCache: true });
    await new Promise(r => setTimeout(r, 50));
    expect(state().hist).toHaveLength(0);
    link.ordersCb(pending, { fromCache: false });
    await waitFor(() => expect(state().hist).toHaveLength(1));
  });

  it('a newer copy already on the row is never undone by an older one', async () => {
    push(webOrder('WEB-OLD', { sourceUpdatedAt: '2026-10-11T15:00:00.000Z' }));
    await waitFor(() => expect(link.docs['WEB-OLD'].pending).toBe(false));
    push(webOrder('WEB-OLD', { hash: 'h2', sourceUpdatedAt: '2026-10-12T15:00:00.000Z', paymentStatus: 'refunded', refundState: 'full', books: { [BOOK]: { net: 0, sold: 2, restocked: 2, unitCAD: 40, merchCAD: 80 } } }));
    await waitFor(() => expect(state().hist.find(h => h.webOrderId === 'WEB-OLD').voided).toBe(true));
    push(webOrder('WEB-OLD', { hash: 'h1', sourceUpdatedAt: '2026-10-11T15:00:00.000Z' }));
    await new Promise(r => setTimeout(r, 80));
    expect(state().hist.find(h => h.webOrderId === 'WEB-OLD').voided).toBe(true);
    expect(state().stock).toBe(100);
  });

  it('orders waiting for a decision don’t hold back new ones', async () => {
    await app.resetBook(BOOK, { hist: [{ num: '', chan: 'In Person', qty: 2, price: 35, date: '2026-10-10', shipEmail: 'dana@example.com', sheetsId: 'look' }] });
    for (let i = 0; i < 3; i++) link.docs[`WEB-R${i}`] = { web: webOrder(`WEB-R${i}`, { paidAt: `2026-10-0${i + 1}T00:00:00Z`, paidDay: '2026-10-11' }), pending: true };
    link.docs['WEB-LATE'] = { web: webOrder('WEB-LATE', { paidAt: '2026-10-11T23:00:00Z', paidDay: '2026-10-20', customer: { name: 'Lee', email: 'lee@example.com', address: {} } }), pending: true };
    deliver();
    await waitFor(() => expect(state().hist.some(h => h.webOrderId === 'WEB-LATE')).toBe(true));
    expect(link.docs['WEB-R0'].pending).toBe(true);
  });

  it('sends a book as not trustworthy while one of its orders waits for a decision', async () => {
    await app.resetBook(BOOK, { hist: [{ num: '', chan: 'In Person', qty: 2, price: 35, date: '2026-10-10', shipEmail: 'dana@example.com', sheetsId: 'look2' }] });
    push(webOrder('WEB-HELD'));
    await waitFor(() => expect(document.getElementById('web-link-card').textContent).toMatch(/Needs you/));
    const before = link.publishes.length;
    await feature.publishWebsiteLinkNow({ books: [BOOK] });
    const args = link.publishes.slice(before).at(-1);
    expect(args.heldOrders).toContainEqual({ orderId: 'WEB-HELD', books: [BOOK] });
  });

  it('refuses to delete a website sale from the Tax Centre ledger or the Orders tab', async () => {
    push(webOrder('WEB-DEL'));
    await waitFor(() => expect(state().hist.some(h => h.webOrderId === 'WEB-DEL')).toBe(true));
    await app.main.removeLedgerEntry('sale', BOOK, '#WEB-DEL');
    expect(state().hist.some(h => h.webOrderId === 'WEB-DEL')).toBe(true);
    expect(app.toast()).toMatch(/follows your website/);
  });

  it('classifies a charge as website when its order is already in the books, even on a fresh device', async () => {
    push(webOrder('WEB-FRESH'));
    await waitFor(() => expect(state().hist.some(h => h.webOrderId === 'WEB-FRESH')).toBe(true));
    localStorage.removeItem('lm-website-link-seen');
    expect(app.main.classifyStripePayment({ id: 'ch_f', amount: 1, currency: 'CAD', created: Date.now(), description: '', metadata: { order_id: 'WEB-FRESH' } }).kind).toBe('website');
    expect(app.main.classifyStripePayment({ id: 'ch_g', amount: 1, currency: 'CAD', created: Date.now(), description: '', metadata: { order_id: 'WEB-NOPE' } }).kind).not.toBe('website');
  });

  it('says "Needs a look", not "Up to date", while orders are set aside', async () => {
    await app.resetBook(BOOK, { hist: [{ num: '', chan: 'In Person', qty: 2, price: 35, date: '2026-10-10', shipEmail: 'dana@example.com', sheetsId: 'look3' }] });
    push(webOrder('WEB-LATER'));
    const card = document.getElementById('web-link-card');
    await waitFor(() => expect(card.querySelector('[data-wl-action="later"][data-order="WEB-LATER"]')).not.toBeNull());
    card.querySelector('[data-wl-action="later"][data-order="WEB-LATER"]').click();
    expect(document.getElementById('wl-status').textContent).toMatch(/1 set aside for later/);
    expect(document.getElementById('wl-state').textContent).toMatch(/Needs a look/);
  });

  it('shows the website’s postage answer on every book of a two-book order', async () => {
    push(webOrder('WEB-2B'));
    await waitFor(() => expect(link.docs['WEB-2B'].pending).toBe(false));
    const row = state().hist.find(h => h.webOrderId === 'WEB-2B');
    const sibling = { webOrderId: 'WEB-2B', num: row.num, fulfilledOnWebsite: true, trackingNumber: 'TRK', qty: 1 };
    row.trackingNumber = 'TRK';
    row.webShipment = { hash: 'TRK||', result: 'dispatched', reason: '', at: 'x' };
    expect(feature.websiteShipmentNote(sibling).text).toBe('Website dispatched it — customer emailed');
  });
});
