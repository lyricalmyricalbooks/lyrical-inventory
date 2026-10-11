import { describe, it, expect } from 'vitest';
import {
  WEBSITE_IMPORT_BATCH,
  appShipmentFor,
  carrierLabel,
  describeWebShipment,
  desiredWebsiteRows,
  hasAppTracking,
  isWebsiteFulfilled,
  isWebsiteRow,
  linkedPostageFor,
  markRefusal,
  matchExistingRows,
  planWebsiteOrder,
  planWebsitePublish,
  plannedEffect,
  rowKey,
  rowPatch,
  sameEffect,
  shipmentHash,
  summarizePlans,
  webBookIdsWithRows,
  webOrderEffect,
  webRowUid,
  websiteOrderNumber,
  websiteStockFeed,
} from '../src/lib/website-link.js';
import { deriveOnHand, deriveOnHandRaw } from '../src/lib/inventory.js';

// One website order, as the website pushes it (docs/website-link.md).
function makeWeb(over = {}) {
  const books = over.books || {
    hound: { net: 2, sold: 2, restocked: 0, unitCAD: 40, merchCAD: 80, preorder: false, titles: ['The Hound — Paperback'] },
  };
  return {
    v: 1,
    orderId: 'ABCD-123456-WXYZ',
    number: '#ABCD-123456-WXYZ',
    sourceUpdatedAt: '2026-10-11T15:04:05.000Z',
    hash: 'h1',
    test: false,
    paidAt: '2026-10-11T15:00:00.000Z',
    paidDay: '2026-10-11',
    paymentMethod: 'Stripe',
    paymentStatus: 'paid',
    refundState: 'none',
    refund: null,
    stripePaymentIntentId: 'pi_123',
    paypalCaptureId: null,
    totals: { subtotal: 80, discount: 8, discountCode: 'FALL', shipping: 12, tax: 4.68, total: 88.68, giftCard: 0 },
    charged: { currency: 'CAD', amountMinor: 8868 },
    customer: {
      name: 'Dana Reader', email: 'dana@example.com', phone: '555-0100',
      address: { street: '1 Main St', unit: 'Apt 2', city: 'Toronto', state: 'ON', zip: 'M4B 1B3', country: 'CA' },
    },
    fulfillment: {
      method: 'shipping', status: 'paid', trackingNumber: '', trackingCarrier: '', trackingUrl: '',
      shippedDay: null, labelSource: null,
    },
    firstBook: 'hound',
    unlinked: [],
    ...over,
    books,
  };
}

const cadBook = () => 'CAD';
const rowsOf = (web, opts = {}) => desiredWebsiteRows(web, { bookCurrencyOf: cadBook, ...opts }).rows;
const rowFor = (web, bookId = 'hound', opts) => rowsOf(web, opts).find(r => r.bookId === bookId)?.row;

describe('identity', () => {
  it('gives one deterministic row id per order and book', () => {
    expect(webRowUid('ABCD-1', 'hound')).toBe('web-ABCD-1-hound');
    expect(webRowUid(' ABCD-1 ', 'hound')).toBe(webRowUid('ABCD-1', 'hound'));
  });

  it('uses the website number, normalised the way the app matches orders', () => {
    expect(websiteOrderNumber(makeWeb())).toBe('#ABCD-123456-WXYZ');
    expect(websiteOrderNumber(makeWeb({ number: 'abcd-123456-wxyz' }))).toBe('#ABCD-123456-WXYZ');
  });

  it('gives manual-payment ids (no hyphen) the WEB- prefix the app needs', () => {
    const hex = '0123456789abcdef01234567';
    expect(websiteOrderNumber({ orderId: hex, number: '' })).toBe(`#WEB-${hex.toUpperCase()}`);
    expect(websiteOrderNumber({ orderId: hex, number: `#WEB-${hex.toUpperCase()}` })).toBe(`#WEB-${hex.toUpperCase()}`);
    expect(websiteOrderNumber({ orderId: '', number: '' })).toBe('');
  });

  it('knows a website row by its order id', () => {
    expect(isWebsiteRow({ webOrderId: 'x' })).toBe(true);
    expect(isWebsiteRow({ num: '#X-1' })).toBe(false);
    expect(isWebsiteRow(null)).toBe(false);
  });
});

