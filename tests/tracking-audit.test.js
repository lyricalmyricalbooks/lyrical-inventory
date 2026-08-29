import { describe, it, expect } from 'vitest';
import {
  looksLikeCanadaPostPin,
  normalizeTrackingPin,
  collectVerifiableShipments,
  classifyTrackingResult,
  summarizeTrackingAudit,
  describeTrackingAudit,
} from '../src/lib/tracking-audit.js';

describe('picking which shipped orders to ask Canada Post about', () => {
  it('recognises Canada Post PIN shapes without judging authenticity', () => {
    expect(looksLikeCanadaPostPin('70123456789012345'.slice(0, 16))).toBe(true);
    expect(looksLikeCanadaPostPin('7012 3456 7890')).toBe(true);
    expect(looksLikeCanadaPostPin('12345678901')).toBe(true);
    expect(looksLikeCanadaPostPin('1234567890')).toBe(false);
    expect(looksLikeCanadaPostPin('12345678901234567')).toBe(false);
    expect(looksLikeCanadaPostPin('')).toBe(false);
    expect(normalizeTrackingPin('7012 3456-7890 12')).toBe('70123456789012');
  });

  it('takes shipped orders carrying a Canada Post tracking number', () => {
    const orders = [
      { num: 'A-1', shipped: true, trackingNumber: '7012345678901234', carrier: 'canadapost' },
      { num: 'A-2', shipped: true, trackingNumber: '7012345678905678' },
      { num: 'A-3', shipped: false, trackingNumber: '7012345678909999' },
      { num: 'A-4', shipped: true },
      { num: 'A-5', shipped: true, trackingNumber: '7012345678901111', voided: true },
    ];

    const picked = collectVerifiableShipments(orders);
    expect(picked.map(p => p.orderNum)).toEqual(['A-1', 'A-2']);
    expect(picked[0].pin).toBe('7012345678901234');
  });

  it('leaves another carrier\'s tracking number alone', () => {
    // A USPS/Shippo number would simply come back "not found" and read as a
    // false alarm, so it is never sent to a Canada Post lookup.
    const orders = [
      { num: 'S-1', shipped: true, trackingNumber: '9405511899223197428490', carrier: 'shippo' },
      { num: 'S-2', shipped: true, trackingNumber: 'LZ123456789US' },
      { num: 'C-1', shipped: true, trackingNumber: '7012345678901234', carrier: 'canadapost' },
    ];
    expect(collectVerifiableShipments(orders).map(p => p.orderNum)).toEqual(['C-1']);
  });

  it('asks about one parcel once, however many orders reference it', () => {
    const orders = [
      { num: 'B-1', shipped: true, trackingNumber: '7012345678901234', carrier: 'canadapost' },
      { num: 'B-2', shipped: true, trackingNumber: '7012 3456 7890 1234', carrier: 'canadapost' },
    ];
    const picked = collectVerifiableShipments(orders);
    expect(picked).toHaveLength(1);
    expect(picked[0].orderNum).toBe('B-1');
  });

  it('handles an empty or missing order list', () => {
    expect(collectVerifiableShipments([])).toEqual([]);
    expect(collectVerifiableShipments(null)).toEqual([]);
    expect(collectVerifiableShipments([null, undefined])).toEqual([]);
  });
});

describe('reading what Canada Post said back', () => {
  it('counts a found parcel as verified', () => {
    const v = classifyTrackingResult({ result: { found: true, status: 'Delivered' } });
    expect(v.status).toBe('verified');
    expect(v.detail).toBe('Delivered');
  });

  it('counts an explicit "no such PIN" as missing', () => {
    expect(classifyTrackingResult({ error: new Error('Canada Post [004]: No Pin History') }).status).toBe('missing');
    expect(classifyTrackingResult({ error: new Error('No tracking record found') }).status).toBe('missing');
    expect(classifyTrackingResult({}).status).toBe('missing');
  });

  it('never reports an unreachable gateway as a missing parcel', () => {
    // Offline is not evidence about the parcel; conflating the two would send
    // someone chasing a shipment that is perfectly fine.
    const offline = classifyTrackingResult({ error: new Error('Failed to fetch') });
    expect(offline.status).toBe('unchecked');
    expect(offline.detail).toMatch(/Failed to fetch/);

    const unconfigured = classifyTrackingResult({ error: new Error('Add your Canada Post API key') });
    expect(unconfigured.status).toBe('unchecked');
  });
});

describe('summarising the sweep', () => {
  const verdicts = [
    { status: 'verified' }, { status: 'verified' },
    { status: 'missing' },
    { status: 'unchecked' },
  ];

  it('counts each verdict', () => {
    expect(summarizeTrackingAudit(verdicts)).toEqual({ total: 4, verified: 2, missing: 1, unchecked: 1 });
    expect(summarizeTrackingAudit([])).toEqual({ total: 0, verified: 0, missing: 0, unchecked: 0 });
  });

  it('leads with the parcels that need action', () => {
    const line = describeTrackingAudit(summarizeTrackingAudit(verdicts));
    expect(line).toMatch(/^Checked 4 shipped orders: 1 tracking number Canada Post has no record of/);
    expect(line).toContain('2 confirmed');
    expect(line).toContain('1 could not be checked');
  });

  it('says so plainly when there is nothing to check', () => {
    expect(describeTrackingAudit(summarizeTrackingAudit([]))).toMatch(/No shipped orders/);
    expect(describeTrackingAudit(null)).toMatch(/No shipped orders/);
  });

  it('reads naturally for a single clean parcel', () => {
    const line = describeTrackingAudit(summarizeTrackingAudit([{ status: 'verified' }]));
    expect(line).toBe('Checked 1 shipped order: 1 confirmed.');
  });
});
