import { describe, expect, it } from 'vitest';
import {
  POSTAGE_SOURCE_RANK,
  buildPostageExpense,
  mergePostageCandidates,
  needsAmount,
  normalizeCanadaPostShipment,
  normalizeShippingEmail,
  postageCandidateKey,
  postageCandidateRef,
  readDate,
  readMoney,
} from '../src/lib/postage-intake.js';

const CP_TRACKING = 'EE123456789CA';

const cpShipment = { shipmentId: 'ship-1', trackingPin: CP_TRACKING, createdAt: '2026-09-02T10:00:00Z' };
const cpDetails = {
  'shipment-detail': {
    destination: {
      name: 'Dana Okafor',
      addressDetails: { addressLine1: '43 Palm St', city: 'Ottawa', postalZipCode: 'k1v8l5' },
    },
  },
};
const cpReceipt = { ccReceiptDetails: { chargeAmount: 18.45, currency: 'CAD', authTimestamp: '2026-09-02T10:05:00.000Z' } };

describe('an amount is read or it is blank — never guessed', () => {
  it('reads a plain figure and a formatted one', () => {
    expect(readMoney(18.45)).toBe(18.45);
    expect(readMoney('$18.45')).toBe(18.45);
    expect(readMoney('1,234.56')).toBe(1234.56);
  });

  it('refuses zero, because a label is never free', () => {
    // 0.00 out of a document is a failed read, not a free parcel.
    expect(readMoney(0)).toBeNull();
    expect(readMoney('0.00')).toBeNull();
  });

  it('refuses a negative, which is a refund and a different record', () => {
    expect(readMoney(-5)).toBeNull();
  });

  it('returns null rather than zero for anything unreadable', () => {
    // The whole point: null is honestly missing, 0 silently poisons a total.
    expect(readMoney('')).toBeNull();
    expect(readMoney(null)).toBeNull();
    expect(readMoney(undefined)).toBeNull();
    expect(readMoney('no idea')).toBeNull();
    expect(readMoney(NaN)).toBeNull();
  });
});

describe('reading a date', () => {
  it('keeps an ISO date and trims a timestamp to its day', () => {
    expect(readDate('2026-09-02')).toBe('2026-09-02');
    expect(readDate('2026-09-02T10:05:00.000Z')).toBe('2026-09-02');
  });

  it('parses a written date', () => {
    expect(readDate('September 2, 2026')).toBe('2026-09-02');
  });

  it('answers blank rather than a wrong day', () => {
    // A wrong date puts a label outside every match window.
    expect(readDate('sometime last week')).toBe('');
    expect(readDate('')).toBe('');
  });
});

describe('Canada Post, asked directly', () => {
  it('takes the recipient and the charged amount from the carrier', () => {
    const entry = normalizeCanadaPostShipment(cpShipment, cpDetails, cpReceipt);
    expect(entry).toMatchObject({
      trackingNumber: 'EE123456789CA',
      carrier: 'Canada Post',
      date: '2026-09-02',
      amount: 18.45,
      currency: 'CAD',
      recipientName: 'Dana Okafor',
      recipientPostal: 'k1v8l5',
      source: 'canadapost',
      reference: 'ship-1',
    });
  });

  it('falls back to the price when there is no card receipt to read', () => {
    // The receipt endpoint only covers card-paid, non-manifest shipments, so a
    // contract shipment has none.
    const entry = normalizeCanadaPostShipment(cpShipment, cpDetails, {}, { dueAmount: 21.1 });
    expect(entry.amount).toBe(21.1);
  });

  it('leaves the amount blank when neither answers, rather than inventing one', () => {
    const entry = normalizeCanadaPostShipment(cpShipment, cpDetails, {}, {});
    expect(entry.amount).toBeNull();
    expect(needsAmount(entry)).toBe(true);
  });

  it('survives a shipment with nothing on it', () => {
    expect(() => normalizeCanadaPostShipment()).not.toThrow();
    expect(normalizeCanadaPostShipment().amount).toBeNull();
  });
});

describe('a carrier email, as the AI read it', () => {
  it('takes what the parse found', () => {
    const entry = normalizeShippingEmail({
      trackingNumber: '1Z999AA10123456784',
      amount: '$24.10',
      date: '2026-09-03',
      recipientName: 'Sam Reyes',
      recipientPostal: '60616',
    }, { messageId: 'msg-9', receipt: 'label.pdf' });

    expect(entry).toMatchObject({
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
      amount: 24.1,
      source: 'email',
      reference: 'msg-9',
      receipt: 'label.pdf',
    });
  });

  it('believes the tracking number over the email about who the carrier is', () => {
    // A number's shape is a better witness than a sender's letterhead.
    const entry = normalizeShippingEmail({ trackingNumber: CP_TRACKING, carrier: 'Some Reseller' });
    expect(entry.carrier).toBe('Canada Post');
  });

  it('keeps a carrier the number cannot identify', () => {
    expect(normalizeShippingEmail({ trackingNumber: 'XYZ1', carrier: 'Purolator' }).carrier).toBe('Purolator');
  });

  it('files an email whose amount could not be read', () => {
    const entry = normalizeShippingEmail({ trackingNumber: CP_TRACKING, amount: 'see attached' });
    expect(entry.amount).toBeNull();
    expect(needsAmount(entry)).toBe(true);
  });
});