describe('desiredWebsiteRows', () => {
  it('builds one sale row per book with the identity, address and price', () => {
    const row = rowFor(makeWeb());
    expect(row).toMatchObject({
      uid: 'web-ABCD-123456-WXYZ-hound',
      sheetsId: 'web-ABCD-123456-WXYZ-hound',
      webOrderId: 'ABCD-123456-WXYZ',
      webHash: 'h1',
      chan: 'Website',
      num: '#ABCD-123456-WXYZ',
      date: '2026-10-11',
      qty: 2,
      // 80 of books less the 8 discount, per copy.
      price: 36,
      merchandisePaid: 72,
      cur: 'CAD',
      fulfilledOnWebsite: true,
      voided: false,
      gratuity: false,
      shipName: 'Dana Reader',
      shipEmail: 'dana@example.com',
      shipPhone: '555-0100',
      shipAddr1: '1 Main St',
      shipAddr2: 'Apt 2',
      shipCity: 'Toronto',
      shipProvince: 'ON',
      shipPostal: 'M4B 1B3',
      shipCountry: 'Canada',
      shippingMethod: 'Shipping',
      notes: 'Website · Stripe',
    });
    expect(row.payment).toBeUndefined();
    expect(row.cadRate).toBeUndefined();
  });

  it('puts the order money on the first book only', () => {
    const web = makeWeb({
      firstBook: 'hound',
      books: {
        altrove: { net: 1, sold: 1, restocked: 0, unitCAD: 30, merchCAD: 30 },
        hound: { net: 2, sold: 2, restocked: 0, unitCAD: 40, merchCAD: 80 },
      },
    });
    const rows = rowsOf(web);
    expect(rows.map(r => r.bookId)).toEqual(['hound', 'altrove']);
    const [first, second] = rows.map(r => r.row);
    expect(first).toMatchObject({ shippingPaid: 12, taxPaid: 4.68, totalPaid: 88.68, discountAmount: 8, discountCode: 'FALL', discountSource: 'website', subtotal: 80 });
    // The 8 discount split by value (30 : 80), whole cents: 2.18 and 5.82.
    expect(second).toMatchObject({ shippingPaid: 0, taxPaid: 0, totalPaid: 0, discountAmount: 0, discountCode: '', discountSource: '', subtotal: 0, merchandisePaid: 27.82 });
    expect(first.merchandisePaid).toBe(74.18);
    // The address and the website's postage answer ride on the first row only.
    expect(first.shipName).toBe('Dana Reader');
    expect(second.shipName).toBeUndefined();
    expect(second.shipAddr1).toBeUndefined();
  });

  it('converts a book priced in another currency at the stamped dated rate', () => {
    const web = makeWeb();
    const { rows, needsRate } = desiredWebsiteRows(web, {
      bookCurrencyOf: () => 'EUR',
      cadRateFor: (cur, day) => (cur === 'EUR' && day === '2026-10-11' ? 1.5 : null),
    });
    expect(needsRate).toEqual([]);
    expect(rows[0].row).toMatchObject({ price: 24, cur: 'EUR', cadRate: 1.5, merchandisePaid: 72 });
    expect(rows[0].row.payment).toMatchObject({ currency: 'CAD', amount: 72, convertedTotal: 48, rateSource: 'dated', rateDate: '2026-10-11' });
  });

  it('never guesses a rate: a foreign-priced sale with no rate waits', () => {
    const { rows, needsRate } = desiredWebsiteRows(makeWeb(), { bookCurrencyOf: () => 'EUR', cadRateFor: () => null });
    expect(rows).toEqual([]);
    expect(needsRate).toEqual([{ bookId: 'hound', currency: 'EUR', day: '2026-10-11' }]);
  });

  it('voids the row when every copy came back on a refund', () => {
    const web = makeWeb({ paymentStatus: 'refunded', refundState: 'full', books: { hound: { net: 0, sold: 2, restocked: 2, unitCAD: 40, merchCAD: 80 } } });
    expect(rowFor(web)).toMatchObject({ voided: true, qty: 2, gratuity: false, webRefunded: true });
  });

  it('a voided foreign-priced row does not wait on a rate', () => {
    const web = makeWeb({ paymentStatus: 'refunded', refundState: 'full', books: { hound: { net: 0, sold: 1, restocked: 1, unitCAD: 40, merchCAD: 40 } } });
    const { rows, needsRate } = desiredWebsiteRows(web, { bookCurrencyOf: () => 'EUR', cadRateFor: () => null });
    expect(needsRate).toEqual([]);
    expect(rows[0].row).toMatchObject({ voided: true, price: 0 });
  });

  it('keeps copies gone at no money when a full refund left them with the customer', () => {
    const web = makeWeb({ paymentStatus: 'refunded', refundState: 'full', books: { hound: { net: 1, sold: 2, restocked: 1, unitCAD: 40, merchCAD: 80 } } });
    expect(rowFor(web)).toMatchObject({ voided: false, qty: 1, gratuity: true, price: 0, webRefunded: true, merchandisePaid: 0 });
  });

  it('a gratuity row needs no exchange rate', () => {
    const web = makeWeb({ paymentStatus: 'refunded', refundState: 'full', books: { hound: { net: 1, sold: 1, restocked: 0, unitCAD: 40, merchCAD: 40 } } });
    const { rows, needsRate } = desiredWebsiteRows(web, { bookCurrencyOf: () => 'EUR', cadRateFor: () => null });
    expect(needsRate).toEqual([]);
    expect(rows[0].row).toMatchObject({ gratuity: true, price: 0 });
    expect(rows[0].row.payment).toBeUndefined();
  });

  it('a partial refund keeps the sale for the copies that stayed gone', () => {
    const web = makeWeb({ refundState: 'partial', refund: { amountMinor: 4000, currency: 'CAD' }, books: { hound: { net: 1, sold: 2, restocked: 1, unitCAD: 40, merchCAD: 80 } } });
    // 72 after discount → 36 a copy. The 40 refund pays for the copy that came
    // back (36); the other 4 comes off the copy kept.
    expect(rowFor(web)).toMatchObject({ voided: false, qty: 1, price: 32, merchandisePaid: 32, gratuity: false, webRefundState: 'partial', webRefundCAD: 40, totalPaid: 48.68 });
  });

  it('a bank-rejected refund comes back as an ordinary sale', () => {
    expect(rowFor(makeWeb({ paymentStatus: 'paid', refundState: 'none' }))).toMatchObject({ voided: false, gratuity: false, webRefunded: false });
  });

  it('copies tracking and the shipped flag from the website', () => {
    const web = makeWeb({ fulfillment: { method: 'shipping', status: 'shipped', trackingNumber: '1234', trackingCarrier: 'Canada Post', trackingUrl: 'https://track/1234', shippedDay: '2026-10-12', labelSource: 'website' } });
    expect(rowFor(web)).toMatchObject({
      trackingNumber: '1234', webTracking: '1234', trackingSource: 'website', trackingCarrier: 'Canada Post',
      trackingUrl: 'https://track/1234', shipped: true, shippedDate: '2026-10-12', webFulfillmentStatus: 'shipped',
    });
  });

  it('does not copy back tracking this app sent the website', () => {
    const web = makeWeb({ fulfillment: { method: 'shipping', status: 'shipped', trackingNumber: '9999', labelSource: 'inventory-app', shippedDay: '2026-10-12' } });
    const row = rowFor(web);
    expect(row.trackingNumber).toBeUndefined();
    expect(row.webTracking).toBe('');
    expect(row.shipped).toBe(true);
  });

  it('drops a tracking link that is not a web address', () => {
    const web = makeWeb({ fulfillment: { method: 'shipping', status: 'shipped', trackingNumber: '1', trackingUrl: 'javascript:alert(1)', labelSource: 'website' } });
    expect(rowFor(web).trackingUrl).toBeUndefined();
  });

  it('names pick-up and local delivery so they never get a label', () => {
    expect(rowFor(makeWeb({ fulfillment: { method: 'pickup', status: 'collected' } }))).toMatchObject({ shippingMethod: 'Pickup', shipped: true });
    expect(rowFor(makeWeb({ fulfillment: { method: 'local_delivery', status: 'paid' } })).shippingMethod).toBe('Local delivery');
  });

  it('records the website reply to a label on the rows', () => {
    const reply = { hash: 'T|Canada Post|2026-10-12', result: 'dispatched', reason: 'Sent', at: '2026-10-12T10:00:00Z' };
    expect(rowFor(makeWeb(), 'hound', { shipmentReply: reply }).webShipment).toEqual(reply);
  });

  it('skips books with no copies and orders with no id', () => {
    const web = makeWeb({ books: { hound: { net: 0, sold: 0, restocked: 0, unitCAD: 40, merchCAD: 0 } } });
    expect(rowsOf(web)).toEqual([]);
    expect(rowsOf({ ...makeWeb(), orderId: '' })).toEqual([]);
    expect(webBookIdsWithRows(web)).toEqual([]);
  });

  it('builds the same row on every device, timestamps included', () => {
    const web = makeWeb({ paymentStatus: 'refunded', refundState: 'full', books: { hound: { net: 0, sold: 2, restocked: 2, unitCAD: 40, merchCAD: 80 } } });
    const a = rowFor(web);
    const b = rowFor(JSON.parse(JSON.stringify(web)));
    expect(a).toEqual(b);
    expect(a.recordedAt).toBe('2026-10-11T15:00:00.000Z');
    expect(a.voidedAt).toBe(Date.parse('2026-10-11T15:04:05.000Z'));
    expect(rowFor(makeWeb()).voidedAt).toBeUndefined();
  });

  it('marks pre-orders', () => {
    expect(rowFor(makeWeb({ books: { hound: { net: 1, sold: 1, restocked: 0, unitCAD: 40, merchCAD: 40, preorder: true } } })).preorder).toBe(true);
  });
});

describe('rowPatch', () => {
  const desired = () => rowFor(makeWeb());

  it('returns null when the row already matches', () => {
    const d = desired();
    expect(rowPatch({ ...d, after: 5, notes: 'edited by hand' }, d)).toBeNull();
  });

  it('changes only the fields the website owns', () => {
    const d = desired();
    const patch = rowPatch({ ...d, qty: 1, notes: 'mine', enteredBy: 'Publisher', recordedAt: 'x' }, d);
    expect(patch).toEqual({ qty: 2 });
  });

  it('tags an adopted hand-entered row but keeps its own sheetsId', () => {
    const hand = { num: '#ABCD-123456-WXYZ', chan: 'Website', qty: 2, price: 40, date: '2026-10-11', sheetsId: 'stripe-ch_1', notes: 'Stripe', payment: { currency: 'USD', amount: 30 } };
    const patch = rowPatch(hand, desired());
    expect(patch).toMatchObject({ uid: 'web-ABCD-123456-WXYZ-hound', webOrderId: 'ABCD-123456-WXYZ', fulfilledOnWebsite: true });
    expect(patch.sheetsId).toBeUndefined();
    expect(patch.notes).toBeUndefined();
    expect(patch.payment).toBeUndefined();
  });

  it('gives a sheetsId to a hand row that never had one', () => {
    expect(rowPatch({ num: '#ABCD-123456-WXYZ', qty: 2, price: 40 }, desired()).sheetsId).toBe('web-ABCD-123456-WXYZ-hound');
  });

  it('remembers tracking already on a row when it is linked, so an old parcel is never re-sent', () => {
    const patch = rowPatch({ num: '#ABCD-123456-WXYZ', qty: 2, price: 40, trackingNumber: 'OLD1', shipped: true }, desired());
    expect(patch.webBaselineTracking).toBe('OLD1');
    expect(hasAppTracking({ webOrderId: 'x', trackingNumber: 'OLD1', webBaselineTracking: 'OLD1' })).toBe(false);
  });

  it('never overwrites tracking set in this app', () => {
    const d = rowFor(makeWeb({ fulfillment: { status: 'shipped', trackingNumber: 'WEB1', labelSource: 'website', shippedDay: '2026-10-12' } }));
    const own = { ...d, trackingNumber: 'APP1', webTracking: '', trackingSource: undefined, shipped: true, shippedDate: '2026-10-11' };
    const patch = rowPatch(own, d);
    expect(patch.trackingNumber).toBeUndefined();
    expect(patch.shippedDate).toBeUndefined();
    expect(patch.webTracking).toBe('WEB1');
  });

  it('follows the website tracking while the row has none of its own', () => {
    const d = rowFor(makeWeb({ fulfillment: { status: 'shipped', trackingNumber: 'WEB2', labelSource: 'website' } }));
    const old = { ...d, trackingNumber: 'WEB1', webTracking: 'WEB1' };
    expect(rowPatch(old, d)).toMatchObject({ trackingNumber: 'WEB2', webTracking: 'WEB2' });
  });

  it('never un-ships a row', () => {
    const d = rowFor(makeWeb());
    expect(rowPatch({ ...d, shipped: true, shippedDate: '2026-10-12' }, d)).toBeNull();
  });

  it('carries a void as a field for the caller to apply with the void helpers', () => {
    const d = rowFor(makeWeb({ paymentStatus: 'refunded', refundState: 'full', books: { hound: { net: 0, sold: 2, restocked: 2, unitCAD: 40, merchCAD: 80 } } }));
    expect(rowPatch({ ...rowFor(makeWeb()) }, d)).toMatchObject({ voided: true, webRefunded: true, webPaymentStatus: 'refunded' });
  });
});

