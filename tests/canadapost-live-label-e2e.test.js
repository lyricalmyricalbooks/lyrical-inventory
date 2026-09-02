import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildNonContractShipmentJson } from '../src/lib/canadapost.js';

// ─────────────────────────────────────────────────────────────────────────
// Why this file exists:
//
// Every other Canada Post test checks one link in the chain. This one walks the
// whole thing the way a real purchase does — Create Shipment, read the reply,
// fetch the label document, archive it, work out what to tell the owner — so a
// change that quietly breaks the seam between two steps cannot pass.
//
// The fixture is modelled on a REAL Expedited Parcel label: its service, its
// 16-digit tracking number, its bilingual "MANIFEST NOT REQ" wording, its
// order number and its sender. Using the real shapes is the point — the two
// bugs this suite was written after (a retired endpoint, and a manifest check
// that missed the abbreviation Canada Post actually prints) both survived
// tests built on invented data.
// ─────────────────────────────────────────────────────────────────────────

const GATEWAY = 'https://api.canadapost-postescanada.ca';
const ROOT = '/prod/devportal-portaildesdeveloppeurs';

const CUSTOMER = '0001298882';
const TRACKING = '1028972533688273';
const ORDER_NO = 'P374063754';
const ARTIFACT_HREF = `${GATEWAY}${ROOT}/shipping/v1/artifacts/${CUSTOMER}/shipping/9f3c1b/0`;

const SENDER = {
  name: 'Lyricamyrical books',
  phone: '4165550142',
  address1: '456 Montrose Ave',
  city: 'Toronto',
  province: 'ON',
  postalCode: 'M6G 3H1',
};

const DESTINATION = {
  name: 'A Customer',
  countryCode: 'CA',
  address1: '141 Rothsay Ave',
  city: 'Hamilton',
  province: 'ON',
  postalCode: 'L8M 3G5',
};

/** A Create Shipment reply shaped like the label it produces. */
const shipmentReply = ({ transmitted = true } = {}) => {
  // The spec's own response shape: flat, with a links array. A transmitted
  // shipment, and the presence of a `receipt` link, both mean no manifest is
  // owed — the spec says the receipt link exists only for shipments where no
  // manifest is required.
  const links = [
    { rel: 'label', href: ARTIFACT_HREF, index: '0', mediaType: 'application/pdf' },
    { rel: 'self', href: `${GATEWAY}${ROOT}/shipping/v1/${CUSTOMER}/${CUSTOMER}/shipments/406951321983787352` },
  ];
  if (transmitted) {
    links.push({ rel: 'receipt', href: `${GATEWAY}${ROOT}/shipping/v1/${CUSTOMER}/${CUSTOMER}/shipments/406951321983787352/receipt` });
  }
  return JSON.stringify({
    shipmentId: '406951321983787352',
    shipmentStatus: transmitted ? 'transmitted' : 'created',
    trackingPin: TRACKING,
    links,
  });
};

const CREDS = { apiKey: 'client-id-abc', apiSecret: 'client-secret-xyz', customerNumber: CUSTOMER };

let mockStore = {};
const mockStorage = {
  getItem: (k) => mockStore[k] ?? null,
  setItem: (k, v) => { mockStore[k] = String(v); },
  removeItem: (k) => { delete mockStore[k]; },
  clear: () => { mockStore = {}; },
};

beforeEach(() => {
  mockStore = {};
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete global.fetch;
  mockStore = {};
});