describe('deciding two records are the same label', () => {
  it('uses the tracking number, which every source agrees about verbatim', () => {
    const fromCp = normalizeCanadaPostShipment(cpShipment, cpDetails, cpReceipt);
    const fromEmail = normalizeShippingEmail({ trackingNumber: 'ee 123 456 789 ca' }, { messageId: 'm1' });
    expect(postageCandidateKey(fromCp)).toBe(postageCandidateKey(fromEmail));
  });

  it('falls back to the source id when no tracking number was given', () => {
    const a = normalizeShippingEmail({ amount: 5 }, { messageId: 'm1' });
    const b = normalizeShippingEmail({ amount: 5 }, { messageId: 'm2' });
    expect(postageCandidateKey(a)).not.toBe(postageCandidateKey(b));
  });

  it('keeps two different labels apart on content alone as a last resort', () => {
    const a = normalizeShippingEmail({ carrier: 'UPS', date: '2026-09-01', amount: 10 });
    const b = normalizeShippingEmail({ carrier: 'UPS', date: '2026-09-02', amount: 10 });
    expect(postageCandidateKey(a)).not.toBe(postageCandidateKey(b));
  });

  it('names the ledger ref after the tracking number', () => {
    expect(postageCandidateRef(normalizeShippingEmail({ trackingNumber: CP_TRACKING })))
      .toBe(`postage:${CP_TRACKING}`);
    expect(postageCandidateRef(normalizeShippingEmail({}, { messageId: 'm1' })))
      .toBe('postage-email:m1');
    expect(postageCandidateRef({})).toBe('');
  });
});

describe('which source wins when two describe one label', () => {
  it('ranks the carrier above a read document', () => {
    expect(POSTAGE_SOURCE_RANK.canadapost).toBeGreaterThan(POSTAGE_SOURCE_RANK.email);
    expect(POSTAGE_SOURCE_RANK.email).toBeGreaterThan(POSTAGE_SOURCE_RANK.receipt);
  });

  it('lets the carrier correct an amount the email got wrong', () => {
    const fromEmail = normalizeShippingEmail({ trackingNumber: CP_TRACKING, amount: 99.99 }, { messageId: 'm1' });
    const fromCp = normalizeCanadaPostShipment(cpShipment, cpDetails, cpReceipt);
    expect(mergePostageCandidates(fromEmail, fromCp).amount).toBe(18.45);
  });

  it('keeps the PDF the email brought, which the carrier JSON does not have', () => {
    // Taking the higher-ranked record whole would throw the label away.
    const fromEmail = normalizeShippingEmail({ trackingNumber: CP_TRACKING }, { messageId: 'm1', receipt: 'label.pdf' });
    const merged = mergePostageCandidates(fromEmail, normalizeCanadaPostShipment(cpShipment, cpDetails, cpReceipt));
    expect(merged.receipt).toBe('label.pdf');
    expect(merged.source).toBe('canadapost');
  });

  it('never lets a blank beat a known value, whichever way round they arrive', () => {
    const sparseCp = normalizeCanadaPostShipment({ shipmentId: 's1', trackingPin: CP_TRACKING }, {}, {});
    const richEmail = normalizeShippingEmail(
      { trackingNumber: CP_TRACKING, amount: 12.5, recipientName: 'Dana Okafor' }, { messageId: 'm1' });

    expect(mergePostageCandidates(richEmail, sparseCp)).toMatchObject({
      amount: 12.5, recipientName: 'Dana Okafor',
    });
    expect(mergePostageCandidates(sparseCp, richEmail)).toMatchObject({
      amount: 12.5, recipientName: 'Dana Okafor',
    });
  });

  it('copes with only one of the two existing', () => {
    const one = normalizeShippingEmail({ trackingNumber: CP_TRACKING });
    expect(mergePostageCandidates(null, one)).toBe(one);
    expect(mergePostageCandidates(one, null)).toBe(one);
    expect(mergePostageCandidates(null, null)).toBeNull();
  });
});

describe('the expense row it becomes', () => {
  it('lands in the shape the rest of the app already reads', () => {
    const entry = normalizeCanadaPostShipment(cpShipment, cpDetails, cpReceipt);
    const expense = buildPostageExpense(entry, { id: 7 });

    expect(expense).toMatchObject({
      id: 7,
      cat: 'Shipping & Postage',
      currency: 'CAD',
      amount: 18.45,
      baseAmount: 18.45,
      amountUnknown: false,
      date: '2026-09-02',
      ref: `postage:${CP_TRACKING}`,
      trackingNumber: CP_TRACKING,
      trackingCarrier: 'Canada Post',
      recipientName: 'Dana Okafor',
      recipientPostal: 'k1v8l5',
      postageSource: 'canadapost',
    });
  });

  it('flags an unreadable amount and keeps the arithmetic working', () => {
    // A null in a running total turns the whole column into NaN, so the flag is
    // what the screen reads and the zero is never shown as the price.
    const expense = buildPostageExpense(normalizeShippingEmail({ trackingNumber: CP_TRACKING }));
    expect(expense.amountUnknown).toBe(true);
    expect(expense.amount).toBe(0);
    expect(expense.baseAmount).toBe(0);
    expect(Number.isFinite(expense.amount + 1)).toBe(true);
  });

  it('describes itself when the source gave no description', () => {
    const expense = buildPostageExpense(normalizeShippingEmail({ trackingNumber: '1Z999AA10123456784' }));
    expect(expense.desc).toBe('UPS label #1Z999AA10123456784');
  });

  it('carries the recipient, which is what makes matching possible at all', () => {
    // A hand-typed expense has no recipient, and that absence is exactly why
    // linking has always been manual.
    const expense = buildPostageExpense(normalizeCanadaPostShipment(cpShipment, cpDetails, cpReceipt));
    expect(expense.recipientName).toBeTruthy();
    expect(expense.recipientPostal).toBeTruthy();
  });
});
