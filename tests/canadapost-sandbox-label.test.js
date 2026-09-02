import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buyCanadaPostLabel } from '../src/lib/canadapost.js';

describe('Canada Post Sandbox Label Purchasing with false 503 gateway signals', () => {
  const testSender = {
    name: 'Lyricalmyrical Books',
    phone: '16474096863',
    address1: '456 Montrose Ave',
    city: 'Toronto',
    province: 'ON',
    postalCode: 'M6G3H1',
    countryCode: 'CA'
  };

  const testDestination = {
    name: 'Spiros Xanthios',
    phone: '14169998475',
    address1: '620 Dovercourt Rd',
    city: 'Toronto',
    state: 'ON',
    postalCode: 'M6H2W6',
    countryCode: 'CA'
  };

  const testParcel = {
    lengthCm: 23,
    widthCm: 19.5,
    heightCm: 2,
    weightKg: 0.367
  };

  const creds = {
    apiKey: 'd1d36298650efe474806c94f75cfb04a',
    apiSecret: 'e28414726399d6bec930f43338762496',
    customerNumber: '0001298882'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('successfully creates a simulated test label in Sandbox mode when gateway returns HTTP 503', async () => {
    global.fetch = vi.fn().mockImplementation(async (url) => {
      // Return 503 envelope simulating gateway outage or unsupported test endpoint
      const envelope = {
        ok: false,
        status: 503,
        error: "Canada Post's own gateway returned HTTP 503. This is an outage on their side, not a problem with your key."
      };
      return {
        ok: true,
        text: async () => JSON.stringify(envelope),
        json: async () => envelope
      };
    });

    const result = await buyCanadaPostLabel({
      serviceCode: 'DOM.RP',
      sender: testSender,
      destination: testDestination,
      parcel: testParcel,
      orderNum: 'ANMU-317259',
      ...creds,
      isTest: true
    });

    expect(result).toBeDefined();
    expect(result.isSimulated).toBe(true);
    expect(result.trackingPin).toMatch(/^7012\d+/);
    expect(result.labelUrl).toContain('local://canadapost/label/');
  });

  it('refuses and throws error when gateway returns HTTP 503 in Live Production mode', async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      const envelope = {
        ok: false,
        status: 503,
        error: "Canada Post's own gateway returned HTTP 503. This is an outage on their side, not a problem with your key."
      };
      return {
        ok: true,
        text: async () => JSON.stringify(envelope),
        json: async () => envelope
      };
    });

    await expect(buyCanadaPostLabel({
      serviceCode: 'DOM.RP',
      sender: testSender,
      destination: testDestination,
      parcel: testParcel,
      orderNum: 'ANMU-317259',
      ...creds,
      isTest: false
    })).rejects.toThrow(/503|outage/i);
  });
});
