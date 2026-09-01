import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  bigCartelOrderNumber,
  sameOrderNumber,
  bigCartelOrderDate,
  bigCartelMerchandiseTotal,
  resolveBookIdByTitle,
  bigCartelOrderLines,
  findLedgerGaps,
  buildBigCartelOrderEntry,
  isPlaceholderEntry,
  findRecoveredOrderConflicts,
  pendingGaps,
  describeGapSummary,
} from '../src/lib/bigcartel-ledger-gap.js';

const BOOKS = {
  altrove: { id: 'altrove', title: 'Altrove', listPrice: 32.5 },
  hound: { id: 'hound', title: 'The Hound', listPrice: 40 },
};

const order = (id, attributes = {}, extra = {}) => ({
  id,
  attributes: { status: 'completed', created_at: '2026-07-10T14:00:00Z', ...attributes },
  ...extra,
});

describe('storefront order numbers', () => {
  it('reads the real order number out of the JSON:API id', () => {
    expect(bigCartelOrderNumber(order('JMIQ-538069'))).toBe('#JMIQ-538069');
    expect(bigCartelOrderNumber(order('jmiq-538069'))).toBe('#JMIQ-538069');
  });

  it('falls back to a number attribute when the id is not the order number', () => {
    expect(bigCartelOrderNumber({ id: '101', attributes: { number: 'HAMA-220144' } })).toBe('#HAMA-220144');
  });

  it('returns empty rather than guessing when nothing resolves', () => {
    expect(bigCartelOrderNumber({ id: '101', attributes: {} })).toBe('');
  });

  // The bug this whole module exists to close: two unidentifiable orders used to
  // compare equal, so an unmatched storefront order would silently overwrite an
  // unrelated ledger row's shipping cost.
  it('never treats two unreadable numbers as the same order', () => {
    expect(sameOrderNumber('', '')).toBe(false);
    expect(sameOrderNumber('101', '202')).toBe(false);
    expect(sameOrderNumber('#JMIQ-538069', 'jmiq-538069')).toBe(true);
  });

  it('normalizes the order date and merchandise total', () => {
    expect(bigCartelOrderDate(order('JMIQ-538069'))).toBe('2026-07-10');
    expect(bigCartelOrderDate({ id: 'X', attributes: { created_at: 'not a date' } })).toBe('');
    expect(bigCartelMerchandiseTotal(order('X', { total: '50.00', tax_total: '2.50', shipping_total: '15.00' })))
      .toBeCloseTo(32.5);
  });
});

describe('resolving products to catalog books', () => {
  it('matches an exact title, a subtitled product, and a partial name', () => {
    expect(resolveBookIdByTitle('Altrove', BOOKS)).toBe('altrove');
    expect(resolveBookIdByTitle('Altrove (signed paperback)', BOOKS)).toBe('altrove');
    expect(resolveBookIdByTitle('  the hound  ', BOOKS)).toBe('hound');
  });

  it('returns empty for a product that is not a catalog book', () => {
    expect(resolveBookIdByTitle('Tote bag', BOOKS)).toBe('');
    expect(resolveBookIdByTitle('', BOOKS)).toBe('');
  });
});