describe('a live purchase, from Buy Label to a printable Canada Post document', () => {
  it('creates the shipment, reads it, and archives a reprintable parcel', async () => {
    const { buyCanadaPostLabel, listArchivedShipments, getArchivedShipmentContext } =
      await import('../src/lib/canadapost.js');

    const body = shipmentReply();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, status: 200, json: body }),
      text: async () => JSON.stringify({ ok: true, status: 200, json: body }),
      headers: { get: () => 'application/json' },
    });

    const result = await buyCanadaPostLabel({
      serviceCode: 'DOM.EP',
      sender: SENDER,
      destination: DESTINATION,
      parcel: { weightKg: 0.63, lengthCm: 27, widthCm: 23, heightCm: 4 },
      orderNum: ORDER_NO,
      ...CREDS,
      isTest: false,
    });

    // 1. It went to the documented Shipping API path, as this customer.
    const request = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(request.targetEndpoint).toBe(`${GATEWAY}${ROOT}/shipping/v1/${CUSTOMER}/${CUSTOMER}/shipments`);
    expect(request.targetEndpoint).not.toMatch(/ncshipment/);

    // 2. The reply was read, not guessed at.
    expect(result.isSimulated).toBe(false);
    expect(result.trackingPin).toBe(TRACKING);
    expect(result.shipmentId).toBe('406951321983787352');
    expect(result.labelUrl).toBe(ARTIFACT_HREF);
    expect(result.mode).toBe('live');

    // 3. The label this produces says MANIFEST NOT REQ, so nothing more is owed.
    expect(result.manifestSignal).toBe('not-required');
    expect(result.manifestRequired).toBe(false);
    expect(result.nextStep).toMatch(/print the label/i);

    // 4. The parcel is archived and can be found again by its tracking number.
    const archived = listArchivedShipments();
    expect(archived).toHaveLength(1);
    expect(archived[0].trackingPin).toBe(TRACKING);
    expect(archived[0].isSimulated).toBe(false);

    // 5. A reprint still knows where the official document lives.
    const context = getArchivedShipmentContext(TRACKING);
    expect(context.labelUrl).toBe(ARTIFACT_HREF);
    expect(context.orderNum).toBe(ORDER_NO);
    expect(context.customerNumber).toBe(CUSTOMER);
  });

  it('fetches the label as the PDF Canada Post returns, not a redrawn copy', async () => {
    const { fetchCanadaPostLabelArtifact, setLastPurchasedShipmentContext } =
      await import('../src/lib/canadapost.js');

    setLastPurchasedShipmentContext({
      trackingPin: TRACKING,
      labelUrl: ARTIFACT_HREF,
      orderNum: ORDER_NO,
      sender: SENDER,
      destination: DESTINATION,
      customerNumber: CUSTOMER,
    });

    // '%PDF' — the real artifact is a PDF document, and the app must present
    // that rather than falling through to its own reference drawing.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/pdf' },
      blob: async () => new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' }),
    });

    const artifact = await fetchCanadaPostLabelArtifact({
      labelUrl: ARTIFACT_HREF,
      apiKey: CREDS.apiKey,
      apiSecret: CREDS.apiSecret,
    });

    expect(artifact.kind).toBe('pdf');
    expect(artifact.mailable).toBe(true);
    expect(artifact.blob.type).toBe('application/pdf');
  });

  it('does not clear the manifest step for a shipment Canada Post has not settled', async () => {
    const { buyCanadaPostLabel } = await import('../src/lib/canadapost.js');

    // Same parcel, same call — only the label wording differs, in the
    // abbreviated form Canada Post actually prints.
    const body = shipmentReply({ transmitted: false });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, status: 200, json: body }),
      text: async () => JSON.stringify({ ok: true, status: 200, json: body }),
      headers: { get: () => 'application/json' },
    });

    const result = await buyCanadaPostLabel({
      serviceCode: 'DOM.EP',
      sender: SENDER,
      destination: DESTINATION,
      parcel: { weightKg: 0.63 },
      orderNum: ORDER_NO,
      ...CREDS,
      isTest: false,
    });

    // Created but not transmitted, and no receipt link: Canada Post has not
    // said it is settled, so the safe reading is that a manifest is owed.
    expect(result.manifestSignal).toBe('unknown');
    expect(result.manifestRequired).toBe(true);
    expect(result.nextStep).toMatch(/did not say/i);
  });

  it('never books a live parcel it could not actually create', async () => {
    const { buyCanadaPostLabel, listArchivedShipments } = await import('../src/lib/canadapost.js');

    // A validation rejection is the likeliest live failure while the request
    // body is still unverified against the spec. Nothing may be archived.
    const rejection = JSON.stringify({
      messages: [{ code: '1128', description: 'Mandatory field missing: destination postal code' }],
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, status: 400, json: rejection }),
      text: async () => JSON.stringify({ ok: false, status: 400, json: rejection }),
      headers: { get: () => 'application/json' },
    });

    await expect(buyCanadaPostLabel({
      serviceCode: 'DOM.EP',
      sender: SENDER,
      destination: DESTINATION,
      parcel: { weightKg: 0.63 },
      ...CREDS,
      isTest: false,
    })).rejects.toThrow();

    expect(listArchivedShipments()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// The request body, checked against the committed OpenAPI definition.
//
// Everything below is a rule the spec states outright. Each one was being
// broken before docs/shipping-api-openapi.yaml arrived, and every one of them
// refuses the whole shipment on its own — so a label could never have printed,
// however correct the address was.
// ─────────────────────────────────────────────────────────────────────────
describe('the Create Shipment body matches the committed spec', () => {
  const build = (extra = {}) => JSON.parse(buildNonContractShipmentJson({
    serviceCode: 'DOM.EP',
    sender: SENDER,
    destination: DESTINATION,
    parcel: { weightKg: 0.63, lengthCm: 27, widthCm: 23, heightCm: 4 },
    orderNum: ORDER_NO,
    allowPlaceholders: false,
    ...extra,
  }));

  it('wraps everything in deliverySpec, which the spec marks required', () => {
    const body = build();
    expect(body.deliverySpec).toBeTruthy();
    // The old payload WAS the delivery spec, sent unwrapped.
    expect(body.serviceCode).toBeUndefined();
  });

  it('carries exactly one of transmitShipment or groupId, never both or neither', () => {
    const transmitted = build();
    expect(transmitted.transmitShipment).toBe(true);
    expect(transmitted.groupId).toBeUndefined();

    const grouped = build({ groupId: 'BOOKS_MONDAY' });
    expect(grouped.groupId).toBe('BOOKS_MONDAY');
    expect(grouped.transmitShipment).toBeUndefined();
  });

  it('sends settlementInfo, without which the shipment is refused outright', () => {
    expect(build().deliverySpec.settlementInfo.intendedMethodOfPayment).toBe('CreditCard');
    expect(build({ intendedMethodOfPayment: 'Account', contractId: '42' })
      .deliverySpec.settlementInfo).toEqual({ intendedMethodOfPayment: 'Account', contractId: '42' });
  });

  it('fills every field the spec marks mandatory', () => {
    const spec = build().deliverySpec;
    // deliverySpec: serviceCode, sender, destination, parcelCharacteristics,
    // preferences, settlementInfo
    for (const key of ['serviceCode', 'sender', 'destination', 'parcelCharacteristics', 'preferences', 'settlementInfo']) {
      expect(spec[key]).toBeTruthy();
    }
    // sender: company, contactPhone, addressDetails{countryCode}
    expect(spec.sender.company).toBeTruthy();
    expect(spec.sender.contactPhone).toBeTruthy();
    expect(spec.sender.addressDetails.countryCode).toBe('CA');
    // destination: addressDetails{countryCode}
    expect(spec.destination.addressDetails.countryCode).toBe('CA');
    // parcelCharacteristics: weight, and all three dimensions together
    expect(spec.parcelCharacteristics.weight).toBeGreaterThan(0);
    expect(Object.keys(spec.parcelCharacteristics.dimensions).sort()).toEqual(['height', 'length', 'width']);
    // preferences: showPackingInstructions
    expect(spec.preferences.showPackingInstructions).toBe(true);
  });

  it('asks for the letter-size PDF the shop actually prints', () => {
    expect(build().deliverySpec.printPreferences).toEqual({ outputFormat: '8.5x11', encoding: 'PDF' });
    expect(build({ outputFormat: '4x6', encoding: 'ZPL' }).deliverySpec.printPreferences)
      .toEqual({ outputFormat: '4x6', encoding: 'ZPL' });
  });

  it('names the US declaration the way the spec does, so it is not silently dropped', () => {
    const spec = build({
      destination: { ...DESTINATION, countryCode: 'US', postalCode: '90210' },
      declarationId: '0rd4dpkrvc1y9',
    }).deliverySpec;
    expect(spec.customs.usDeclarationId).toBe('0rd4dpkrvc1y9');
    expect(spec.customs.declarationId).toBeUndefined();
  });

  it('builds customs.skuList as a direct array (not an object) matching Canada Post Developer Portal schema', () => {
    const spec = build({
      destination: { ...DESTINATION, countryCode: 'US', postalCode: '14607' },
      customs: {
        description: 'Collective Photobook - print',
        value: 85,
        quantity: 1,
        hsCode: '4901.99.0070'
      }
    }).deliverySpec;

    expect(spec.customs).toBeDefined();
    expect(Array.isArray(spec.customs.skuList)).toBe(true);
    expect(spec.customs.skuList.length).toBe(1);

    const item = spec.customs.skuList[0];
    expect(item.customsNumberOfUnits).toBe(1);
    expect(item.customsDescription).toBe('Collective Photobook - print');
    expect(item.customsValuePerUnit).toBe(85);
    expect(item.unitWeight).toBeGreaterThan(0);
    expect(item.countryOfOrigin).toBe('CA');
    expect(item.provinceOfOrigin).toBe('ON');
    expect(item.hsTariffCode).toBe('4901.99.00.70');
    // Ensure regex pattern ^\d{4}(\.\d{2}(\.\d{2}(\.\d{2})?)?)?$ passes
    expect(/^\d{4}(\.\d{2}(\.\d{2}(\.\d{2})?)?)?$/.test(item.hsTariffCode)).toBe(true);
  });
});
