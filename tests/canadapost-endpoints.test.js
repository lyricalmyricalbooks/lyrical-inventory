import { describe, it, expect } from 'vitest';
import {
  CANADAPOST_API_ROOT,
  CANADAPOST_RATING_API,
  CANADAPOST_TRACKING_API,
  CANADAPOST_SHIPPING_API,
  CANADAPOST_MANIFEST_API,
  CANADAPOST_ARTIFACT_MEDIA_TYPE,
  CANADAPOST_TOKEN_TTL_SECONDS,
  fillCanadaPostPath,
  joinCanadaPostUrl,
  resolveMobo,
  buildCanadaPostEndpoint,
  resolveShipmentEndpoint,
  resolveListShipmentsEndpoint,
  resolveShipmentDetailsEndpoint,
  resolveShipmentReceiptEndpoint,
  resolveShipmentPriceEndpoint,
  resolveArtifactEndpoint,
  resolveManifestEndpoint,
  resolveCanadaPostScope,
  resolveCanadaPostProduct,
} from '../src/lib/canadapost-endpoints.js';

// ─────────────────────────────────────────────────────────────────────────
// Why this file exists:
//
// The shipment call spent months posting to `/rs/{customer}/ncshipment` — the
// retired Web Services path — against the Developer Portal host, which has no
// such path. Rating had been migrated; shipping had not. Nothing failed loudly.
//
// Every Canada Post path now lives in one registry, and these tests hold the
// properties that stop that recurring: nothing is built inline, no retired
// shape survives, and a path with an unfilled placeholder is refused rather
// than sent to Canada Post to be answered with a confusing 404.
// ─────────────────────────────────────────────────────────────────────────

const BASE = 'https://api.canadapost-postescanada.ca';

