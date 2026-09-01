import { describe, it, expect, afterEach } from 'vitest';
import {
  CANADAPOST_API_ROOT,
  CANADAPOST_RATING_API,
  CANADAPOST_TRACKING_API,
  CANADAPOST_ARTIFACT_MEDIA_TYPE,
  getCanadaPostShippingApi,
  configureCanadaPostShippingApi,
  isShippingApiConfigured,
  resolveShipmentEndpoint,
  resolveCanadaPostScope,
  SHIPPING_API_UNCONFIGURED_MESSAGE,
} from '../src/lib/canadapost-endpoints.js';

// ─────────────────────────────────────────────────────────────────────────
// Why this file exists:
//
// The shipment call spent months posting to `/rs/{customer}/ncshipment` — the
// retired Web Services path — against the Developer Portal host, which has no
// such path. Rating had been migrated; shipping had not. Nothing failed loudly:
// the 404 was swallowed and a sandbox run quietly produced a fake shipment, so
// the screen looked like it worked while no label was ever created.
//
// These tests hold the two properties that stop that recurring: every path is
// declared in one registry under the gateway's namespace, and an unconfigured
// API resolves to nothing at all rather than to a plausible-looking guess.
// ─────────────────────────────────────────────────────────────────────────

afterEach(() => {
  configureCanadaPostShippingApi(null);
});

describe('every declared path lives under the Developer Portal namespace', () => {
  it('namespaces rating and tracking, and never uses a retired path shape', () => {
    expect(CANADAPOST_RATING_API.pricesPath.startsWith(CANADAPOST_API_ROOT)).toBe(true);
    expect(CANADAPOST_TRACKING_API.summaryPath.startsWith(CANADAPOST_API_ROOT)).toBe(true);

    for (const path of [CANADAPOST_RATING_API.pricesPath, CANADAPOST_TRACKING_API.summaryPath]) {
      expect(path).not.toMatch(/^\/rs\//);
      expect(path).not.toMatch(/ncshipment/);
      expect(path).not.toMatch(/soa-gw/);
    }
  });

  it('keeps the tracking PIN as a substitutable placeholder rather than a fixed pin', () => {
    expect(CANADAPOST_TRACKING_API.summaryPath).toContain('{pin}');
  });

  it('asks for the label document as a PDF', () => {
    expect(CANADAPOST_ARTIFACT_MEDIA_TYPE).toBe('application/pdf');
  });
});

describe('an unconfigured Shipping API resolves to nothing, not to a guess', () => {
  it('ships unconfigured, so no path is invented for anyone who never sets it', () => {
    expect(isShippingApiConfigured()).toBe(false);
    expect(getCanadaPostShippingApi().createShipmentPath).toBe('');
  });

  it('returns an empty endpoint rather than a URL built from an empty path', () => {
    const endpoint = resolveShipmentEndpoint({
      baseUrl: 'https://api.canadapost-postescanada.ca',
      customerNumber: '0001298882',
    });
    expect(endpoint).toBe('');
  });

  it('explains the gap in words the shop owner can act on, naming the Shipping API', () => {
    expect(SHIPPING_API_UNCONFIGURED_MESSAGE).toMatch(/Shipping API/);
    expect(SHIPPING_API_UNCONFIGURED_MESSAGE).toMatch(/not switched on yet/i);
    // No jargon that would send a non-technical reader looking things up.
    expect(SHIPPING_API_UNCONFIGURED_MESSAGE).not.toMatch(/OpenAPI|OAuth|endpoint|404/i);
  });
});

describe('configuring the Shipping API from the spec', () => {
  it('builds the endpoint, substituting and URL-encoding the customer number', () => {
    configureCanadaPostShippingApi({
      createShipmentPath: '/prod/devportal-portaildesdeveloppeurs/shipping/v1/customers/{customerNumber}/shipments',
    });

    expect(isShippingApiConfigured()).toBe(true);
    expect(resolveShipmentEndpoint({
      baseUrl: 'https://api.canadapost-postescanada.ca',
      customerNumber: '0001298882',
    })).toBe('https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs/shipping/v1/customers/0001298882/shipments');
  });

  it('handles a path with no customer number in it', () => {
    configureCanadaPostShippingApi({ createShipmentPath: '/some/v1/shipments' });
    expect(resolveShipmentEndpoint({
      baseUrl: 'https://api.canadapost-postescanada.ca',
      customerNumber: '0001298882',
    })).toBe('https://api.canadapost-postescanada.ca/some/v1/shipments');
  });

  it('joins base and path exactly once, whatever the punctuation', () => {
    configureCanadaPostShippingApi({ createShipmentPath: 'shipping/v1/shipments' });
    expect(resolveShipmentEndpoint({
      baseUrl: 'https://api.canadapost-postescanada.ca/',
      customerNumber: '1',
    })).toBe('https://api.canadapost-postescanada.ca/shipping/v1/shipments');
  });

  it('lets the scope be corrected without restating the path', () => {
    configureCanadaPostShippingApi({ createShipmentPath: '/a/b', scope: 'merchant' });
    configureCanadaPostShippingApi({ scope: 'shipping' });

    const config = getCanadaPostShippingApi();
    expect(config.createShipmentPath).toBe('/a/b');
    expect(config.scope).toBe('shipping');
  });

  it('ignores keys that are not part of the contract', () => {
    configureCanadaPostShippingApi({ createShipmentPath: '/a/b', somethingElse: 'x' });
    expect(getCanadaPostShippingApi()).not.toHaveProperty('somethingElse');
  });

  it('can be switched back off', () => {
    configureCanadaPostShippingApi({ createShipmentPath: '/a/b' });
    configureCanadaPostShippingApi(null);
    expect(isShippingApiConfigured()).toBe(false);
  });

  it('hands back a copy, so a caller cannot mutate the live configuration', () => {
    configureCanadaPostShippingApi({ createShipmentPath: '/a/b' });
    const snapshot = getCanadaPostShippingApi();
    snapshot.createShipmentPath = '/tampered';
    expect(getCanadaPostShippingApi().createShipmentPath).toBe('/a/b');
  });
});

describe('the OAuth scope a call is minted against', () => {
  it('falls back to the rating scope when an API declares none', () => {
    expect(resolveCanadaPostScope({ scope: '' })).toBe(CANADAPOST_RATING_API.scope);
    expect(resolveCanadaPostScope(undefined)).toBe(CANADAPOST_RATING_API.scope);
  });

  it('uses the API own scope when it has one, since Shipping is a separate subscription', () => {
    expect(resolveCanadaPostScope({ scope: 'shipping' })).toBe('shipping');
  });
});
