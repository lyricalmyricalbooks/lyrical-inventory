import { describe, it, expect } from 'vitest';
import {
  absorbDuplicatePostage, duplicatePostageRows, postageRowSource, postageRowTracking, postageTrackingIndex,
} from '../src/lib/postage-intake.js';
import { enrichShippoExpense, autoLinkConfidentShippingMatches } from '../src/lib/shipping-reconciliation.js';

const TRACK = 'LE055214725CA';
const shippoRow = (over = {}) => ({
  ref: 'shippo:tx1', cat: 'Shipping & Postage', amount: 14.2, desc: `Shippo shipping label #${TRACK}`, date: '2026-10-16', ...over,
});
const emailRow = (over = {}) => ({
  ref: `postage:${TRACK}`, cat: 'Shipping & Postage', amount: 14.2, postageSource: 'email', trackingNumber: TRACK, date: '2026-10-16', ...over,
});

describe('one label, one cost', () => {
  it('reads the tracking number of every kind of postage row', () => {
    expect(postageRowTracking(shippoRow())).toBe(TRACK); // older Shippo rows: only in the description
    expect(postageRowTracking(shippoRow({ trackingNumber: 'le 055 214 725 ca' }))).toBe(TRACK);
    expect(postageRowTracking({ ref: `postage:${TRACK}` })).toBe(TRACK);
    expect(postageRowTracking({ ref: 'canadapost:123', trackingPin: '7023210455667788' })).toBe('7023210455667788');
    expect(postageRowTracking({ ref: 'canadapost:999999' })).toBe(''); // a shipment id is not a tracking number
    expect(postageRowSource(shippoRow())).toBe('shippo');
    expect(postageRowSource(emailRow())).toBe('email');
    expect(postageRowSource({ ref: 'canadapost:1' })).toBe('canadapost');
  });

  it('indexes swept postage only (no refund credits, no rehearsals, no hand-typed costs)', () => {
    const index = postageTrackingIndex([
      { ref: 'shippo-refund:tx1', trackingNumber: TRACK },
      shippoRow({ simulated: true }),
      { desc: `Stamps #${TRACK}`, cat: 'Shipping & Postage' },
    ]);
    expect(index.size).toBe(0);
    expect(postageTrackingIndex([shippoRow()]).get(TRACK).ref).toBe('shippo:tx1');
  });

  it('drops the email copy of a Shippo label, never the Shippo record', () => {
    const keep = shippoRow();
    const drop = emailRow();
    expect(duplicatePostageRows([drop, keep])).toEqual([{ keep, drop }]);
  });

  it('never drops a carrier record for another carrier record', () => {
    expect(duplicatePostageRows([shippoRow(), { ref: `postage:${TRACK}`, postageSource: 'canadapost' }])).toEqual([]);
    expect(duplicatePostageRows([shippoRow(), emailRow({ trackingNumber: 'OTHER1234CA', ref: 'postage:OTHER1234CA' })])).toEqual([]);
  });

  it('keeps the first of two copies read off documents', () => {
    const first = emailRow();
    const second = emailRow({ ref: 'postage-receipt:m2', postageSource: 'receipt' });
    expect(duplicatePostageRows([first, second])).toEqual([{ keep: first, drop: second }]);
  });

  it('carries the order link and the receipt over to the row that stays', () => {
    const keep = shippoRow({ shippingMatchStatus: 'suggested', shippingSuggestedOrderNumber: '#AB-1' });
    absorbDuplicatePostage(keep, emailRow({ shippingMatchStatus: 'matched', shippingOrderNumber: '#AB-1', receipt: 'r.pdf' }));
    expect(keep).toMatchObject({ shippingMatchStatus: 'matched', shippingOrderNumber: '#AB-1', receipt: 'r.pdf', trackingNumber: TRACK });
    expect(keep.shippingSuggestedOrderNumber).toBeUndefined();
    const linked = shippoRow({ shippingMatchStatus: 'matched', shippingOrderNumber: '#AB-2', receipt: 'label.pdf' });
    absorbDuplicatePostage(linked, emailRow({ shippingMatchStatus: 'matched', shippingOrderNumber: '#AB-1', receipt: 'r.pdf' }));
    expect(linked).toMatchObject({ shippingOrderNumber: '#AB-2', receipt: 'label.pdf' });
  });
});