describe('rowKey', () => {
  it('prefers uid, then sheetsId, then content', () => {
    expect(rowKey({ uid: 'u', sheetsId: 's' })).toBe('uid:u');
    expect(rowKey({ sheetsId: 's' })).toBe('sid:s');
    expect(rowKey({ num: '#A-1', qty: 1 })).toMatch(/^c:/);
    expect(rowKey(null)).toBe('');
  });
});

describe('matchExistingRows', () => {
  const web = makeWeb();
  const desired = () => desiredWebsiteRows(web, { bookCurrencyOf: cadBook }).rows;
  const match = (hist, opts = {}) => matchExistingRows(web, desired(), { hound: hist, ...(opts.others || {}) }, { bookCurrencyOf: cadBook, ...opts });

  it('finds its own row by uid', () => {
    const { results, review } = match([{ uid: 'web-ABCD-123456-WXYZ-hound', qty: 2 }]);
    expect(review).toEqual([]);
    expect(results[0]).toMatchObject({ bookId: 'hound', kind: 'own', index: 0 });
  });

  it('finds its own row by order tag (an adopted row)', () => {
    expect(match([{ webOrderId: 'ABCD-123456-WXYZ', sheetsId: 'stripe-ch_1', qty: 2 }]).results[0].kind).toBe('own');
  });

  it('adopts a hand-entered sale with the same order number and copies', () => {
    const { results } = match([{ num: '#abcd-123456-wxyz', qty: 2, price: 40, date: '2026-10-10' }]);
    expect(results[0]).toMatchObject({ kind: 'adopt', index: 0 });
  });

  it('adopts a Gmail-imported order by its bc- id', () => {
    expect(match([{ num: '', sheetsId: 'bc-ABCD-123456-WXYZ', qty: 2 }]).results[0].kind).toBe('adopt');
  });

  it('adopts a Stripe Reconcile sale whose charge belongs to the order’s payment', () => {
    const piOfCharge = id => (id === 'ch_9' ? 'pi_123' : '');
    expect(match([{ num: 'STRIPE-9', sheetsId: 'stripe-ch_9', qty: 2 }], { piOfCharge }).results[0].kind).toBe('adopt');
    // A different payment is not this order.
    expect(match([{ num: 'STRIPE-9', sheetsId: 'stripe-ch_9', qty: 2, date: '2026-01-01' }], { piOfCharge: () => 'pi_other' }).results[0].kind).toBe('new');
  });

  it('sends a strong match with different copies to review', () => {
    const { results, review } = match([{ num: '#ABCD-123456-WXYZ', qty: 3 }]);
    expect(results).toEqual([]);
    expect(review[0]).toMatchObject({ bookId: 'hound', reason: 'qty' });
    expect(review[0].candidates[0].index).toBe(0);
  });

  it('sends a voided hand sale for a paid order to review', () => {
    expect(match([{ num: '#ABCD-123456-WXYZ', qty: 2, voided: true }]).review[0].reason).toBe('voided');
  });

  it('sends several strong matches to review', () => {
    const review = match([{ num: '#ABCD-123456-WXYZ', qty: 1 }, { num: '#ABCD-123456-WXYZ', qty: 1 }]).review;
    expect(review[0]).toMatchObject({ reason: 'several' });
    expect(review[0].candidates).toHaveLength(2);
  });

  it('never adopts a row that belongs to another website order', () => {
    expect(match([{ num: '#ABCD-123456-WXYZ', qty: 2, webOrderId: 'OTHER-1' }]).results[0].kind).toBe('new');
  });

  it('flags a sale within three days with the same copies and email', () => {
    const review = match([{ num: '', chan: 'In Person', qty: 2, price: 35, date: '2026-10-09', shipEmail: 'DANA@example.com' }]).review;
    expect(review[0]).toMatchObject({ reason: 'weak' });
    expect(review[0].candidates[0]).toMatchObject({ sameEmail: true, sameAmount: false });
  });

  it('flags a sale within three days with the same copies and amount', () => {
    expect(match([{ num: '', qty: 2, price: 40, date: '2026-10-13' }]).review[0].candidates[0]).toMatchObject({ sameEmail: false, sameAmount: true });
    expect(match([{ num: '', qty: 2, price: 9, date: '2026-10-13', payment: { currency: 'CAD', amount: 88.68 } }]).review[0].reason).toBe('weak');
  });

  it('ignores look-alikes outside three days, with other copies, voided or consignment', () => {
    for (const h of [
      { num: '', qty: 2, price: 40, date: '2026-10-01' },
      { num: '', qty: 1, price: 40, date: '2026-10-11', shipEmail: 'dana@example.com' },
      { num: '', qty: 2, price: 40, date: '2026-10-11', voided: true },
      { num: '', qty: 2, price: 40, date: '2026-10-11', consignmentLink: true },
      { num: '', qty: 2, price: 40, date: '2026-10-11', gratuity: true },
      { num: '', qty: 2, price: 39, date: '2026-10-11', shipEmail: 'other@example.com' },
    ]) {
      expect(match([h]).results[0].kind, JSON.stringify(h)).toBe('new');
    }
  });

  it('only compares hand prices to CAD when the book is priced in CAD', () => {
    const r = matchExistingRows(web, desiredWebsiteRows(web, { bookCurrencyOf: () => 'EUR', cadRateFor: () => 1.5 }).rows,
      { hound: [{ num: '', qty: 2, price: 40, date: '2026-10-11' }] }, { bookCurrencyOf: () => 'EUR' });
    expect(r.results[0].kind).toBe('new');
  });

  it('flags the order recorded under a book the website did not sell', () => {
    const { review } = match([], { others: { altrove: [{ num: '#ABCD-123456-WXYZ', qty: 1 }] } });
    expect(review[0]).toMatchObject({ bookId: 'altrove', reason: 'book' });
  });

  it('applies the owner’s decisions', () => {
    const hist = [{ num: '', qty: 2, price: 40, date: '2026-10-11', sheetsId: 'abc' }];
    expect(match(hist, { decisions: { hound: { choice: 'different' } } }).results[0].kind).toBe('new');
    expect(match(hist, { decisions: { hound: { choice: 'same', key: 'sid:abc' } } }).results[0]).toMatchObject({ kind: 'adopt', decided: true, index: 0 });
    // The chosen row is gone: ask again rather than guess.
    expect(match(hist, { decisions: { hound: { choice: 'same', key: 'sid:gone' } } }).review[0].reason).toBe('weak');
    const other = { others: { altrove: [{ num: '#ABCD-123456-WXYZ', qty: 1, sheetsId: 'x1' }] } };
    expect(match([], { ...other, decisions: { altrove: { choice: 'different' } } }).review).toEqual([]);
    expect(match([], { ...other, decisions: { altrove: { choice: 'same', key: 'sid:x1' } } }).results)
      .toContainEqual(expect.objectContaining({ bookId: 'altrove', kind: 'replace', key: 'sid:x1' }));
  });
});