describe('extracting line items across every storefront shape', () => {
  it('reads items embedded on the order', () => {
    const o = order('JMIQ-538069', { items: [{ product_name: 'Altrove', quantity: 2, price: '32.50' }] });
    expect(bigCartelOrderLines(o, [], BOOKS)).toEqual([
      { title: 'Altrove', bookId: 'altrove', qty: 2, unitPrice: 32.5, confidence: 'exact' },
    ]);
  });

  it('follows JSON:API relationships into the included list', () => {
    const o = order('ILTK-951862', {}, {
      relationships: { items: { data: [{ type: 'items', id: 'item1' }] } },
    });
    const included = [{ type: 'items', id: 'item1', attributes: { product_name: 'The Hound', quantity: 2 } }];
    expect(bigCartelOrderLines(o, included, BOOKS)).toEqual([
      { title: 'The Hound', bookId: 'hound', qty: 2, unitPrice: null, confidence: 'exact' },
    ]);
  });

  it('picks up included items that point back at the order', () => {
    const o = order('GOEQ-951023');
    const included = [{ type: 'order_items', id: '9', attributes: { name: 'Altrove', order_id: 'GOEQ-951023' } }];
    expect(bigCartelOrderLines(o, included, BOOKS)[0]).toMatchObject({ bookId: 'altrove', confidence: 'exact' });
  });

  it('deduces the book from what was paid when nothing is itemized', () => {
    const o = order('KEVI-640529', { total: '80.00', tax_total: '0', shipping_total: '0' });
    expect(bigCartelOrderLines(o, [], BOOKS)).toEqual([
      { title: 'The Hound', bookId: 'hound', qty: 2, unitPrice: 40, confidence: 'price' },
    ]);
  });

  it('marks an unrecognised product so the publisher picks the book', () => {
    const o = order('TOTE-111111', { items: [{ product_name: 'Tote bag', quantity: 1 }] });
    expect(bigCartelOrderLines(o, [], BOOKS)[0]).toMatchObject({ bookId: '', confidence: 'none' });
  });

  it('returns nothing when the order is empty and unpriceable', () => {
    expect(bigCartelOrderLines(order('X-1', { total: '0' }), [], BOOKS)).toEqual([]);
  });
});

describe('finding orders the ledger never received', () => {
  const orders = [
    order('JMIQ-538069', { items: [{ product_name: 'Altrove', quantity: 1, price: '32.50' }], total: '45.00', tax_total: '0', shipping_total: '12.50' }),
    order('HAMA-220144', { items: [{ product_name: 'The Hound', quantity: 1, price: '40.00' }], total: '52.00', tax_total: '0', shipping_total: '12.00' }),
    order('CANC-000001', { status: 'cancelled' }),
  ];

  it('reports only the orders with no ledger row', () => {
    const result = findLedgerGaps(orders, [], { ledgerNumbers: ['#JMIQ-538069'], books: BOOKS });
    expect(result.missing.map(gap => gap.num)).toEqual(['#HAMA-220144']);
    expect(result.present).toBe(1);
    expect(result.cancelled).toBe(1);
    expect(result.checked).toBe(3);
  });

  it('carries the details the review row needs', () => {
    const result = findLedgerGaps(orders, [], { ledgerNumbers: [], books: BOOKS });
    expect(result.missing[1]).toMatchObject({
      num: '#HAMA-220144',
      date: '2026-07-10',
      bookId: 'hound',
      confidence: 'exact',
      qty: 1,
      unitPrice: 40,
      shippingPaid: 12,
      totalPaid: 52,
    });
  });

  it('honours numbers the publisher has set aside', () => {
    const result = findLedgerGaps(orders, [], { ledgerNumbers: [], books: BOOKS, dismissedNums: ['#HAMA-220144'] });
    expect(result.missing.map(gap => gap.num)).toEqual(['#JMIQ-538069']);
    expect(result.skipped).toBe(1);
  });

  it('counts an order with no readable number instead of inventing one', () => {
    const result = findLedgerGaps([{ id: '101', attributes: { status: 'completed' } }], [], { books: BOOKS });
    expect(result.missing).toEqual([]);
    expect(result.unidentified).toBe(1);
  });

  it('matches ledger numbers regardless of case or leading hash', () => {
    const result = findLedgerGaps(orders, [], { ledgerNumbers: ['jmiq-538069', 'HAMA-220144'], books: BOOKS });
    expect(result.missing).toEqual([]);
    expect(result.present).toBe(2);
  });
});

