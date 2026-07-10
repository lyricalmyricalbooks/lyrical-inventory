import { describe, expect, it } from 'vitest';
import {
  normalizeShippingOrderNumber,
  extractShippingOrderNumber,
  reconcileShippingExpense,
  enrichShippoExpense,
  stageShippoExpenseEnrichment,
  applyShippoExpenseEnrichments,
  persistManualShippingLink,
  linkedShippingSummary,
} from '../src/lib/shipping-reconciliation.js';

const orders = [
  { num: '#GPWT-916083', date: '2026-07-10', shipEmail: 'dave@example.com', shipName: 'Dave Hebb', shipPostal: '12409' },
  { num: '#KEVI-640529', date: '2026-07-10', shipEmail: 'zuzu@example.com', shipName: 'Zuzu Hill', shipPostal: '60616' },
];

describe('shipping reconciliation', () => {
  it('normalizes and extracts Big Cartel order numbers', () => {
    expect(normalizeShippingOrderNumber(' gpwt-916083 ')).toBe('#GPWT-916083');
    expect(extractShippingOrderNumber('customer_ID:12, order_number:#kevi-640529')).toBe('#KEVI-640529');
    expect(extractShippingOrderNumber('no order here')).toBe('');
  });

  it('accepts an exact metadata match', () => {
    expect(reconcileShippingExpense({ sourceOrderNumber: '#gpwt-916083', date: '2026-07-11' }, orders)).toMatchObject({
      shippingOrderNumber: '#GPWT-916083',
      shippingMatchMethod: 'metadata',
      shippingMatchStatus: 'matched',
    });
  });

  it('distinguishes an exact Shippo Order association', () => {
    expect(reconcileShippingExpense({ sourceOrderNumber: '#KEVI-640529', sourceOrderMethod: 'shippo-order', date: '2026-07-11' }, orders)).toMatchObject({
      shippingOrderNumber: '#KEVI-640529',
      shippingMatchMethod: 'shippo-order',
      shippingMatchStatus: 'matched',
    });
  });

  it('suggests one recipient match but does not finalize it', () => {
    expect(reconcileShippingExpense({ recipientEmail: 'DAVE@example.com', date: '2026-07-12' }, orders)).toMatchObject({
      shippingSuggestedOrderNumber: '#GPWT-916083',
      shippingMatchMethod: 'recipient',
      shippingMatchStatus: 'suggested',
    });
  });

  it('marks multiple recipient candidates ambiguous', () => {
    const duplicated = [...orders, { ...orders[0], num: '#OTHER-100000' }];
    expect(reconcileShippingExpense({ recipientEmail: 'dave@example.com', date: '2026-07-12' }, duplicated)).toMatchObject({
      shippingMatchStatus: 'ambiguous',
      shippingCandidateOrderNumbers: ['#GPWT-916083', '#OTHER-100000'],
    });
  });

  it('does not suggest a recipient outside the seven-day window', () => {
    expect(reconcileShippingExpense({ recipientEmail: 'dave@example.com', date: '2026-07-25' }, orders).shippingMatchStatus).toBe('unmatched');
  });

  it('enriches a Shippo expense without replacing its accounting fields', () => {
    const result = enrichShippoExpense(
      { ref: 'shippo:tx1', amount: 9.35, baseAmount: 9.35 },
      { object_id: 'tx1', metadata: 'order_number:#GPWT-916083', shipment: 'shp1' },
      { object_id: 'shp1', address_to: { email: 'dave@example.com', name: 'Dave Hebb', zip: '12409' } },
      {},
      orders,
    );
    expect(result).toMatchObject({
      ref: 'shippo:tx1', amount: 9.35, baseAmount: 9.35,
      shippoTransactionId: 'tx1', shippoShipmentId: 'shp1',
      shippingOrderNumber: '#GPWT-916083', shippingMatchStatus: 'matched',
    });
  });

  it('stages existing-expense enrichment without live mutation until persistence is accepted', () => {
    const existing = { ref: 'shippo:tx1', shippingMatchStatus: 'unmatched', recipientName: 'Prior Name' };
    const staged = stageShippoExpenseEnrichment(
      existing,
      { object_id: 'tx1', metadata: 'order_number:#GPWT-916083' },
      { object_id: 'shp1', address_to: { name: 'Dave Hebb' } },
      {},
      orders,
      true,
    );

    expect(existing).toMatchObject({ shippingMatchStatus: 'unmatched', recipientName: 'Prior Name' });
    applyShippoExpenseEnrichments([staged]);
    expect(existing).toMatchObject({
      shippingOrderNumber: '#GPWT-916083',
      shippingMatchMethod: 'metadata',
      shippingMatchStatus: 'matched',
      recipientName: 'Dave Hebb',
    });
  });

  it('preserves coherent prior reconciliation data when Shippo context lookup fails', () => {
    const existing = {
      ref: 'shippo:tx1',
      recipientName: 'Prior Name',
      shippingSuggestedOrderNumber: '#GPWT-916083',
      shippingMatchMethod: 'recipient',
      shippingMatchStatus: 'suggested',
    };

    const staged = stageShippoExpenseEnrichment(existing, { object_id: 'tx1' }, {}, {}, orders, false);

    expect(staged).toBeNull();
    expect(existing).toEqual({
      ref: 'shippo:tx1',
      recipientName: 'Prior Name',
      shippingSuggestedOrderNumber: '#GPWT-916083',
      shippingMatchMethod: 'recipient',
      shippingMatchStatus: 'suggested',
    });
  });

  it('clears stale reconciliation suggestions after a successful unmatched enrichment', () => {
    const result = enrichShippoExpense(
      {
        ref: 'shippo:tx1',
        shippingSuggestedOrderNumber: '#GPWT-916083',
        shippingCandidateOrderNumbers: ['#GPWT-916083'],
        shippingMatchMethod: 'recipient',
        shippingMatchStatus: 'suggested',
      },
      { object_id: 'tx1' },
      { object_id: 'shp1', address_to: { name: 'Someone Else', zip: 'X0X0X0' } },
      {},
      orders,
    );

    expect(result.shippingMatchStatus).toBe('unmatched');
    expect(result).not.toHaveProperty('shippingSuggestedOrderNumber');
    expect(result).not.toHaveProperty('shippingCandidateOrderNumbers');
  });

  it('removes stale reconciliation keys when staged enrichment is applied to the persisted target', () => {
    const existing = {
      ref: 'shippo:tx1',
      shippingOrderNumber: '#OLD-100000',
      shippingSuggestedOrderNumber: '#GPWT-916083',
      shippingCandidateOrderNumbers: ['#GPWT-916083', '#KEVI-640529'],
      shippingMatchMethod: 'recipient',
      shippingMatchStatus: 'ambiguous',
    };
    const staged = stageShippoExpenseEnrichment(
      existing,
      { object_id: 'tx1' },
      { object_id: 'shp1', address_to: { name: 'Someone Else', zip: 'X0X0X0' } },
      {},
      orders,
      true,
    );

    applyShippoExpenseEnrichments([staged]);

    expect(existing).toMatchObject({ shippingMatchMethod: '', shippingMatchStatus: 'unmatched' });
    expect(existing).not.toHaveProperty('shippingOrderNumber');
    expect(existing).not.toHaveProperty('shippingSuggestedOrderNumber');
    expect(existing).not.toHaveProperty('shippingCandidateOrderNumbers');
  });

  it('rolls back manual link fields when persistence fails and only resolves after success', async () => {
    const expense = {
      ref: 'shippo:tx1',
      shippingSuggestedOrderNumber: '#GPWT-916083',
      shippingCandidateOrderNumbers: ['#GPWT-916083', '#KEVI-640529'],
      shippingMatchMethod: 'recipient',
      shippingMatchStatus: 'suggested',
    };
    const failure = new Error('offline');

    await expect(persistManualShippingLink(expense, '#KEVI-640529', async () => {
      expect(expense).toMatchObject({
        shippingOrderNumber: '#KEVI-640529',
        shippingMatchMethod: 'manual',
        shippingMatchStatus: 'matched',
      });
      throw failure;
    })).rejects.toBe(failure);

    expect(expense).toEqual({
      ref: 'shippo:tx1',
      shippingSuggestedOrderNumber: '#GPWT-916083',
      shippingCandidateOrderNumbers: ['#GPWT-916083', '#KEVI-640529'],
      shippingMatchMethod: 'recipient',
      shippingMatchStatus: 'suggested',
    });

    await expect(persistManualShippingLink(expense, '#KEVI-640529', async () => 'saved')).resolves.toBe('saved');
    expect(expense).toEqual({
      ref: 'shippo:tx1',
      shippingOrderNumber: '#KEVI-640529',
      shippingMatchMethod: 'manual',
      shippingMatchStatus: 'matched',
    });
  });

  it('sums multiple linked labels and rounds the base-currency margin', () => {
    const result = linkedShippingSummary(
      { num: '#GPWT-916083', shippingPaid: 12 },
      [
        { shippingOrderNumber: '#GPWT-916083', shippingMatchStatus: 'matched', baseAmount: 5.675 },
        { shippingOrderNumber: '#GPWT-916083', shippingMatchStatus: 'matched', baseAmount: 3.675 },
        { shippingOrderNumber: '#KEVI-640529', shippingMatchStatus: 'matched', baseAmount: 99 },
      ],
      1,
    );
    expect(result).toEqual({ customerPaid: 12, customerBase: 12, postageBase: 9.36, marginBase: 2.64, linkedCount: 2 });
  });

  it('returns null postage and margin when no label is linked', () => {
    expect(linkedShippingSummary({ num: '#GPWT-916083', shippingPaid: 12 }, [], 1)).toEqual({
      customerPaid: 12, customerBase: 12, postageBase: null, marginBase: null, linkedCount: 0,
    });
  });

  it('does not invent a base-currency margin when the order FX rate is unavailable', () => {
    expect(linkedShippingSummary(
      { num: '#GPWT-916083', shippingPaid: 12 },
      [{ shippingOrderNumber: '#GPWT-916083', shippingMatchStatus: 'matched', baseAmount: 9 }],
      0,
    )).toEqual({ customerPaid: 12, customerBase: null, postageBase: 9, marginBase: null, linkedCount: 1 });
  });

  it('keeps a linked label visible when its base conversion is unavailable', () => {
    expect(linkedShippingSummary(
      { num: '#GPWT-916083', shippingPaid: 12 },
      [{ shippingOrderNumber: '#GPWT-916083', shippingMatchStatus: 'matched', baseAmount: null, fxMissing: true }],
      1,
    )).toEqual({ customerPaid: 12, customerBase: 12, postageBase: null, marginBase: null, linkedCount: 1 });
  });
});