describe('no retired path shape survives anywhere in the registry', () => {
  const everyPath = [
    ...Object.values(CANADAPOST_RATING_API),
    ...Object.values(CANADAPOST_TRACKING_API),
    ...Object.values(CANADAPOST_SHIPPING_API),
    ...Object.values(CANADAPOST_MANIFEST_API),
  ].filter(v => typeof v === 'string' && v.startsWith('/'));

  it('namespaces every path under the Developer Portal root', () => {
    expect(everyPath.length).toBeGreaterThan(8);
    for (const path of everyPath) {
      expect(path.startsWith(CANADAPOST_API_ROOT)).toBe(true);
    }
  });

  it('never reintroduces the retired Web Services shapes', () => {
    for (const path of everyPath) {
      expect(path).not.toMatch(/ncshipment/);
      expect(path).not.toMatch(/soa-gw/);
      expect(path).not.toMatch(/^\/rs\//);
      expect(path).not.toMatch(/\/vis\/tracking/);
    }
  });

  it('records the documented Shipping API paths, including the artifact', () => {
    expect(CANADAPOST_SHIPPING_API.createShipmentPath).toContain('/{mailedBy}/{mobo}/shipments');
    expect(CANADAPOST_SHIPPING_API.artifactPath)
      .toContain('/artifacts/{consumerId}/shipping/{artifactId}/{index}');
    expect(CANADAPOST_MANIFEST_API.transmitPath).toContain('/{mailedBy}/{mobo}/manifests');
  });

  it('asks for the label as a PDF and refreshes tokens inside their hour', () => {
    expect(CANADAPOST_ARTIFACT_MEDIA_TYPE).toBe('application/pdf');
    expect(CANADAPOST_TOKEN_TTL_SECONDS).toBe(3600);
  });
});

describe('filling a path refuses to send a half-built URL', () => {
  it('substitutes and URL-encodes every placeholder', () => {
    expect(fillCanadaPostPath('/a/{mailedBy}/b/{mobo}', { mailedBy: '0001298882', mobo: '12 34' }))
      .toBe('/a/0001298882/b/12%2034');
  });

  it('throws rather than sending a literal placeholder to Canada Post', () => {
    // A path containing `{shipmentId}` would be answered with a 404 that reads
    // like a Canada Post problem, when it is really a missing argument here.
    expect(() => fillCanadaPostPath('/a/{mailedBy}/shipments/{shipmentId}', { mailedBy: '1' }))
      .toThrow(/missing \{shipmentId\}/i);
  });

  it('treats a blank value as missing rather than filling in an empty segment', () => {
    expect(() => fillCanadaPostPath('/a/{mailedBy}', { mailedBy: '   ' })).toThrow(/missing/i);
  });

  it('joins base and path exactly once, whatever the punctuation', () => {
    expect(joinCanadaPostUrl(`${BASE}/`, '/x/y')).toBe(`${BASE}/x/y`);
    expect(joinCanadaPostUrl(BASE, 'x/y')).toBe(`${BASE}/x/y`);
  });
});

describe('mailed on behalf of', () => {
  it('defaults to the billing customer, since one shop mails its own parcels', () => {
    expect(resolveMobo({ mailedBy: '0001298882' })).toBe('0001298882');
    expect(resolveMobo({ mailedBy: '0001298882', mobo: '   ' })).toBe('0001298882');
  });

  it('uses an explicit value when Canada Post has issued a separate one', () => {
    expect(resolveMobo({ mailedBy: '0001298882', mobo: '0009999999' })).toBe('0009999999');
  });
});

describe('building the calls that spend money', () => {
  it('builds Create Shipment with mailedBy and mobo', () => {
    expect(resolveShipmentEndpoint({ baseUrl: BASE, customerNumber: '0001298882' }))
      .toBe(`${BASE}${CANADAPOST_API_ROOT}/shipping/v1/0001298882/0001298882/shipments`);
  });

  it('honours a distinct mobo for a platform mailing on behalf of someone else', () => {
    expect(resolveShipmentEndpoint({ baseUrl: BASE, customerNumber: '1111111', mobo: '2222222' }))
      .toBe(`${BASE}${CANADAPOST_API_ROOT}/shipping/v1/1111111/2222222/shipments`);
  });

  it('returns nothing at all without a customer number, rather than a half path', () => {
    expect(resolveShipmentEndpoint({ baseUrl: BASE, customerNumber: '' })).toBe('');
    expect(resolveManifestEndpoint({ baseUrl: BASE, customerNumber: '' })).toBe('');
  });

  it('builds Transmit Shipments, the call that avoids the unmanifested surcharge', () => {
    expect(resolveManifestEndpoint({ baseUrl: BASE, customerNumber: '0001298882' }))
      .toBe(`${BASE}${CANADAPOST_API_ROOT}/shipping/v1/0001298882/0001298882/manifests`);
  });

  it('builds the artifact URL from stored identifiers, for a reprint months later', () => {
    expect(resolveArtifactEndpoint({
      baseUrl: BASE, consumerId: 'CG123', artifactId: 'abc-def', index: 0,
    })).toBe(`${BASE}${CANADAPOST_API_ROOT}/shipping/v1/artifacts/CG123/shipping/abc-def/0`);
  });

  it('returns nothing for an artifact it cannot address', () => {
    expect(resolveArtifactEndpoint({ baseUrl: BASE, consumerId: '', artifactId: 'x' })).toBe('');
    expect(resolveArtifactEndpoint({ baseUrl: BASE, consumerId: 'x', artifactId: '' })).toBe('');
  });

  it('builds any other documented call through the one builder', () => {
    expect(buildCanadaPostEndpoint({
      baseUrl: BASE,
      path: CANADAPOST_SHIPPING_API.voidShipmentPath,
      mailedBy: '0001298882',
      shipmentId: 'S-1',
    })).toBe(`${BASE}${CANADAPOST_API_ROOT}/shipping/v1/0001298882/0001298882/shipments/S-1`);
  });
});

describe('scope and rate-limit bucket per API', () => {
  it('mints every current subscription against the merchant scope', () => {
    expect(resolveCanadaPostScope(CANADAPOST_SHIPPING_API)).toBe('merchant');
    expect(resolveCanadaPostScope(CANADAPOST_RATING_API)).toBe('merchant');
  });

  it('falls back to the rating scope rather than minting against an empty one', () => {
    expect(resolveCanadaPostScope({ scope: '' })).toBe(CANADAPOST_RATING_API.scope);
    expect(resolveCanadaPostScope(undefined)).toBe(CANADAPOST_RATING_API.scope);
  });

  it('separates the rate-limit buckets, since limits differ per product', () => {
    expect(resolveCanadaPostProduct(CANADAPOST_RATING_API)).toBe('rating');
    expect(resolveCanadaPostProduct(CANADAPOST_TRACKING_API)).toBe('tracking');
    expect(resolveCanadaPostProduct(CANADAPOST_SHIPPING_API)).toBe('shipping');
    // A manifest is billed and throttled as part of shipping, not on its own.
    expect(resolveCanadaPostProduct(CANADAPOST_MANIFEST_API)).toBe('shipping');
  });
});

// ─── Reading what was bought, rather than buying ──────────────────────────
// These four are the read half of the Shipping API, added so a label bought on
// canadapost.ca can be found by the app instead of typed into it. Every one of
// them is a GET that spends nothing, and the tests below exist as much to hold
// that line as to check the strings.
describe('Get Shipments and its detail calls', () => {
  const base = { baseUrl: 'https://cp.example', customerNumber: '9999999', mobo: '9999999' };

  it('asks the same path Create Shipment writes to', () => {
    // Same resource, opposite verb — that is the whole shape of this endpoint.
    expect(resolveListShipmentsEndpoint(base))
      .toBe(resolveShipmentEndpoint(base));
  });

  it('carries the date, cap and tracking number the spec defines', () => {
    const url = resolveListShipmentsEndpoint({ ...base, date: '2026-09-02', limit: 25 });
    expect(url).toContain('date=20260902');
    expect(url).toContain('limit=25');

    const byPin = resolveListShipmentsEndpoint({ ...base, trackingPin: 'EE123456789CA' });
    expect(byPin).toContain('tracking-pin=EE123456789CA');
  });

  it('drops a date it cannot render in the spec format', () => {
    // Sent malformed it errors; dropped it falls back to the documented
    // default of today, which is the safer of the two.
    const url = resolveListShipmentsEndpoint({ ...base, date: 'last Tuesday' });
    expect(url).not.toContain('date=');
  });

  it('holds the cap inside the range the spec allows', () => {
    expect(resolveListShipmentsEndpoint({ ...base, limit: 500000 })).toContain('limit=99999');
    expect(resolveListShipmentsEndpoint({ ...base, limit: 0 })).not.toContain('limit=');
    expect(resolveListShipmentsEndpoint({ ...base, limit: -5 })).not.toContain('limit=');
  });

  it('builds the three per-shipment reads', () => {
    const withId = { ...base, shipmentId: 'ship-1' };
    expect(resolveShipmentDetailsEndpoint(withId)).toContain('/shipments/ship-1/details');
    expect(resolveShipmentReceiptEndpoint(withId)).toContain('/shipments/ship-1/receipt');
    expect(resolveShipmentPriceEndpoint(withId)).toContain('/shipments/ship-1/price');
  });

  it('answers nothing without a customer number or a shipment', () => {
    expect(resolveListShipmentsEndpoint({ baseUrl: 'https://cp.example' })).toBe('');
    expect(resolveShipmentDetailsEndpoint({ ...base })).toBe('');
    expect(resolveShipmentReceiptEndpoint({ ...base, shipmentId: '  ' })).toBe('');
  });

  it('never points at anything that spends money or commits a batch', () => {
    // The standing rule is that shipping calls spend real money. These four are
    // the read half and must stay that way.
    const urls = [
      resolveListShipmentsEndpoint({ ...base, date: '2026-09-02' }),
      resolveShipmentDetailsEndpoint({ ...base, shipmentId: 's1' }),
      resolveShipmentReceiptEndpoint({ ...base, shipmentId: 's1' }),
      resolveShipmentPriceEndpoint({ ...base, shipmentId: 's1' }),
    ];
    urls.forEach(url => {
      expect(url).toBeTruthy();
      expect(url).not.toContain('/manifests');
      expect(url).not.toContain('/refund');
    });
  });
});