describe('the ledger entry a recovered order becomes', () => {
  const gap = findLedgerGaps(
    [order('HAMA-220144', { items: [{ product_name: 'The Hound', quantity: 1, price: '40.00' }], total: '52.00', tax_total: '0', shipping_total: '12.00' })],
    [], { books: BOOKS },
  ).missing[0];

  it('derives the same deterministic Sheets id applyOne would', () => {
    const entry = buildBigCartelOrderEntry(gap, { stockAfter: 87 });
    expect(entry.sheetsId).toBe('bc-HAMA-220144');
    expect(entry.num).toBe('#HAMA-220144');
    expect(entry.chan).toBe('Website');
    expect(entry.notes).toBe('Big Cartel');
    expect(entry.after).toBe(87);
  });

  it('carries the storefront address onto the entry', () => {
    const entry = buildBigCartelOrderEntry(gap, {
      stockAfter: 5,
      address: { name: 'Mike Hamar', street1: '12 Elm St', city: 'Toronto', state: 'ON', zip: 'M5V 2T6', country: 'CA', phone: '416-555-0134' },
    });
    expect(entry).toMatchObject({
      shipName: 'Mike Hamar', shipAddr1: '12 Elm St', shipCity: 'Toronto',
      shipProvince: 'ON', shipPostal: 'M5V 2T6', shipCountry: 'CA', shipPhone: '416-555-0134',
    });
  });

  it('respects a corrected book, quantity and price', () => {
    const entry = buildBigCartelOrderEntry(gap, { bookId: 'altrove', qty: 3, price: 32.5, stockAfter: 2 });
    expect(entry.qty).toBe(3);
    expect(entry.price).toBe(32.5);
  });

  it('never writes a fractional or zero quantity', () => {
    expect(buildBigCartelOrderEntry(gap, { qty: 0 }).qty).toBe(1);
    expect(buildBigCartelOrderEntry(gap, { qty: 2.7 }).qty).toBe(2);
  });

  // The anti-divergence guard. applyOne() in src/main.js is the path a scanned
  // order takes; an order added from the review queue must be indistinguishable
  // from one, or the two identities problem this feature fixes comes straight
  // back. Read the real source so the test fails if applyOne grows a field.
  it('writes every field applyOne writes', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const mainJs = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');
    const start = mainJs.indexOf('export function applyOne(');
    expect(start).toBeGreaterThan(-1);
    const body = mainJs.slice(start, mainJs.indexOf('targetState.hist.unshift(entry);', start));
    const literal = body.slice(body.indexOf('const entry = {'));
    const fields = new Set(Array.from(literal.matchAll(/^\s{4}(\w+):/gm), m => m[1]));
    fields.add('num');
    fields.add('sheetsId');

    const entry = buildBigCartelOrderEntry(gap, { stockAfter: 1 });
    const missing = Array.from(fields).filter(field => !(field in entry));
    expect(missing).toEqual([]);
  });
});

describe('repairing placeholder orders left by the old recovery path', () => {
  const placeholder = {
    num: '#RECOV-A1B2C3', chan: 'Website', qty: 1, date: '2026-07-11',
    shipName: 'Mike Hamar', shipEmail: 'mike@example.com', shipPostal: 'M5V 2T6',
    recoveredFromPostage: true,
  };
  const real = order('HAMA-220144', {
    customer_name: 'Mike Hamar', buyer_email: 'mike@example.com', shipping_zip: 'M5V 2T6',
  });

  it('recognises a placeholder row by flag or by number', () => {
    expect(isPlaceholderEntry(placeholder)).toBe(true);
    expect(isPlaceholderEntry({ num: '#recov-999999' })).toBe(true);
    expect(isPlaceholderEntry({ num: '#HAMA-220144' })).toBe(false);
  });

  it('offers to renumber a placeholder onto its real storefront order', () => {
    const { renumber, duplicate } = findRecoveredOrderConflicts([real], [placeholder]);
    expect(duplicate).toEqual([]);
    expect(renumber).toEqual([{
      placeholderNum: '#RECOV-A1B2C3', realNum: '#HAMA-220144',
      customer: 'Mike Hamar', date: '2026-07-11', qty: 1, orderId: 'HAMA-220144',
    }]);
  });

  it('calls it a duplicate when the real order is already in the ledger', () => {
    const ledger = [placeholder, { num: '#HAMA-220144', chan: 'Website', qty: 1, date: '2026-07-10' }];
    const { renumber, duplicate } = findRecoveredOrderConflicts([real], ledger);
    expect(renumber).toEqual([]);
    expect(duplicate.map(c => c.realNum)).toEqual(['#HAMA-220144']);
  });

  it('matches on name plus postal when no email was captured', () => {
    const noEmail = { ...placeholder, shipEmail: '' };
    const orderNoEmail = order('HAMA-220144', { customer_name: 'Mike Hamar', shipping_zip: 'M5V 2T6' });
    expect(findRecoveredOrderConflicts([orderNoEmail], [noEmail]).renumber).toHaveLength(1);
  });

  it('leaves a near-miss alone rather than renumbering the wrong sale', () => {
    const otherPerson = order('ANGU-771200', { customer_name: 'Alvaro Angulo', buyer_email: 'alvaro@example.com', shipping_zip: '08013' });
    expect(findRecoveredOrderConflicts([otherPerson], [placeholder]).renumber).toEqual([]);
  });

  it('will not match across a wide date gap', () => {
    const stale = { ...placeholder, date: '2026-01-02' };
    expect(findRecoveredOrderConflicts([real], [stale]).renumber).toEqual([]);
  });

  it('ignores voided rows', () => {
    expect(findRecoveredOrderConflicts([real], [{ ...placeholder, voided: true }]).renumber).toEqual([]);
  });
});