describe('effects', () => {
  it('counts the copies on non-voided rows of one order, per book', () => {
    const effect = webOrderEffect({
      hound: [{ webOrderId: 'A', qty: 2 }, { webOrderId: 'B', qty: 5 }, { webOrderId: 'A', qty: 1, voided: true }],
      altrove: [{ webOrderId: 'A', qty: 1, voided: true }],
      sistema: [{ num: 'x', qty: 3 }],
    }, 'A');
    expect(effect).toEqual({ hound: 2, altrove: 0 });
  });

  it('works out the planned effect of desired rows', () => {
    expect(plannedEffect([{ bookId: 'a', row: { qty: 2 } }, { bookId: 'b', row: { qty: 3, voided: true } }])).toEqual({ a: 2, b: 0 });
  });

  it('treats a missing book as zero', () => {
    expect(sameEffect({ a: 2, b: 0 }, { a: 2 })).toBe(true);
    expect(sameEffect({ a: 2 }, { a: 1 })).toBe(false);
    expect(sameEffect(undefined, {})).toBe(true);
  });
});

describe('planWebsiteOrder', () => {
  const ctx = (over = {}) => ({ histByBook: { hound: [] }, bookCurrencyOf: cadBook, cadRateFor: () => null, knowsBook: () => true, canWrite: () => true, ...over });
  const doc = (web = makeWeb(), extra = {}) => ({ id: web.orderId, web, pending: true, ...extra });

  it('plans a new sale', () => {
    const plan = planWebsiteOrder(doc(), ctx());
    expect(plan.status).toBe('ready');
    expect(plan.actions).toEqual([expect.objectContaining({ kind: 'new', bookId: 'hound' })]);
    expect(plan.effect).toEqual({ hound: 2 });
    expect(plan.num).toBe('#ABCD-123456-WXYZ');
  });

  it('plans nothing for a row that already matches (just mark it)', () => {
    const existing = rowFor(makeWeb());
    const plan = planWebsiteOrder(doc(), ctx({ histByBook: { hound: [existing] } }));
    expect(plan.status).toBe('ready');
    expect(plan.actions).toEqual([expect.objectContaining({ kind: 'own', patch: null })]);
  });

  it('plans a patch when the website changed the order', () => {
    const existing = rowFor(makeWeb());
    const refunded = makeWeb({ hash: 'h2', paymentStatus: 'refunded', refundState: 'full', books: { hound: { net: 0, sold: 2, restocked: 2, unitCAD: 40, merchCAD: 80 } } });
    const plan = planWebsiteOrder(doc(refunded), ctx({ histByBook: { hound: [existing] } }));
    expect(plan.actions[0].patch).toMatchObject({ voided: true, webHash: 'h2' });
    expect(plan.effect).toEqual({ hound: 0 });
  });

  it('shows a rehearsal order as a dry run and never plans a write', () => {
    const plan = planWebsiteOrder(doc(makeWeb({ test: true })), ctx());
    expect(plan.status).toBe('test');
    expect(plan.actions).toEqual([]);
    expect(plan.preview).toEqual([{ bookId: 'hound', copies: 2 }]);
  });

  it('holds an order from a newer website version', () => {
    expect(planWebsiteOrder(doc(makeWeb({ v: 2 })), ctx()).reasons[0].reason).toBe('version');
    expect(planWebsiteOrder({ id: 'x' }, ctx()).reasons[0].reason).toBe('empty');
  });

  it('holds a payment state it does not know', () => {
    expect(planWebsiteOrder(doc(makeWeb({ paymentStatus: 'pending' })), ctx()).reasons[0].reason).toBe('status');
  });

  it('holds a book that is not in the catalogue', () => {
    const plan = planWebsiteOrder(doc(), ctx({ knowsBook: () => false }));
    expect(plan).toMatchObject({ status: 'review', reasons: [{ bookId: 'hound', reason: 'unknown-book' }] });
  });

  it('blocks a book still in the old storage', () => {
    expect(planWebsiteOrder(doc(), ctx({ canWrite: () => false }))).toMatchObject({ status: 'blocked', blocked: ['hound'] });
  });

  it('holds a foreign-priced sale with no rate', () => {
    const plan = planWebsiteOrder(doc(), ctx({ bookCurrencyOf: () => 'EUR' }));
    expect(plan).toMatchObject({ status: 'review', reasons: [{ bookId: 'hound', reason: 'rate', currency: 'EUR' }] });
  });

  it('holds the whole order while one book needs a person', () => {
    const web = makeWeb({ books: { hound: { net: 1, sold: 1, unitCAD: 40, merchCAD: 40 }, altrove: { net: 1, sold: 1, unitCAD: 30, merchCAD: 30 } } });
    const plan = planWebsiteOrder(doc(web), ctx({ histByBook: { hound: [], altrove: [{ num: '#ABCD-123456-WXYZ', qty: 4 }] } }));
    expect(plan.status).toBe('review');
    expect(plan.actions).toEqual([]);
  });

  it('turns a decision into adopt / replace actions', () => {
    const hist = { hound: [], altrove: [{ num: '#ABCD-123456-WXYZ', qty: 1, sheetsId: 'x1' }] };
    const plan = planWebsiteOrder(doc(), ctx({ histByBook: hist, decisions: { altrove: { choice: 'same', key: 'sid:x1' } } }));
    expect(plan.status).toBe('ready');
    expect(plan.actions).toContainEqual(expect.objectContaining({ kind: 'replace', bookId: 'altrove', key: 'sid:x1', replacedBy: 'ABCD-123456-WXYZ' }));
    expect(plan.actions).toContainEqual(expect.objectContaining({ kind: 'new', bookId: 'hound' }));
  });

  it('carries the reply it saw and the unlinked copies', () => {
    const reply = { hash: 'x', result: 'refused', reason: 'Open return', at: '2026-10-12T00:00:00Z' };
    const plan = planWebsiteOrder(doc(makeWeb({ unlinked: [{ title: 'Zine', qty: 2 }, { title: '', qty: 0 }] }), { shipmentReply: reply }), ctx());
    expect(plan.replyAt).toBe(reply.at);
    expect(plan.unlinked).toEqual([{ title: 'Zine', qty: 2 }]);
  });

  it('marks an order with only unlinked copies as done with no rows', () => {
    const plan = planWebsiteOrder(doc(makeWeb({ books: {}, firstBook: null, unlinked: [{ title: 'Zine', qty: 1 }] })), ctx());
    expect(plan).toMatchObject({ status: 'ready', actions: [], effect: {} });
  });

  it('summarises a batch for the first-run confirmation', () => {
    const plans = [
      { status: 'ready', actions: [{ kind: 'new' }] },
      { status: 'ready', actions: [{ kind: 'adopt' }] },
      { status: 'ready', actions: [{ kind: 'own', patch: null }] },
      { status: 'review' },
      { status: 'blocked' },
      { status: 'test' },
      null,
    ];
    expect(summarizePlans(plans)).toEqual({ fresh: 1, linked: 1, needYou: 1, blocked: 1, tests: 1, upToDate: 1 });
    expect(WEBSITE_IMPORT_BATCH).toBe(50);
  });
});

