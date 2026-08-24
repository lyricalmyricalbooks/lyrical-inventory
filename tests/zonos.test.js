import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeDimUnit,
  normalizeWeightUnit,
  estimateOfflineLandedCost,
  formatLandedCostBreakdown,
  testZonosConnection,
  calculateZonosLandedCost,
  ZONOS_GRAPHQL_ENDPOINT
} from '../src/lib/zonos.js';

describe('Zonos Landed Cost & Duty Engine', () => {
  describe('Unit Normalization', () => {
    it('normalizes dimension units to Zonos enum values', () => {
      expect(normalizeDimUnit('in')).toBe('INCH');
      expect(normalizeDimUnit('inch')).toBe('INCH');
      expect(normalizeDimUnit('inches')).toBe('INCH');
      expect(normalizeDimUnit('cm')).toBe('CENTIMETER');
      expect(normalizeDimUnit('centimeter')).toBe('CENTIMETER');
      expect(normalizeDimUnit('mm')).toBe('MILLIMETER');
      expect(normalizeDimUnit('ft')).toBe('FOOT');
      expect(normalizeDimUnit('invalid')).toBe('INCH');
      expect(normalizeDimUnit(null)).toBe('INCH');
    });

    it('normalizes weight units to Zonos enum values', () => {
      expect(normalizeWeightUnit('lb')).toBe('POUND');
      expect(normalizeWeightUnit('lbs')).toBe('POUND');
      expect(normalizeWeightUnit('pound')).toBe('POUND');
      expect(normalizeWeightUnit('oz')).toBe('OUNCE');
      expect(normalizeWeightUnit('kg')).toBe('KILOGRAM');
      expect(normalizeWeightUnit('g')).toBe('GRAM');
      expect(normalizeWeightUnit('invalid')).toBe('POUND');
      expect(normalizeWeightUnit(null)).toBe('POUND');
    });
  });

  describe('estimateOfflineLandedCost', () => {
    it('evaluates US Section 321 de minimis threshold ($800 USD / ~$1080 CAD)', () => {
      const under = estimateOfflineLandedCost({
        destCountryCode: 'US',
        declaredValueCad: 50.00,
        shippingCostCad: 15.00
      });
      expect(under.isOfflineEstimate).toBe(true);
      expect(under.destCountryCode).toBe('US');
      expect(under.isDutyFree).toBe(true);
      expect(under.isTaxFree).toBe(true);
      expect(under.totalLandedCost).toBe(0.00);
      expect(under.recommendedIncoterm).toBe('DDP');
      expect(under.deMinimisNote).toContain('US Section 321');

      const over = estimateOfflineLandedCost({
        destCountryCode: 'US',
        declaredValueCad: 1200.00,
        shippingCostCad: 50.00
      });
      expect(over.isTaxFree).toBe(false);
      expect(over.deMinimisNote).toContain('exceeds US $800');
    });

    it('evaluates UK zero-rated status for printed books', () => {
      const uk = estimateOfflineLandedCost({
        destCountryCode: 'GB',
        declaredValueCad: 45.00,
        shippingCostCad: 20.00
      });
      expect(uk.isDutyFree).toBe(true);
      expect(uk.isTaxFree).toBe(true);
      expect(uk.totalLandedCost).toBe(0.00);
      expect(uk.recommendedIncoterm).toBe('DDP');
      expect(uk.deMinimisNote).toContain('UK zero-rates printed books');
    });

    it('evaluates European Union member countries with VAT expectations', () => {
      const de = estimateOfflineLandedCost({
        destCountryCode: 'DE',
        declaredValueCad: 300.00,
        shippingCostCad: 25.00
      });
      expect(de.isDutyFree).toBe(false); // Exceeds €150 duty-free threshold (~$220 CAD)
      expect(de.isTaxFree).toBe(false);
      expect(de.totalLandedCost).toBeGreaterThan(0);
      expect(de.recommendedIncoterm).toBe('DDU');
    });

    it('handles unknown international destinations with safe fallback', () => {
      const br = estimateOfflineLandedCost({
        destCountryCode: 'BR',
        declaredValueCad: 30.00
      });
      expect(br.destCountryCode).toBe('BR');
      expect(br.recommendedIncoterm).toBe('DDU');
      expect(br.deMinimisNote).toContain('Connect Zonos Live API');
    });
  });

  describe('formatLandedCostBreakdown', () => {
    it('formats zero duty and tax results elegantly', () => {
      expect(formatLandedCostBreakdown({
        currencyCode: 'CAD',
        totalLandedCost: 0,
        dutiesAmount: 0,
        taxesAmount: 0,
        feesAmount: 0
      })).toBe('Duty & Tax Free (CAD $0.00)');
    });

    it('formats non-zero itemized breakdown clearly', () => {
      const text = formatLandedCostBreakdown({
        currencyCode: 'CAD',
        dutiesAmount: 1.88,
        taxesAmount: 5.25,
        feesAmount: 3.82,
        totalLandedCost: 10.95
      });
      expect(text).toContain('Duties: CAD $1.88');
      expect(text).toContain('Taxes: CAD $5.25');
      expect(text).toContain('Fees: CAD $3.82');
      expect(text).toContain('Total: CAD $10.95');
    });

    it('handles null or missing calculations defensively', () => {
      expect(formatLandedCostBreakdown(null)).toBe('No landed cost calculation available.');
    });
  });

  describe('testZonosConnection', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('returns error when API key is missing or blank', async () => {
      const res1 = await testZonosConnection('');
      expect(res1.ok).toBe(false);
      expect(res1.error).toContain('API key is required');

      const res2 = await testZonosConnection('   ');
      expect(res2.ok).toBe(false);
    });

    it('returns ok: true when GraphQL ping succeeds', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { __schema: { queryType: { name: 'Query' } } } })
      });

      const res = await testZonosConnection('credential_live_test_key');
      expect(res.ok).toBe(true);
      expect(res.timestamp).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        ZONOS_GRAPHQL_ENDPOINT,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'credentialToken': 'credential_live_test_key'
          })
        })
      );
    });

    it('handles GraphQL error responses gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ errors: [{ message: 'Invalid credentialToken' }] })
      });

      const res = await testZonosConnection('credential_live_invalid');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Invalid credentialToken');
    });

    it('handles network or HTTP failures gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized credentialToken'
      });

      const res = await testZonosConnection('credential_live_bad');
      expect(res.ok).toBe(false);
      expect(res.status).toBe(401);
      expect(res.error).toContain('401');
    });
  });

  describe('calculateZonosLandedCost', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('throws when API key is missing', async () => {
      await expect(calculateZonosLandedCost({
        apiKey: '',
        destination: { countryCode: 'US' }
      })).rejects.toThrow('Zonos API key is required');
    });

    it('correctly constructs variables and parses successful landed cost quote', async () => {
      const mockQuote = {
        id: 'ldct_12345',
        currencyCode: 'CAD',
        method: 'DDP',
        landedCostGuaranteeCode: 'GUARANTEED_123',
        deMinimis: [
          { type: 'DUTY', threshold: 'ABOVE', note: 'Duty applies' },
          { type: 'TAX', threshold: 'BELOW', note: 'Tax free' }
        ],
        amountSubtotals: {
          duties: 1.91,
          taxes: 0,
          fees: 6.38,
          landedCostTotal: 8.29
        },
        duties: [
          { amount: 1.88, description: 'Section 301', note: 'Tariff' }
        ],
        taxes: [],
        fees: [
          { amount: 3.82, description: 'US MPF Fee', type: 'COUNTRY' },
          { amount: 2.56, description: 'Disbursement', type: 'DISBURSEMENT' }
        ]
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            partyCreateWorkflow: [{ id: 'p1' }, { id: 'p2' }],
            itemCreateWorkflow: [{ id: 'i1' }],
            cartonsCreateWorkflow: [{ id: 'c1' }],
            shipmentRatingCreateWorkflow: { id: 'sr1' },
            landedCostCalculateWorkflow: [mockQuote]
          }
        })
      });

      const res = await calculateZonosLandedCost({
        apiKey: 'credential_live_test',
        origin: { countryCode: 'CA', stateCode: 'QC', postalCode: 'H2X 1Y4' },
        destination: { countryCode: 'US', stateCode: 'NY', postalCode: '10001' },
        items: [{ amount: 25.00, hsCode: '490199', description: 'Novel', quantity: 2 }],
        parcel: { length: 10, width: 8, height: 2, dimUnit: 'in', weight: 2.4, weightUnit: 'lb' },
        shippingRate: { amount: 18.50, displayName: 'Canada Post Tracked' },
        incoterm: 'DDP',
        currency: 'CAD'
      });

      expect(res.id).toBe('ldct_12345');
      expect(res.currencyCode).toBe('CAD');
      expect(res.dutiesAmount).toBe(1.91);
      expect(res.taxesAmount).toBe(0);
      expect(res.feesAmount).toBe(6.38);
      expect(res.totalLandedCost).toBe(8.29);
      expect(res.dutiesBreakdown.length).toBe(1);
      expect(res.feesBreakdown.length).toBe(2);

      // Verify request payload
      const calledBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(calledBody.variables.parties[0].location.countryCode).toBe('CA');
      expect(calledBody.variables.parties[1].location.countryCode).toBe('US');
      expect(calledBody.variables.cartons[0].dimensionalUnit).toBe('INCH');
      expect(calledBody.variables.cartons[0].weightUnit).toBe('POUND');
      expect(calledBody.variables.items[0].hsCode).toBe('490199');
      expect(calledBody.variables.items[0].quantity).toBe(2);
      expect(calledBody.variables.landedCost.method).toBe('DDP');
    });

    it('throws meaningful error if GraphQL API returns errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          errors: [{ message: 'Service rating requires valid destination' }]
        })
      });

      await expect(calculateZonosLandedCost({
        apiKey: 'credential_live_test',
        destination: { countryCode: 'XX' }
      })).rejects.toThrow('Zonos calculation error: Service rating requires valid destination');
    });
  });

  describe('Zonos Declaration & Prepay Utilities', () => {
    it('formats and validates 13-character Declaration ID correctly', async () => {
      const { formatDeclarationId, validateDeclarationId } = await import('../src/lib/zonos.js');
      expect(formatDeclarationId('0rcvxj2tkbnwr')).toBe('0rcvxj2tkbnwr');
      expect(formatDeclarationId('0RCVXJ2TKBNWR')).toBe('0rcvxj2tkbnwr');
      expect(formatDeclarationId('0rcr-8py0-fc9yh')).toBe('0rcr8py0fc9yh');
      expect(formatDeclarationId('13chardeclid1extra')).toBe('13chardeclid1');
      expect(formatDeclarationId('')).toBe('');
      expect(formatDeclarationId(null)).toBe('');

      expect(validateDeclarationId('0rcvxj2tkbnwr')).toBe(true);
      expect(validateDeclarationId('0RCR8PY0FC9YH')).toBe(true);
      expect(validateDeclarationId('short')).toBe(false);
      expect(validateDeclarationId('')).toBe(false);
    });

    it('builds pre-filled Zonos Prepay deep link for US destination', async () => {
      const { buildZonosPrepayDeepLink } = await import('../src/lib/zonos.js');
      const url = buildZonosPrepayDeepLink({
        destCountry: 'US',
        destPostalOrZip: '90210',
        destState: 'CA',
        declaredValueCad: 35.00,
        hsCode: '490199',
        itemDescription: 'Paperback novel'
      });

      expect(url).toContain('https://prepay.zonos.com/?');
      expect(url).toContain('destinationCountry=US');
      expect(url).toContain('destinationPostalCode=90210');
      expect(url).toContain('destinationState=CA');
      expect(url).toContain('declaredValue=35.00');
      expect(url).toContain('hsCode=490199');
    });

    it('creates authentic Zonos declaration via two-step workflow (landed cost + declaration)', async () => {
      const { createZonosDeclaration } = await import('../src/lib/zonos.js');

      global.fetch = vi.fn()
        // 1. landed cost calculation mock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              landedCostCalculateWorkflow: [{
                id: 'landed_cost_398d774d-d960-4cf9-832a-ae21edd46b6d',
                currencyCode: 'CAD',
                method: 'DDP',
                landedCostGuaranteeCode: 'NOT_APPLICABLE',
                deMinimis: [{ type: 'BELOW', threshold: '800', note: 'Below US Section 321' }],
                amountSubtotals: { duties: 0, taxes: 0, fees: 0, landedCostTotal: 0 },
                duties: [],
                taxes: [],
                fees: []
              }]
            }
          })
        })
        // 2. declarationCreateWorkflow mock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              declarationCreateWorkflow: [{
                declaration: {
                  id: '0rd4dpkrvc1y9',
                  status: 'OPEN',
                  paymentStatus: 'OPEN',
                  source: 'POST',
                  createdAt: '2026-08-23T21:53:58.729Z'
                },
                errors: []
              }]
            }
          })
        });

      const decl = await createZonosDeclaration({
        apiKey: 'test_key',
        destination: { countryCode: 'US', postalCode: '90210' },
        items: [{ amount: 25.00, description: 'Book', hsCode: '490199', quantity: 1 }]
      });

      expect(decl.ok).toBe(true);
      expect(decl.declarationId).toBe('0rd4dpkrvc1y9');
      expect(decl.isDutyFree).toBe(true);
      expect(decl.qrCodeData).toContain('ZONOS:0rd4dpkrvc1y9:CAD:0');
    });

    it('recognises the canonical lowercase base36 Declaration ID form', async () => {
      const { isCanonicalDeclarationId } = await import('../src/lib/zonos.js');
      expect(isCanonicalDeclarationId('0rd4dpkrvc1y9')).toBe(true);
      expect(isCanonicalDeclarationId('0RD4DPKRVC1Y9')).toBe(false);
      expect(isCanonicalDeclarationId('0rd4dpkrvc1y')).toBe(false);
      expect(isCanonicalDeclarationId('0rd4-dpkrvc1y9')).toBe(false);
      expect(isCanonicalDeclarationId(null)).toBe(false);
    });
  });

  describe('Declaration ID authenticity guardrail', () => {
    const landedCostOnly = () => ({
      ok: true,
      json: async () => ({
        data: {
          landedCostCalculateWorkflow: [{
            id: 'landed_cost_398d774d-d960-4cf9-832a-ae21edd46b6d',
            currencyCode: 'CAD',
            method: 'DDP',
            landedCostGuaranteeCode: 'NOT_APPLICABLE',
            deMinimis: [{ type: 'BELOW', threshold: '800' }],
            amountSubtotals: { duties: 0, taxes: 0, fees: 0, landedCostTotal: 0 },
            duties: [], taxes: [], fees: []
          }]
        }
      })
    });

    const declParams = {
      apiKey: 'test_key',
      destination: { countryCode: 'US', postalCode: '90210' },
      items: [{ amount: 25.00, description: 'Book', hsCode: '490199', quantity: 1 }]
    };

    it('reports failure instead of inventing an ID when the declaration workflow errors', async () => {
      const { createZonosDeclaration } = await import('../src/lib/zonos.js');

      global.fetch = vi.fn()
        .mockResolvedValueOnce(landedCostOnly())
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              declarationCreateWorkflow: [{
                declaration: null,
                errors: [{ message: 'Declaration payment method is not configured', code: 'PAYMENT_REQUIRED' }]
              }]
            }
          })
        });

      const decl = await createZonosDeclaration(declParams);

      // A Declaration ID reaches U.S. customs via Canada Post, so an unissued one
      // must stay empty rather than be replaced with a plausible-looking code.
      expect(decl.ok).toBe(false);
      expect(decl.declarationId).toBe('');
      expect(decl.qrCodeData).toBe('');
      expect(decl.error).toMatch(/payment method is not configured/i);
      // The landed cost figures that did come back are still usable.
      expect(decl.landedCostId).toContain('landed_cost_');
      expect(decl.isDutyFree).toBe(true);
    });

    it('reports failure when the declaration request itself fails outright', async () => {
      const { createZonosDeclaration } = await import('../src/lib/zonos.js');

      global.fetch = vi.fn()
        .mockResolvedValueOnce(landedCostOnly())
        .mockRejectedValue(new Error('Failed to fetch'));

      const decl = await createZonosDeclaration(declParams);
      expect(decl.ok).toBe(false);
      expect(decl.declarationId).toBe('');
      expect(decl.error).toBeTruthy();
    });

    it('produces no ID at all across repeated failures, rather than a fresh random one each time', async () => {
      const { createZonosDeclaration } = await import('../src/lib/zonos.js');
      const results = [];

      for (let i = 0; i < 3; i++) {
        global.fetch = vi.fn()
          .mockResolvedValueOnce(landedCostOnly())
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: { declarationCreateWorkflow: [{ declaration: null, errors: [] }] } })
          });
        results.push(await createZonosDeclaration(declParams));
      }

      expect(results.every(r => r.ok === false)).toBe(true);
      expect(results.every(r => r.declarationId === '')).toBe(true);
      expect(new Set(results.map(r => r.declarationId)).size).toBe(1);
    });
  });
});