describe('the summary sentence', () => {
  it('leads with what needs action', () => {
    expect(describeGapSummary({ checked: 4, missing: [{}, {}], cancelled: 1 }))
      .toBe('Checked 4 Big Cartel orders: 2 orders missing from your ledger, 1 cancelled.');
  });

  it('says so plainly when nothing is missing', () => {
    expect(describeGapSummary({ checked: 3, missing: [] }))
      .toBe('Checked 3 Big Cartel orders: every order is in your ledger.');
  });

  it('handles never having checked', () => {
    expect(describeGapSummary(null)).toMatch(/Connect Big Cartel/);
  });
});

// The situation this feature was built for, end to end.
//
// Two orders — Mike Hamar and Alvaro Angulo — were paid for on the storefront
// and had shipping labels bought for them, but their confirmation emails never
// reached the Gmail scan, so neither sale was ever recorded. Nothing in the app
// said so: the orders table showed them, the shipping sync walked past them, and
// the only escape hatch numbered them `#RECOV-`.
describe('the two orders that went missing', () => {
  const storefront = [
    order('HAMA-220144', {
      customer_name: 'Mike Hamar', buyer_email: 'mike@example.com', shipping_zip: 'M5V 2T6',
      items: [{ product_name: 'Altrove', quantity: 1, price: '32.50' }],
      total: '45.00', tax_total: '0', shipping_total: '12.50',
    }),
    order('ANGU-771200', {
      customer_name: 'Alvaro Angulo', buyer_email: 'alvaro@example.com', shipping_zip: '08013',
      items: [{ product_name: 'The Hound', quantity: 1, price: '40.00' }],
      total: '54.00', tax_total: '0', shipping_total: '14.00',
    }),
    order('OKAY-100000', {
      customer_name: 'Recorded Already',
      items: [{ product_name: 'Altrove', quantity: 1, price: '32.50' }],
      total: '32.50', tax_total: '0', shipping_total: '0',
    }),
  ];
  const ledgerHasOnly = ['#OKAY-100000'];

  it('names both missing sales instead of staying silent', () => {
    const result = findLedgerGaps(storefront, [], { ledgerNumbers: ledgerHasOnly, books: BOOKS });
    expect(result.missing.map(gap => gap.customer)).toEqual(['Mike Hamar', 'Alvaro Angulo']);
    expect(result.present).toBe(1);
    expect(describeGapSummary(result))
      .toBe('Checked 3 Big Cartel orders: 2 orders missing from your ledger.');
  });

  it('adds each one under its real storefront number, not an invented one', () => {
    const { missing } = findLedgerGaps(storefront, [], { ledgerNumbers: ledgerHasOnly, books: BOOKS });
    const entries = missing.map(gap => buildBigCartelOrderEntry(gap, { stockAfter: 10 }));
    expect(entries.map(e => e.num)).toEqual(['#HAMA-220144', '#ANGU-771200']);
    expect(entries.map(e => e.sheetsId)).toEqual(['bc-HAMA-220144', 'bc-ANGU-771200']);
    expect(entries.some(e => /RECOV/i.test(e.num))).toBe(false);
    expect(entries.every(e => e.chan === 'Website' && e.notes === 'Big Cartel')).toBe(true);
    // The postage the customer paid rides along, so the shipping margin is right
    // the first time rather than needing a later sync to correct it.
    expect(entries.map(e => e.shippingPaid)).toEqual([12.5, 14]);
  });

  it('reports them as present once added, so nothing is offered twice', () => {
    const first = findLedgerGaps(storefront, [], { ledgerNumbers: ledgerHasOnly, books: BOOKS });
    const added = first.missing.map(gap => buildBigCartelOrderEntry(gap, { stockAfter: 0 }).num);
    const second = findLedgerGaps(storefront, [], {
      ledgerNumbers: [...ledgerHasOnly, ...added], books: BOOKS,
    });
    expect(second.missing).toEqual([]);
    expect(second.present).toBe(3);
  });

  it('spots a placeholder row already created for one of them and offers the real number', () => {
    const ledger = [{
      num: '#RECOV-8F21A0', chan: 'Website', qty: 1, date: '2026-07-10',
      shipName: 'Mike Hamar', shipEmail: 'mike@example.com', shipPostal: 'M5V 2T6',
      recoveredFromPostage: true, sheetsId: 'bc-RECOV-8F21A0',
    }];
    const { renumber, duplicate } = findRecoveredOrderConflicts(storefront, ledger);
    expect(duplicate).toEqual([]);
    expect(renumber).toMatchObject([{ placeholderNum: '#RECOV-8F21A0', realNum: '#HAMA-220144' }]);
  });

  it('catches the double-count when both a placeholder and the real order exist', () => {
    const ledger = [
      { num: '#RECOV-8F21A0', chan: 'Website', qty: 1, date: '2026-07-10', shipName: 'Mike Hamar', shipEmail: 'mike@example.com', shipPostal: 'M5V 2T6', recoveredFromPostage: true },
      { num: '#HAMA-220144', chan: 'Website', qty: 1, date: '2026-07-10' },
    ];
    expect(findRecoveredOrderConflicts(storefront, ledger).duplicate)
      .toMatchObject([{ placeholderNum: '#RECOV-8F21A0', realNum: '#HAMA-220144' }]);
  });
});

