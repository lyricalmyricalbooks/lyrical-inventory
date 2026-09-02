import { describe, it, expect } from 'vitest';
import { parseCanadaPostShipmentResponse } from '../src/lib/canadapost.js';
import { describeDeclarationStep } from '../src/lib/canadapost-shipment.js';

/**
 * The U.S. duty declaration is the one field on a label that costs the CUSTOMER
 * money when it goes wrong: without it the parcel ships DDU, and U.S. customs
 * either holds it or bills the recipient on delivery. These tests pin the two
 * halves that were silently broken — the ID going out, and the ID coming back.
 */
describe('U.S. Zonos declaration read-back', () => {
  it('reads a Declaration ID echoed inside the customs block (lowercase spelling)', () => {
    const result = parseCanadaPostShipmentResponse({
      shipmentId: '347881315405043605',
      trackingPin: 'LE055392862CA',
      customs: { usdeclarationid: '0rg7s5pjvhxxn' }
    });
    expect(result.declarationId).toBe('0rg7s5pjvhxxn');
  });

  it('reads a Declaration ID echoed inside the customs block (camelCase spelling)', () => {
    const result = parseCanadaPostShipmentResponse({
      shipmentId: '347881315405043605',
      trackingPin: 'LE055392862CA',
      customs: { usDeclarationId: '0rg7rsj5bj63v' }
    });
    expect(result.declarationId).toBe('0rg7rsj5bj63v');
  });

  it('reads a Declaration ID echoed under deliverySpec.customs', () => {
    const result = parseCanadaPostShipmentResponse({
      shipmentId: '347881315405043605',
      trackingPin: 'LE055214725CA',
      deliverySpec: { customs: { usdeclarationid: '0rcvxj2tkbnwr' } }
    });
    expect(result.declarationId).toBe('0rcvxj2tkbnwr');
  });

  it('still prefers a top-level Declaration ID the carrier issued', () => {
    const result = parseCanadaPostShipmentResponse({
      shipmentId: '347881315405043605',
      trackingPin: 'LE055208053CA',
      declarationId: '0rcr8py0fc9yh',
      customs: { usdeclarationid: '0rcvxj2tkbnwr' }
    });
    expect(result.declarationId).toBe('0rcr8py0fc9yh');
  });

  it('rejects an echoed value that is not a valid Declaration ID', () => {
    // A malformed ID is worse than none: shown on screen it reads as proof the
    // duty was prepaid when it was not.
    const result = parseCanadaPostShipmentResponse({
      shipmentId: '347881315405043605',
      trackingPin: 'LE055207945CA',
      customs: { usdeclarationid: 'n/a' }
    });
    expect(result.declarationId).toBe('');
  });

  it('does not let an empty customs block mask a populated one', () => {
    // `customs: {}` is truthy, so a `||` chain would stop there and never reach
    // the populated deliverySpec block below it.
    const result = parseCanadaPostShipmentResponse({
      shipmentId: '347881315405043605',
      trackingPin: 'LE055207778CA',
      customs: {},
      deliverySpec: { customs: { usdeclarationid: '0rcr209pkbhzk' } }
    });
    expect(result.declarationId).toBe('0rcr209pkbhzk');
  });

  it('returns no Declaration ID when the response carries none', () => {
    const result = parseCanadaPostShipmentResponse({
      shipmentId: '347881315405043605',
      trackingPin: 'LE055207906CA'
    });
    expect(result.declarationId).toBe('');
  });
});

describe('describeDeclarationStep', () => {
  it('says nothing at all for a non-U.S. parcel', () => {
    expect(describeDeclarationStep('n/a')).toBe('');
  });

  it('reassures without alarming when we supplied the declaration', () => {
    const msg = describeDeclarationStep('sent', '0rg7s5pjvhxxn');
    expect(msg).toMatch(/already paid/i);
    expect(msg).toContain('0rg7s5pjvhxxn');
    expect(msg).not.toMatch(/not been paid|customs can hold/i);
  });

  it('reassures when Canada Post issued the declaration itself', () => {
    const msg = describeDeclarationStep('issued', '0rg7rsj5bj63v');
    expect(msg).toMatch(/Canada Post created/i);
    expect(msg).toContain('0rg7rsj5bj63v');
  });

  it('does not warn when the duty is billed to a Zonos account', () => {
    // The shop's normal Verified Account setup. Canada Post often returns no
    // declaration number here, and warning about it would put a red banner on
    // every U.S. label they buy — the surest way to make the real warning
    // invisible on the day it fires.
    const msg = describeDeclarationStep('account');
    expect(msg).toMatch(/billed to your Zonos account/i);
    expect(msg).toMatch(/covered/i);
    expect(msg).not.toMatch(/not been paid|hold the parcel|NO duty declaration/i);
  });

  it('warns plainly, and only, when a U.S. parcel has no declaration', () => {
    const msg = describeDeclarationStep('missing');
    expect(msg).toMatch(/NO duty declaration/);
    expect(msg).toMatch(/hold the parcel or bill your customer/i);
    // Names the two ways out, in the owner's language.
    expect(msg).toMatch(/Prepay app/i);
    expect(msg).toMatch(/account key/i);
  });
});