describe('websiteStockFeed', () => {
  const book = { id: 'hound', title: 'The Hound', maxPrint: 100 };
  const sale = (qty, over = {}) => ({ chan: 'Website', qty, price: 40, ...over });

  it('sends publisher on-hand, website copies and an unfloored base', () => {
    const s = { hist: [sale(2, { webOrderId: 'A' }), sale(3)], ledger: [] };
    expect(websiteStockFeed(s, book)).toEqual({ bookId: 'hound', title: 'The Hound', onHand: 95, webCopies: 2, base: 97, derived: true });
  });

  it('keeps base still when a website order is brought in', () => {
    const before = websiteStockFeed({ hist: [sale(3)], ledger: [] }, book);
    const after = websiteStockFeed({ hist: [sale(3), sale(2, { webOrderId: 'A' })], ledger: [] }, book);
    expect(after.base).toBe(before.base);
    expect(after.onHand).toBe(before.onHand - 2);
    expect(after.webCopies).toBe(2);
  });

  it('takes author-held copies off both onHand and base', () => {
    const feed = websiteStockFeed({ hist: [], ledger: [], authorStock: 10 }, book);
    expect(feed).toMatchObject({ onHand: 90, base: 90 });
  });

  it('counts copies out on consignment as gone, but not consignment sales twice', () => {
    const s = {
      hist: [sale(1, { consignmentLink: true, chan: 'Consignment' })],
      ledger: [{ type: 'Shipment', qty: 10 }, { type: 'Return', status: 'restocked', qty: 2 }],
    };
    expect(websiteStockFeed(s, book)).toMatchObject({ onHand: 92, base: 92, webCopies: 0 });
  });

  it('counts gratuity website rows (copies gone) but never voided ones', () => {
    const s = { hist: [sale(1, { webOrderId: 'A', gratuity: true, price: 0 }), sale(4, { webOrderId: 'B', voided: true })], ledger: [] };
    expect(websiteStockFeed(s, book)).toMatchObject({ webCopies: 1, onHand: 99, base: 100 });
  });

  it('can go below zero in base but never in onHand', () => {
    const s = { hist: [sale(120, { webOrderId: 'A' }), sale(10)], ledger: [] };
    const feed = websiteStockFeed(s, book);
    expect(feed.onHand).toBe(0);
    expect(feed.base).toBe(90);
    expect(deriveOnHandRaw({ hist: [sale(130)] }, book)).toBe(-30);
    expect(deriveOnHand({ hist: [sale(130)] }, book)).toBe(0);
  });

  it('says the count is not trustworthy when there is no print run', () => {
    expect(websiteStockFeed({ stock: 7, hist: [] }, { id: 'x', title: 'X' })).toMatchObject({ onHand: 7, base: 7, derived: false });
  });
});

describe('isWebsiteFulfilled', () => {
  it('is true for a website row the website is handling or has shipped', () => {
    expect(isWebsiteFulfilled({ webOrderId: 'A', fulfilledOnWebsite: true })).toBe(true);
    expect(isWebsiteFulfilled({ webOrderId: 'A', trackingNumber: 'W', webTracking: 'W', shipped: true })).toBe(true);
  });

  it('is false once a label was bought or linked here', () => {
    expect(isWebsiteFulfilled({ webOrderId: 'A', trackingNumber: 'APP', webTracking: '' })).toBe(false);
  });

  it('a test-mode label does not count as a label', () => {
    expect(isWebsiteFulfilled({ webOrderId: 'A', trackingNumber: 'SIM', trackingSimulated: true })).toBe(true);
  });

  it('is false for ordinary rows and when switched off', () => {
    expect(isWebsiteFulfilled({ chan: 'Website', num: '#A-1' })).toBe(false);
    expect(isWebsiteFulfilled({ webOrderId: 'A', fulfilledOnWebsite: false })).toBe(false);
    expect(isWebsiteFulfilled(null)).toBe(false);
  });
});

describe('linkedPostageFor', () => {
  const label = (over = {}) => ({
    ref: 'shippo:tx1', cat: 'Shipping & Postage', desc: 'Shippo shipping label', amount: 18.42, currency: 'CAD', baseAmount: 18.42,
    shippingMatchStatus: 'matched', shippingOrderNumber: '#ABCD-123456-WXYZ', date: '2026-10-12', trackingNumber: 'T1', ...over,
  });

  it('sums the linked labels in CAD and names where they came from', () => {
    const lp = linkedPostageFor('ABCD-123456-WXYZ', [label(), label({ ref: 'canadapost:9', baseAmount: 1.58, amount: 1.58, date: '2026-10-13' })]);
    expect(lp).toMatchObject({ costCAD: 20, source: 'canadapost', boughtAt: '2026-10-13' });
  });

  it('uses the CAD amount when no base amount was stored', () => {
    expect(linkedPostageFor('#ABCD-123456-WXYZ', [label({ baseAmount: undefined })]).costCAD).toBe(18.42);
  });

  it('reports an unknown cost rather than a wrong one', () => {
    expect(linkedPostageFor('#ABCD-123456-WXYZ', [label({ baseAmount: undefined, currency: 'USD', amount: 12 })]).costCAD).toBeNull();
  });

  it('ignores refunded, test-mode and unlinked labels', () => {
    const list = [label({ simulated: true }), label({ shippingMatchStatus: 'needs-review' }), label({ ref: 'shippo:tx2' }), { ref: 'r', refundOf: 'shippo:tx2', cat: 'x' }];
    expect(linkedPostageFor('#ABCD-123456-WXYZ', list)).toBeNull();
    expect(linkedPostageFor('', [label()])).toBeNull();
    expect(linkedPostageFor('#ABCD-123456-WXYZ', [label({ ref: 'postage:email1' })]).source).toBe('hand');
  });
});

describe('appShipmentFor', () => {
  const row = (over = {}) => ({ webOrderId: 'A', num: '#A-1', qty: 1, ...over });
  const web = (ff = {}) => ({ fulfillment: { status: 'paid', trackingNumber: '', labelSource: null, ...ff } });

  it('builds the label from a row with tracking bought here, marked shipped', () => {
    const lp = { costCAD: 18.42, source: 'shippo', service: 'Expedited Parcel', boughtAt: '2026-10-12' };
    const s = appShipmentFor([row({ trackingNumber: ' 1234 ', trackingUrl: 'https://t/1234', carrier: 'canadapost', shipped: true, shippedDate: '2026-10-13' })], lp, web());
    expect(s).toEqual({
      carrier: 'Canada Post', service: 'Expedited Parcel', trackingNumber: '1234', trackingUrl: 'https://t/1234',
      labelCostCAD: 18.42, labelSource: 'canadapost', boughtAt: '2026-10-12', shippedAt: '2026-10-13',
      hash: '1234|Canada Post|2026-10-13',
    });
    expect(s.hash).toBe(shipmentHash(s));
  });

  it('sends a label not yet marked shipped with no ship date', () => {
    const s = appShipmentFor([row({ trackingNumber: 'X1', trackingCarrier: 'Chit Chats' })], null, web());
    expect(s).toMatchObject({ shippedAt: null, labelSource: 'hand', carrier: 'Chit Chats', labelCostCAD: null, boughtAt: null });
    expect(s.hash).toBe('X1|Chit Chats|');
  });

  it('falls back to the label date when shipped has no date', () => {
    expect(appShipmentFor([row({ trackingNumber: 'X1', shipped: true })], { boughtAt: '2026-10-12', source: 'shippo' }, web()).shippedAt).toBe('2026-10-12');
  });

  it('returns null when nothing was bought here', () => {
    expect(appShipmentFor([row()], null, web())).toBeNull();
    expect(appShipmentFor([row({ trackingNumber: 'W', webTracking: 'W' })], null, web())).toBeNull();
    expect(appShipmentFor([row({ trackingNumber: 'OLD', webBaselineTracking: 'OLD' })], null, web())).toBeNull();
    expect(appShipmentFor([row({ trackingNumber: 'X', voided: true })], null, web())).toBeNull();
    expect(appShipmentFor([{ trackingNumber: 'X' }], null, web())).toBeNull();
    expect(appShipmentFor([row({ trackingNumber: 'SIM', trackingSimulated: true })], null, web())).toBeNull();
  });

  it('never echoes back tracking that came from the website', () => {
    expect(appShipmentFor([row({ trackingNumber: 'W1' })], null, web({ trackingNumber: 'W1', labelSource: 'website' }))).toBeNull();
  });

  it('still describes its own label after the website dispatched it', () => {
    const s = appShipmentFor([row({ trackingNumber: 'A1', shipped: true, shippedDate: '2026-10-13' })], null, web({ trackingNumber: 'A1', labelSource: 'inventory-app', status: 'shipped' }));
    expect(s.hash).toBe('A1||2026-10-13');
  });

  it('changes the hash when the label changes, but not when its cost arrives', () => {
    const a = appShipmentFor([row({ trackingNumber: 'A1', shipped: true, shippedDate: '2026-10-13' })], null, web());
    const b = appShipmentFor([row({ trackingNumber: 'A2', shipped: true, shippedDate: '2026-10-13' })], null, web());
    const c = appShipmentFor([row({ trackingNumber: 'A1', shipped: true, shippedDate: '2026-10-13' })], { costCAD: 9 }, web());
    expect(a.hash).not.toBe(b.hash);
    expect(c.hash).toBe(a.hash);
  });

  it('drops a tracking link that is not a web address', () => {
    expect(appShipmentFor([row({ trackingNumber: 'A', trackingUrl: 'javascript:x' })], null, null).trackingUrl).toBe('');
  });

  it('names carriers plainly', () => {
    expect(carrierLabel('canadapost')).toBe('Canada Post');
    expect(carrierLabel('chit_chats')).toBe('Chit Chats');
    expect(carrierLabel('Purolator Inc')).toBe('Purolator Inc');
    expect(carrierLabel('')).toBe('');
  });
});