// Clearing the backlog. Most of a long queue is old pre-app sales the publisher
// already entered by hand, so setting one aside has to be cheap and reversible.
describe('setting an order aside', () => {
  const result = () => ({
    checked: 3,
    missing: [
      { num: '#AAAA-100001', customer: 'One' },
      { num: '#BBBB-100002', customer: 'Two' },
      { num: '#CCCC-100003', customer: 'Three' },
    ],
  });

  it('drops a set-aside row out of the outstanding count', () => {
    const r = result();
    r.missing[1].setAside = true;
    expect(pendingGaps(r).map(g => g.num)).toEqual(['#AAAA-100001', '#CCCC-100003']);
  });

  // It stays in `missing` on purpose: that is what lets the row collapse to an
  // Undo strip in place instead of vanishing.
  it('keeps the set-aside row available so the decision can be undone', () => {
    const r = result();
    r.missing[1].setAside = true;
    expect(r.missing).toHaveLength(3);
    delete r.missing[1].setAside;
    expect(pendingGaps(r)).toHaveLength(3);
  });

  it('counts set-aside rows in the summary without calling them missing', () => {
    const r = result();
    r.missing[0].setAside = true;
    r.missing[1].setAside = true;
    expect(describeGapSummary(r))
      .toBe('Checked 3 Big Cartel orders: 1 order missing from your ledger, 2 set aside.');
  });

  it('adds rows set aside now to those already skipped by an earlier pass', () => {
    const r = { checked: 5, missing: [{ num: '#A-1', setAside: true }], skipped: 2 };
    expect(describeGapSummary(r)).toMatch(/3 set aside/);
  });

  it('reports a fully cleared queue as clean', () => {
    const r = result();
    r.missing.forEach(gap => { gap.setAside = true; });
    expect(pendingGaps(r)).toEqual([]);
    expect(describeGapSummary(r))
      .toBe('Checked 3 Big Cartel orders: every order is in your ledger, 3 set aside.');
  });

  it('survives a missing or empty result', () => {
    expect(pendingGaps(null)).toEqual([]);
    expect(pendingGaps({})).toEqual([]);
  });
});
