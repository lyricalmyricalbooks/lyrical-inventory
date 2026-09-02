import { describe, it, expect } from 'vitest';
import {
  diagnoseShipmentRejection,
  describeShipmentRejection,
} from '../src/lib/canadapost-shipment-diagnosis.js';

// ─────────────────────────────────────────────────────────────────────────
// Why this file exists:
//
// Until the Shipping API's OpenAPI definition is committed, the request body
// is derived from the previous API — so the likeliest first live failure is
// Canada Post refusing a field NAME, not a field VALUE. Both come back as a
// validation rejection with a description written for a developer.
//
// Shown raw, "Mandatory field missing: destination postal code" reads to the
// shop owner as though they mistyped an address. If the real cause is the app's
// wording, they spend an afternoon checking an address book for a mistake that
// is not there. Telling the two apart is the entire job here.
// ─────────────────────────────────────────────────────────────────────────

const rejection = (code, description) => JSON.stringify({
  messages: [{ code, description }],
});

describe('a field the owner can actually go and fix', () => {
  it("names the customer's postal code and the panel it lives in", () => {
    const d = diagnoseShipmentRejection({
      status: 400,
      body: rejection('1128', 'Mandatory field missing: destination postal code'),
    });
    expect(d.kind).toBe('fixable');
    expect(d.ownerMessage).toMatch(/customer's postal code/i);
    expect(d.ownerMessage).toMatch(/Destination panel/);
  });

  it('separates the sender side from the destination side', () => {
    const sender = diagnoseShipmentRejection({
      status: 400,
      body: rejection('1130', 'Sender address line 1 is required'),
    });
    expect(sender.ownerMessage).toMatch(/your own address/i);
    expect(sender.ownerMessage).toMatch(/Origin panel/);
  });

  it('points at the parcel panel for a size or weight problem', () => {
    const d = diagnoseShipmentRejection({
      status: 400,
      body: rejection('1200', 'Dimensions exceed the maximum permitted'),
    });
    expect(d.kind).toBe('fixable');
    expect(d.ownerMessage).toMatch(/parcel's size/i);
    expect(d.ownerMessage).toMatch(/Parcel specifications/);
  });

  it('always says nothing was bought, because that is the first worry', () => {
    const d = diagnoseShipmentRejection({
      status: 400,
      body: rejection('1128', 'Mandatory field missing: destination postal code'),
    });
    expect(d.ownerMessage).toMatch(/nothing was bought and nothing was charged/i);
  });
});

describe('a field name the app got wrong, which the owner cannot fix', () => {
  it('recognises an unknown element as the app wording, not a typo', () => {
    const d = diagnoseShipmentRejection({
      status: 400,
      body: rejection('1150', 'Unknown element parcel-characteristics in request'),
    });
    expect(d.kind).toBe('field-mapping');
    expect(d.ownerMessage).toMatch(/not something you typed wrong/i);
    expect(d.ownerMessage).toMatch(/label instruction sheet/i);
  });

  it('says plainly that checking the address will not help', () => {
    const d = diagnoseShipmentRejection({
      status: 400,
      body: rejection('1131', 'Invalid request structure at element sender'),
    });
    expect(d.kind).toBe('field-mapping');
    expect(d.ownerMessage).toMatch(/checking the address will not fix it/i);
  });

  it('does not send the owner hunting when the reason names nothing they control', () => {
    const d = diagnoseShipmentRejection({
      status: 400,
      body: rejection('1400', 'Request could not be processed'),
    });
    expect(d.kind).toBe('unclear');
    expect(d.ownerMessage).toMatch(/does not point at anything on the shipping form/i);
    // Canada Post's own words are kept: they are what anyone helping asks for.
    expect(d.ownerMessage).toMatch(/Request could not be processed/);
  });
});

describe('rejections that are already unambiguous', () => {
  it('leaves an authentication failure to the classifier', () => {
    const d = diagnoseShipmentRejection({
      status: 401,
      body: rejection('AA002', 'Invalid or expired token'),
    });
    expect(d.kind).not.toBe('fixable');
    expect(d.kind).not.toBe('field-mapping');
    expect(d.ownerMessage).toBeTruthy();
  });

  it('survives a body that is not JSON at all', () => {
    const d = diagnoseShipmentRejection({ status: 500, body: '<html>maintenance</html>' });
    expect(d.ownerMessage).toBeTruthy();
    expect(d.messages).toEqual([]);
  });

  it('survives no arguments', () => {
    expect(() => diagnoseShipmentRejection()).not.toThrow();
  });
});

describe('the one-line form that reaches a toast or a thrown error', () => {
  it('keeps the code and description in brackets, since a screenshot is all that survives', () => {
    const sentence = describeShipmentRejection({
      status: 400,
      body: rejection('1128', 'Mandatory field missing: destination postal code'),
    });
    expect(sentence).toMatch(/customer's postal code/i);
    expect(sentence).toMatch(/\(Canada Post 1128: Mandatory field missing: destination postal code\)/);
  });

  it('does not append an empty bracket when there is nothing to reference', () => {
    const sentence = describeShipmentRejection({ status: 500, body: '' });
    expect(sentence).not.toMatch(/\(\s*\)/);
    expect(sentence).not.toMatch(/Canada Post error:/);
  });
});
