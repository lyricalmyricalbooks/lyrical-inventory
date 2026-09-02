import { describe, it, expect, vi, afterEach } from 'vitest';

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
const ARTIFACT_HREF = `${GATEWAY}${ROOT}/artifacts/${CUSTOMER}/shipping/9f3c1b/0`;

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
const shipmentReply = ({ manifestText = 'MANIFEST NOT REQ\nMANIFESTE NON REQ' } = {}) => JSON.stringify({
  shipmentInfo: {
    shipmentId: '406951321983787352',
    trackingPin: TRACKING,
    labelText: manifestText,
    links: {
      link: [
        { '@rel': 'label', '@href': ARTIFACT_HREF, '@media-type': 'application/pdf' },
        { '@rel': 'receipt', '@href': `${GATEWAY}${ROOT}/artifacts/${CUSTOMER}/shipping/9f3c1b/1` },
      ],
    },
  },
});

const CREDS = { apiKey: 'client-id-abc', apiSecret: 'client-secret-xyz', customerNumber: CUSTOMER };

afterEach(() => {
  vi.restoreAllMocks();
  delete global.fetch;
  localStorage.clear();
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
    expect(request.targetEndpoint).toBe(`${GATEWAY}${ROOT}/${CUSTOMER}/${CUSTOMER}/shipments`);
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

  it('warns about the manifest when the same flow produces a label that needs one', async () => {
    const { buyCanadaPostLabel } = await import('../src/lib/canadapost.js');

    // Same parcel, same call — only the label wording differs, in the
    // abbreviated form Canada Post actually prints.
    const body = shipmentReply({ manifestText: 'MANIFEST REQ\nMANIFESTE REQUIS' });
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

    expect(result.manifestSignal).toBe('required');
    expect(result.manifestRequired).toBe(true);
    expect(result.nextStep).toMatch(/surcharge/i);
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