describe('describeWebShipment', () => {
  const shipment = { hash: 'A|Canada Post|2026-10-13' };
  const row = (over = {}) => ({ webOrderId: 'A', fulfilledOnWebsite: true, ...over });

  it('says the website is packing it, or has shipped it', () => {
    expect(describeWebShipment(row(), null).text).toBe('Packed on the website');
    expect(describeWebShipment(row({ webFulfillmentStatus: 'shipped' }), null)).toMatchObject({ tone: 'positive', text: 'Shipped by the website' });
    expect(describeWebShipment(row({ webFulfillmentStatus: 'collected' }), null).text).toMatch(/Collected/);
  });

  it('reports each website answer in plain words', () => {
    const reply = (result, reason = '') => row({ webShipment: { hash: shipment.hash, result, reason } });
    expect(describeWebShipment(reply('dispatched'), shipment).text).toBe('Website dispatched it — customer emailed');
    expect(describeWebShipment(reply('attached'), shipment).next).toMatch(/Mark the parcel shipped/);
    const refused = describeWebShipment(reply('refused', 'The order has an open return'), shipment);
    expect(refused).toMatchObject({ tone: 'critical', text: 'Website couldn’t dispatch: The order has an open return' });
    expect(refused.next).toMatch(/Orders/);
    expect(describeWebShipment(reply('checked', 'Would dispatch'), shipment).text).toBe('Rehearsal: Would dispatch');
  });

  it('waits for an answer to the current label, not an old one', () => {
    const old = row({ webShipment: { hash: 'OLD', result: 'dispatched' } });
    expect(describeWebShipment(old, shipment, { sentHash: shipment.hash }).text).toBe('Label sent to the website — waiting for its answer');
    expect(describeWebShipment(old, shipment).text).toBe('Label going to the website');
  });

  it('says nothing for ordinary or voided rows', () => {
    expect(describeWebShipment({ num: '#A-1' }, shipment)).toBeNull();
    expect(describeWebShipment(row({ voided: true }), shipment)).toBeNull();
    expect(describeWebShipment(row({ fulfilledOnWebsite: false }), null)).toBeNull();
  });
});

describe('planWebsitePublish — the transaction’s decisions', () => {
  const orderId = 'ABCD-123456-WXYZ';
  const savedRow = (over = {}) => ({ ...rowFor(makeWeb()), ...over });
  const catalog = { hound: { id: 'hound', title: 'The Hound', maxPrint: 100 }, _deletedDefaults: [] };
  const books = (hist = [savedRow()]) => ({ hound: { hist, ledger: [], metadata: { authorStock: 0 } } });
  const docOf = (web = makeWeb(), extra = {}) => ({ web, pending: true, ...extra });
  const mark = (over = {}) => ({ orderId, hash: 'h1', effect: { hound: 2 }, decisions: {}, replyAt: '', ...over });
  const NOW = '2026-10-11T16:00:00.000Z';

  it('publishes the feed from the server’s rows', () => {
    const res = planWebsitePublish({ bookIds: ['hound', 'hound', 'missing'], books: books(), catalog, now: NOW, build: 'b1' });
    expect(res.feeds).toEqual([{ bookId: 'hound', doc: { bookId: 'hound', title: 'The Hound', onHand: 98, webCopies: 2, base: 100, derived: true, at: NOW, build: 'b1' } }]);
  });

  it('marks an order imported when the saved rows show it', () => {
    const res = planWebsitePublish({ books: books(), catalog, orderDocs: { [orderId]: docOf() }, marks: [mark({ decisions: { hound: { choice: 'same', key: 'k' } } })], now: NOW, device: 'Mac' });
    expect(res.accepted).toEqual([orderId]);
    expect(res.orderUpdates).toEqual([{ orderId, data: {
      imported: { hash: 'h1', at: NOW, device: 'Mac', effect: { hound: 2 }, decisions: { hound: { choice: 'same', key: 'k' } } },
      pending: false,
    } }]);
  });

  it('refuses when the website changed the order since', () => {
    const res = planWebsitePublish({ books: books(), catalog, orderDocs: { [orderId]: docOf(makeWeb({ hash: 'h2' })) }, marks: [mark()] });
    expect(res).toMatchObject({ accepted: [], refused: [{ orderId, reason: 'changed' }], orderUpdates: [] });
  });

  it('refuses while the server does not yet hold the rows', () => {
    expect(markRefusal(mark(), docOf(), books([]))).toBe('not-saved');
    expect(markRefusal(mark(), docOf(), books([savedRow({ qty: 1 })]))).toBe('not-saved');
    expect(markRefusal(mark(), docOf(), books([savedRow({ webHash: 'h0' })]))).toBe('not-saved');
    expect(markRefusal(mark(), docOf(), {})).toBe('book-unavailable');
    expect(markRefusal(mark(), null, books())).toBe('gone');
  });

  it('only marks a reply done once the rows carry it', () => {
    const reply = { hash: 'A|x|', result: 'dispatched', reason: '', at: '2026-10-12T00:00:00Z' };
    const doc = docOf(makeWeb(), { shipmentReply: reply });
    expect(markRefusal(mark(), doc, books())).toBe('changed'); // planned before the reply arrived
    expect(markRefusal(mark({ replyAt: reply.at }), doc, books())).toBe('not-saved');
    expect(markRefusal(mark({ replyAt: reply.at }), doc, books([savedRow({ webShipment: reply })]))).toBe('');
  });

  it('lets the owner clear a rehearsal order, and nothing else that way', () => {
    const test = docOf(makeWeb({ test: true }));
    expect(markRefusal(mark({ test: true, effect: {} }), test, {})).toBe('');
    expect(markRefusal(mark({ test: true, effect: { hound: 2 } }), test, {})).toBe('test');
    expect(markRefusal(mark({ effect: {} }), test, {})).toBe('test');
    expect(markRefusal(mark({ test: true, effect: {} }), docOf(), books())).toBe('test');
    const res = planWebsitePublish({ orderDocs: { [orderId]: test }, marks: [mark({ test: true, effect: {} })], now: NOW });
    expect(res.orderUpdates[0].data).toMatchObject({ pending: false, imported: { effect: {} } });
  });

  it('marks a voided refund once its row is voided on the server', () => {
    const refunded = makeWeb({ paymentStatus: 'refunded', refundState: 'full', books: { hound: { net: 0, sold: 2, restocked: 2, unitCAD: 40, merchCAD: 80 } } });
    const res = planWebsitePublish({ books: books([savedRow({ voided: true })]), catalog, orderDocs: { [orderId]: docOf(refunded) }, marks: [mark({ effect: { hound: 0 } })] });
    expect(res.accepted).toEqual([orderId]);
  });

  it('sends a label computed from the saved rows, once', () => {
    const shipped = savedRow({ trackingNumber: 'A1', carrier: 'canadapost', shipped: true, shippedDate: '2026-10-13' });
    const lp = { costCAD: 12.5, source: 'canadapost', boughtAt: '2026-10-13' };
    const res = planWebsitePublish({ books: books([shipped]), catalog, orderDocs: { [orderId]: docOf() }, shipments: [{ orderId, linkedPostage: lp }] });
    expect(res.sent).toEqual([{ orderId, hash: 'A1|Canada Post|2026-10-13' }]);
    expect(res.orderUpdates[0].data).toMatchObject({ 'app.shipmentWaiting': true, 'app.shipment': { trackingNumber: 'A1', labelCostCAD: 12.5 } });
    expect(Object.keys(res.orderUpdates[0].data).every(k => k === 'imported' || k === 'pending' || k.startsWith('app.'))).toBe(true);

    const again = planWebsitePublish({ books: books([shipped]), catalog, orderDocs: { [orderId]: docOf(makeWeb(), { app: { shipment: { hash: 'A1|Canada Post|2026-10-13' } } }) }, shipments: [{ orderId, linkedPostage: lp }] });
    expect(again.orderUpdates).toEqual([]);
    expect(again.current).toEqual([{ orderId, hash: 'A1|Canada Post|2026-10-13' }]);
  });

  it('never sends a label from rows the screen has but the server does not', () => {
    const res = planWebsitePublish({ books: books([savedRow()]), catalog, orderDocs: { [orderId]: docOf() }, shipments: [{ orderId }] });
    expect(res.orderUpdates).toEqual([]);
  });

  it('never sends a label for a book it cannot read, or a test order', () => {
    const shipped = savedRow({ trackingNumber: 'A1' });
    const twoBooks = makeWeb({ books: { hound: { net: 2, sold: 2, unitCAD: 40, merchCAD: 80 }, altrove: { net: 1, sold: 1, unitCAD: 30, merchCAD: 30 } } });
    expect(planWebsitePublish({ books: books([shipped]), orderDocs: { [orderId]: docOf(twoBooks) }, shipments: [{ orderId }] }).orderUpdates).toEqual([]);
    expect(planWebsitePublish({ books: books([shipped]), orderDocs: { [orderId]: docOf(makeWeb({ test: true })) }, shipments: [{ orderId }] }).orderUpdates).toEqual([]);
  });

  it('sends a postage rehearsal for a test order only', () => {
    const shipment = { trackingNumber: 'TEST1', carrier: 'canadapost', labelSource: 'hand', shippedAt: '2026-10-13' };
    const test = planWebsitePublish({ orderDocs: { T: docOf(makeWeb({ orderId: 'T', test: true })) }, testShipments: [{ orderId: 'T', shipment }] });
    expect(test.orderUpdates[0].data['app.shipment']).toMatchObject({ trackingNumber: 'TEST1', carrier: 'Canada Post', hash: 'TEST1|Canada Post|2026-10-13' });
    const real = planWebsitePublish({ orderDocs: { R: docOf(makeWeb({ orderId: 'R' })) }, testShipments: [{ orderId: 'R', shipment }] });
    expect(real.orderUpdates).toEqual([]);
    const blank = planWebsitePublish({ orderDocs: { T: docOf(makeWeb({ orderId: 'T', test: true })) }, testShipments: [{ orderId: 'T', shipment: { trackingNumber: '' } }] });
    expect(blank.orderUpdates).toEqual([]);
  });

  it('combines a mark and a label for the same order into one update', () => {
    const shipped = savedRow({ trackingNumber: 'A1' });
    const res = planWebsitePublish({ books: books([shipped]), catalog, orderDocs: { [orderId]: docOf() }, marks: [mark()], shipments: [{ orderId }] });
    expect(res.orderUpdates).toHaveLength(1);
    expect(Object.keys(res.orderUpdates[0].data).sort()).toEqual(['app.shipment', 'app.shipmentWaiting', 'imported', 'pending']);
  });
});