describe('a website label links to its order', () => {
  const order = { num: '#FRQZ-047691-K2XP', chan: 'Website', trackingNumber: TRACK, date: '2026-10-15', shipEmail: 'a@x.com' };
  it('by the order number Shippo carries', () => {
    const e = enrichShippoExpense({ ref: 'shippo:tx1', date: '2026-10-16' }, { object_id: 'tx1', tracking_number: TRACK, metadata: 'Order FRQZ-047691-K2XP' }, {}, {}, [order]);
    expect(e).toMatchObject({ shippingMatchStatus: 'matched', shippingOrderNumber: '#FRQZ-047691-K2XP', trackingNumber: TRACK });
  });
  it('by its tracking number when Shippo names no order', () => {
    const e = enrichShippoExpense({ ref: 'shippo:tx1', date: '2026-10-16' }, { object_id: 'tx1', tracking_number: TRACK }, {}, {}, [order]);
    expect(e).toMatchObject({ shippingMatchStatus: 'suggested', shippingMatchTier: 'tracking', shippingSuggestedOrderNumber: '#FRQZ-047691-K2XP' });
    expect(autoLinkConfidentShippingMatches([e], [order])).toHaveLength(1);
  });
  it('once the email copy is gone, nothing else claims the order', () => {
    const e = enrichShippoExpense({ ref: 'shippo:tx1', date: '2026-10-16' }, { object_id: 'tx1', tracking_number: TRACK }, {}, {}, [order]);
    const copy = emailRow({ shippingMatchStatus: 'suggested', shippingMatchTier: 'tracking', shippingSuggestedOrderNumber: '#FRQZ-047691-K2XP' });
    expect(autoLinkConfidentShippingMatches([e, copy], [order])).toHaveLength(0); // why it used to link neither
    const left = [e, copy].filter(row => !duplicatePostageRows([e, copy]).some(p => p.drop === row));
    expect(autoLinkConfidentShippingMatches(left, [order])).toHaveLength(1);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeMetadata } from '../src/lib/merge-state.js';
describe('every road checks the tracking number', () => {
  const src = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/features/shipping.js'), 'utf8');
  it('the email and Canada Post sweeps skip a label already filed under another road', () => {
    expect(src.match(/tracked\.has\(candidate\.trackingNumber\)/g)).toHaveLength(3);
  });
  it('the Shippo import gives way to a Canada Post record and removes email copies', () => {
    expect(src).toMatch(/postageRowSource\(sameLabel\) === 'canadapost'/);
    expect(src).toMatch(/const duplicatesRemoved = dropDuplicatePostage\(\);/);
  });
  it("a refunded label's number is never written back onto its order", () => {
    expect(src).toMatch(/!expense\.refundRequest && refundState\(expense, expenses\) === 'none'/);
  });
});

describe('review follow-ups', () => {
  it('one Shippo label imported twice (two devices) is one cost; the linked copy stays', () => {
    const a = shippoRow({ id: 1 });
    const b = shippoRow({ id: 2, shippingMatchStatus: 'matched', shippingOrderNumber: '#AB-1' });
    expect(duplicatePostageRows([a, b])).toEqual([{ keep: b, drop: a }]);
    expect(duplicatePostageRows([a, b, emailRow()])).toHaveLength(2);
  });
  it('a link made on the copy wins over a set-aside Shippo row', () => {
    const keep = shippoRow({ shippingMatchStatus: 'dismissed' });
    absorbDuplicatePostage(keep, emailRow({ shippingMatchStatus: 'matched', shippingOrderNumber: '#AB-1' }));
    expect(keep).toMatchObject({ shippingMatchStatus: 'matched', shippingOrderNumber: '#AB-1' });
  });
  it("keeps receipts attached to the copy, and the copy's amount when the record has none", () => {
    const keep = shippoRow({ receiptFiles: ['a.pdf'], amountUnknown: true, amount: 0 });
    absorbDuplicatePostage(keep, emailRow({ receiptFiles: ['a.pdf', 'b.jpg'], amount: 9.5, baseAmount: 9.5, currency: 'CAD' }));
    expect(keep).toMatchObject({ receiptFiles: ['a.pdf', 'b.jpg'], amount: 9.5, amountUnknown: false });
  });
  it('reads the tracking number of in-app Shippo labels named with their service', () => {
    expect(postageRowTracking(shippoRow({ desc: `Shippo shipping label #${TRACK} — Canada Post Expedited Parcel` }))).toBe(TRACK);
  });
  it('discarded labels made on either device are all kept', () => {
    const { value } = mergeMetadata({ discardedPostageRefs: ['a'] }, { discardedPostageRefs: ['a', 'b'] }, { discardedPostageRefs: ['a', 'c'] });
    expect(value.discardedPostageRefs.sort()).toEqual(['a', 'b', 'c']);
  });
});
