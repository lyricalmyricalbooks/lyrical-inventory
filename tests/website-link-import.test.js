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
      // The server keeps the first day recorded (a transaction in firebase.js).
      _fbMarkLinkSwitchedOn: async (at) => {
        if (link.serverConsentAt) return link.serverConsentAt;
        link.consentWrites.push({ importConsentAt: at });
        link.serverConsentAt = at;
        return at;
      },
      _fbPublishWebsiteLink: fakePublish,
    },
  });
  feature = await import('../src/features/website-link.js');
}, 30000);

beforeEach(async () => {
  link.docs = {};
  link.publishes = [];
  link.consentWrites = [];
  link.serverConsentAt = '';
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
  it('brings the orders in by itself and records when the link was switched on', async () => {
    setStatus({ website: { at: new Date().toISOString() }, app: {} });
    push(webOrder('WEB-FIRST'));
    await waitFor(() => expect(state().hist).toHaveLength(1));
    expect(link.consentWrites[0].importConsentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(document.getElementById('web-link-card').querySelector('[data-wl-action="consent"]')).toBeNull();
  });

  it('keeps the day already on the server when this device’s status hasn’t caught up', async () => {
    link.serverConsentAt = '2026-01-05T00:00:00.000Z';
    setStatus({ website: { at: new Date().toISOString() }, app: {} });
    push(webOrder('WEB-CACHED'));
    await waitFor(() => expect(state().hist).toHaveLength(1));
    expect(link.consentWrites).toHaveLength(0);
    expect(link.serverConsentAt).toBe('2026-01-05T00:00:00.000Z');
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
    const { removeLedgerEntry } = await import('../src/features/tax-entries.js');
    await removeLedgerEntry('sale', BOOK, '#WEB-DEL');
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

describe('the storage check', () => {
  const doc = () => app.window.document;
  const card = () => doc().getElementById('web-link-card');
  // The old copy as _fbReadOldBookCopy returns it, with the time it was last written.
  const oldCopy = (state, ts = 1700000000000) => async (_id, { withStamp = false } = {}) => (withStamp ? { state, ts } : state);

  it('says every book is in the new storage when its old copy has nothing the new one lacks', async () => {
    await app.resetBook(BOOK, { hist: [{ uid: 'a', chan: 'Book Fair', qty: 1, price: 20, date: '2026-06-01' }] });
    app.window._fbReadOldBookCopy = oldCopy({ hist: [{ uid: 'a', chan: 'Book Fair', qty: 1, price: 20, date: '2026-06-01' }] });
    app.window._fbReadNewBookCopy = async () => ({ hist: [{ uid: 'a', chan: 'Book Fair', qty: 1, price: 20, date: '2026-06-01' }] });
    card().querySelector('[data-wl-action="storage-check"]').click();
    await waitFor(() => expect(card().textContent).toContain('Harbour Lights — 1 sale'));
    expect(card().textContent).toContain('books are in the new storage, with every record from the old one');
  });

  it('checks the server’s copy, not this device’s: a record not uploaded yet still counts as missing', async () => {
    const sale = { uid: 'a', chan: 'Book Fair', qty: 1, price: 20, date: '2026-06-01' };
    await app.resetBook(BOOK, { hist: [sale] });
    app.window._fbReadOldBookCopy = oldCopy({ hist: [sale] });
    app.window._fbReadNewBookCopy = async () => ({ hist: [] });
    card().querySelector('[data-wl-action="storage-check"]').click();
    await waitFor(() => expect(card().textContent).toContain('1 record is only in the old storage'));
  });

  it('lists records only the old copy has, and copies them over only when asked', async () => {
    await app.resetBook(BOOK, { hist: [{ uid: 'a', chan: 'Book Fair', qty: 1, price: 20, date: '2026-06-01' }] });
    const missing = { uid: 'b', chan: 'In Person', qty: 2, price: 20, date: '2026-07-01' };
    app.window._fbReadOldBookCopy = oldCopy({ hist: [missing, { uid: 'a', chan: 'Book Fair', qty: 1, price: 20, date: '2026-06-01' }] });
    // The server holds the last save made after the check started, else the book as it was.
    const before = app.cloud.lastSave(BOOK);
    app.window._fbReadNewBookCopy = async () => {
      const now = app.cloud.lastSave(BOOK);
      return now && now !== before ? now.state : { hist: [{ uid: 'a', chan: 'Book Fair', qty: 1, price: 20, date: '2026-06-01' }] };
    };
    card().querySelector('[data-wl-action="storage-check"]').click();
    await waitFor(() => expect(card().textContent).toContain('1 record is only in the old storage'));
    expect(state().hist).toHaveLength(1);

    card().querySelector('[data-wl-action="copy-old"]').click();
    await waitFor(() => expect(doc().getElementById('m-confirm-ok').textContent).toBe('Copy them over'));
    doc().getElementById('m-confirm-ok').click();
    await waitFor(() => expect(state().hist.map(h => h.uid)).toEqual(['b', 'a']));
    expect(app.cloud.lastSave(BOOK).state.hist.some(h => h.uid === 'b')).toBe(true);
    await waitFor(() => expect(card().textContent).toContain('with every record from the old one'));
  });

  it('leaves the records out when the book is right, until the old copy changes again', async () => {
    const kept = { uid: 'a', chan: 'Book Fair', qty: 1, price: 20, date: '2026-06-01' };
    const deleted = { uid: 'gone', chan: 'In Person', qty: 1, price: 20, date: '2026-05-01' };
    await app.resetBook(BOOK, { hist: [kept] });
    app.window._fbReadOldBookCopy = oldCopy({ hist: [deleted, kept] }, 111);
    app.window._fbReadNewBookCopy = async () => {
      const saved = app.cloud.lastSave(BOOK);
      return saved ? saved.state : { hist: [kept] };
    };
    card().querySelector('[data-wl-action="storage-check"]').click();
    await waitFor(() => expect(card().textContent).toContain('1 record is only in the old storage'));

    card().querySelector('[data-wl-action="leave-old"]').click();
    await waitFor(() => expect(doc().getElementById('m-confirm-ok').textContent).toBe('Leave them out'));
    doc().getElementById('m-confirm-ok').click();
    await waitFor(() => expect(card().textContent).toContain('with every record from the old one'));
    expect(state().hist.map(h => h.uid)).toEqual(['a']);
    expect(app.cloud.lastSave(BOOK).state.oldCopyReviewedTs).toBe(111);

    // Something new written to the old storage brings the warning back.
    app.window._fbReadOldBookCopy = oldCopy({ hist: [deleted, kept] }, 222);
    card().querySelector('[data-wl-action="storage-check"]').click();
    await waitFor(() => expect(card().textContent).toContain('1 record is only in the old storage'));
  });
});

describe('the website going quiet', () => {
  it('is said on the card and the To-do list, and clears when the website checks in again', async () => {
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    link.statusCb({ ...CONSENTED, website: { at: old } }, { fromCache: false });
    await waitFor(() => expect(document.getElementById('wl-status').textContent).toMatch(/website last checked in/i));
    expect(feature.websiteLinkTodo().quietSince).toBe(old);
    setStatus(CONSENTED);
    await waitFor(() => expect(feature.websiteLinkTodo().quietSince).toBe(''));
  });
});