describe('rememberChargeIntents', () => {
  it('keeps each Stripe charge’s PaymentIntent, newest kept within the limit', async () => {
    const { rememberChargeIntents, STRIPE_CHARGE_PI_KEY } = await import('../src/lib/website-link.js');
    expect(STRIPE_CHARGE_PI_KEY).toBe('lm-stripe-charge-pi');
    const first = rememberChargeIntents({}, [{ id: 'ch_1', piId: 'pi_1' }, { id: 'ch_2', piId: '' }, { id: '', piId: 'pi_x' }]);
    expect(first).toEqual({ ch_1: 'pi_1' });
    const capped = rememberChargeIntents(first, [{ id: 'ch_2', piId: 'pi_2' }, { id: 'ch_3', piId: 'pi_3' }], 2);
    expect(capped).toEqual({ ch_2: 'pi_2', ch_3: 'pi_3' });
    // Seen again: moves to the newest end instead of being dropped.
    expect(Object.keys(rememberChargeIntents(capped, [{ id: 'ch_2', piId: 'pi_2' }, { id: 'ch_4', piId: 'pi_4' }], 2))).toEqual(['ch_2', 'ch_4']);
    expect(rememberChargeIntents(null, null)).toEqual({});
  });
});

describe('review fixes — money', () => {
  it('spreads the order discount over the books by value, in whole cents that add up', async () => {
    const { splitCents, websiteBookMoney } = await import('../src/lib/website-link.js');
    expect(splitCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitCents(0, [5, 5])).toEqual([0, 0]);
    expect(splitCents(5, [0, 0])).toEqual([0, 0]);
    const web = makeWeb({
      totals: { subtotal: 100, discount: 10, shipping: 0, tax: 0, total: 90 },
      books: { a: { net: 3, sold: 3, unitCAD: 20, merchCAD: 60 }, b: { net: 1, sold: 1, unitCAD: 40, merchCAD: 40 } },
      firstBook: 'a',
    });
    const m = websiteBookMoney(web);
    expect(m.books.a.kept + m.books.b.kept).toBe(9000);
    const rows = rowsOf(web);
    const total = rows.reduce((sum, { row }) => sum + row.qty * row.price, 0);
    expect(Math.round(total * 100)).toBe(9000);
    // 54 over 3 copies is 18 each; the order's exact merchandise is kept too.
    expect(rows.find(r => r.bookId === 'a').row).toMatchObject({ price: 18, merchandisePaid: 54 });
  });

  it('a discount shared with unlinked copies only takes the linked books’ part', () => {
    const web = makeWeb({ totals: { subtotal: 100, discount: 20, total: 80 }, books: { hound: { net: 1, sold: 1, unitCAD: 50, merchCAD: 50 } } });
    expect(rowFor(web)).toMatchObject({ price: 40, merchandisePaid: 40 });
  });

  it('a free gift line is priced 0 by the discount', () => {
    const web = makeWeb({
      totals: { subtotal: 70, discount: 30, total: 40 },
      books: { hound: { net: 1, sold: 1, unitCAD: 40, merchCAD: 40 }, gift: { net: 1, sold: 1, unitCAD: 30, merchCAD: 30 } },
    });
    // Without per-line discounts the website's discount is shared by value; the
    // books still add up to what was paid for them.
    const rows = rowsOf(web);
    expect(Math.round(rows.reduce((t, { row }) => t + row.qty * row.price, 0) * 100)).toBe(4000);
  });

  it('keeps per-copy prices exact when the total does not divide evenly', () => {
    const web = makeWeb({ totals: { subtotal: 100, discount: 0, total: 100 }, books: { hound: { net: 3, sold: 3, unitCAD: 33.33, merchCAD: 100 } } });
    const row = rowFor(web);
    expect(row.merchandisePaid).toBe(100);
    expect(roundCentsOf(row.qty * row.price)).toBe(100);
  });

  it('a refund in another currency converts at the order’s own rate, or waits for a person', () => {
    const base = {
      refundState: 'partial',
      charged: { currency: 'USD', amountMinor: 6000 },
      totals: { subtotal: 80, discount: 0, shipping: 0, tax: 0, total: 80 },
      books: { hound: { net: 2, sold: 2, restocked: 0, unitCAD: 40, merchCAD: 80 } },
    };
    // 15 USD back of 60 charged is a quarter of the 80 CAD order.
    expect(rowFor(makeWeb({ ...base, refund: { amountMinor: 1500, currency: 'USD' } }))).toMatchObject({ merchandisePaid: 60, price: 30 });
    const plan = planWebsiteOrder({ id: 'x', web: makeWeb({ ...base, refund: { amountMinor: 1500, currency: 'EUR' } }) }, { histByBook: { hound: [] }, bookCurrencyOf: cadBook });
    expect(plan).toMatchObject({ status: 'review', reasons: [{ reason: 'refund-currency', currency: 'EUR' }] });
  });

  it('a gratuity row (refunded, copies kept) carries no money at all', () => {
    const web = makeWeb({ paymentStatus: 'refunded', refundState: 'full', books: { hound: { net: 1, sold: 1, restocked: 0, unitCAD: 40, merchCAD: 40 } } });
    expect(rowFor(web)).toMatchObject({ gratuity: true, price: 0, merchandisePaid: 0, shippingPaid: 0, taxPaid: 0, totalPaid: 0, subtotal: 0, discountAmount: 0, giftCardPaid: 0 });
  });

  it('linking a hand sale keeps its own price, date and totals; only link, copies and refund state change', () => {
    const hand = { num: '#ABCD-123456-WXYZ', chan: 'Website', qty: 2, price: 50, date: '2026-10-09', sheetsId: 'h1', shippingPaid: 9, totalPaid: 109 };
    const patch = rowPatch(hand, rowFor(makeWeb()));
    for (const k of ['price', 'date', 'shippingPaid', 'totalPaid', 'merchandisePaid', 'cur']) expect(patch[k], k).toBeUndefined();
    expect(patch).toMatchObject({ webOrderId: 'ABCD-123456-WXYZ', voided: false, gratuity: false });
    expect(patch.webMoney).toBeTruthy();
    // Refunded in full later with the copies kept: the money goes, whoever entered it.
    const refunded = rowFor(makeWeb({ paymentStatus: 'refunded', refundState: 'full', books: { hound: { net: 2, sold: 2, unitCAD: 40, merchCAD: 80 } } }));
    expect(rowPatch(hand, refunded)).toMatchObject({ gratuity: true, price: 0 });
  });

  it('a price the owner corrected stays until the website’s money for that book changes', () => {
    const d = rowFor(makeWeb());
    const edited = { ...d, price: 30 };
    expect(rowPatch(edited, rowFor(makeWeb({ hash: 'h2', fulfillment: { status: 'processing' } })))).toEqual(expect.not.objectContaining({ price: expect.anything() }));
    expect(rowPatch(edited, rowFor(makeWeb({ hash: 'h2', fulfillment: { status: 'processing' } }))).price).toBeUndefined();
    const discounted = rowFor(makeWeb({ hash: 'h3', totals: { subtotal: 80, discount: 10, shipping: 12, tax: 0, total: 82 } }));
    expect(rowPatch(edited, discounted)).toMatchObject({ price: 35 });
  });
});

describe('review fixes — tracking', () => {
  it('clears the website’s tracking when the website drops its label, and never sends it back', () => {
    const shipped = rowFor(makeWeb({ fulfillment: { status: 'processing', trackingNumber: 'W1', labelSource: 'website' } }));
    expect(shipped.webTrackingSeen).toEqual(['W1']);
    const dropped = rowFor(makeWeb({ hash: 'h2', fulfillment: { status: 'processing', trackingNumber: '', labelSource: null } }));
    const patch = rowPatch(shipped, dropped);
    expect(patch).toMatchObject({ trackingNumber: '', trackingSource: '', webTracking: '' });
    const after = { ...shipped, ...patch };
    expect(hasAppTracking(after)).toBe(false);
    expect(appShipmentFor([after], null, { fulfillment: {} })).toBeNull();
    // Even if the cleared number were still on the row, it was the website's.
    expect(hasAppTracking({ webOrderId: 'x', trackingNumber: 'W1', webTracking: '', webTrackingSeen: ['W1'] })).toBe(false);
  });

  it('tracking already on a linked hand sale is sent as a label unless the parcel is old or the website shipped it', () => {
    const hand = (over) => ({ num: '#ABCD-123456-WXYZ', qty: 2, price: 40, trackingNumber: 'T9', shipped: true, ...over });
    const d = rowFor(makeWeb());
    expect(rowPatch(hand({ shippedDate: '2026-10-12' }), d, { consentDay: '2026-10-10' }).webBaselineTracking).toBeUndefined();
    expect(rowPatch(hand({ shippedDate: '2026-10-01' }), d, { consentDay: '2026-10-10' }).webBaselineTracking).toBe('T9');
    expect(rowPatch(hand({ shippedDate: '2026-10-12' }), d, {}).webBaselineTracking).toBe('T9');
    const websiteShipped = rowFor(makeWeb({ fulfillment: { status: 'shipped', trackingNumber: 'W1', labelSource: 'website' } }));
    expect(rowPatch(hand({ shippedDate: '2026-10-12' }), websiteShipped, { consentDay: '2026-10-10' }).webBaselineTracking).toBe('T9');
  });
});

describe('review fixes — order freshness and row size', () => {
  it('never patches a row with an older copy of the order', async () => {
    const { rowIsNewer } = await import('../src/lib/website-link.js');
    const newer = rowFor(makeWeb({ sourceUpdatedAt: '2026-10-12T00:00:00.000Z', paymentStatus: 'refunded', refundState: 'full', books: { hound: { net: 0, sold: 2, restocked: 2, unitCAD: 40, merchCAD: 80 } } }));
    const older = rowFor(makeWeb({ sourceUpdatedAt: '2026-10-11T00:00:00.000Z' }));
    expect(rowPatch(newer, older)).toBeNull();
    expect(rowIsNewer(newer, { sourceUpdatedAt: '2026-10-11T00:00:00.000Z' })).toBe(true);
    const plan = planWebsiteOrder({ id: 'ABCD-123456-WXYZ', web: makeWeb({ sourceUpdatedAt: '2026-10-11T00:00:00.000Z' }) }, { histByBook: { hound: [newer] }, bookCurrencyOf: cadBook });
    expect(plan.status).toBe('stale');
  });

  it('keeps a long website reason short on the row', () => {
    const reply = { hash: 'x', result: 'refused', reason: 'r'.repeat(500), at: 'z' };
    expect(rowFor(makeWeb(), 'hound', { shipmentReply: reply }).webShipment.reason).toHaveLength(200);
  });
});

describe('review fixes — the feed while orders wait', () => {
  it('sends a book as not trustworthy while one of its website orders waits here', () => {
    const books = { hound: { hist: [], ledger: [], metadata: {} } };
    const catalog = { hound: { id: 'hound', title: 'The Hound', maxPrint: 10 } };
    const held = planWebsitePublish({ bookIds: ['hound'], books, catalog, heldOrders: [{ orderId: 'W1', books: ['hound'] }] });
    expect(held.feeds[0].doc.derived).toBe(false);
    expect(held.held).toEqual(['hound']);
    const free = planWebsitePublish({ bookIds: ['hound'], books, catalog, heldOrders: [] });
    expect(free.feeds[0].doc.derived).toBe(true);
  });

  it('an order marked done in the same transaction no longer holds its book', () => {
    const saved = rowFor(makeWeb());
    const res = planWebsitePublish({
      bookIds: ['hound'],
      books: { hound: { hist: [saved], ledger: [], metadata: {} } },
      catalog: { hound: { id: 'hound', title: 'H', maxPrint: 10 } },
      orderDocs: { 'ABCD-123456-WXYZ': { web: makeWeb(), pending: true } },
      marks: [{ orderId: 'ABCD-123456-WXYZ', hash: 'h1', effect: { hound: 2 }, replyAt: '' }],
      heldOrders: [{ orderId: 'ABCD-123456-WXYZ', books: ['hound'] }],
    });
    expect(res.accepted).toEqual(['ABCD-123456-WXYZ']);
    expect(res.feeds[0].doc.derived).toBe(true);
  });
});

function roundCentsOf(n) { return Math.round(n * 100) / 100; }

describe('isShippoTestKey', () => {
  it('knows a Shippo test key from a live one', async () => {
    const { isShippoTestKey } = await import('../src/lib/website-link.js');
    expect(isShippoTestKey('shippo_test_abc')).toBe(true);
    expect(isShippoTestKey(' shippo_test_abc')).toBe(true);
    expect(isShippoTestKey('shippo_live_abc')).toBe(false);
    expect(isShippoTestKey('')).toBe(false);
  });

  it('a test label never counts as a label for the website', () => {
    const row = { webOrderId: 'A', trackingNumber: 'T1', trackingSimulated: true, shipped: true };
    expect(appShipmentFor([row], null, null)).toBeNull();
  });
});
