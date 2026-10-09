import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildChitChatsShipment, getChitChatsRates, buyChitChatsLabel, executeChitChatsProxy, normalizeChitChatsShipment, listChitChatsShipments, chitChatsErrorMessage, verifyChitChatsConnection } from '../src/lib/chitchats.js';

const credentials = { clientId: '123', token: 'test-token', isTest: true };
const parcel = { name: 'Jane', address_1: '1 Main St', city: 'Toronto', province_code: 'ON', postal_code: 'M1M1M1', country_code: 'CA', description: 'Books', value: '25.00', value_currency: 'cad', package_type: 'parcel', weight: 250, weight_unit: 'g', size_x: 20, size_y: 15, size_z: 2, size_unit: 'cm', postage_type: 'unknown' };
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('Chit Chats shipping', () => {
  it('creates an unpaid shipment for rates, keeps the all-in payment amount and shipment ID', async () => {
    const request = vi.fn().mockResolvedValue({ shipment: { id: 'CC123', rates: [{ postage_type: 'chit_chats_select', postage_description: 'Select', purchase_amount: '7.20', payment_amount: '9.68', federal_tax: '0.34' }] } });
    const result = await getChitChatsRates({ ...credentials, payload: parcel, request });
    expect(result.shipment.id).toBe('CC123');
    expect(result.rates[0].totalPrice).toBe(9.68);
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'POST', payload: { postage_type: 'unknown' } });
    expect(request.mock.calls[0][0].endpoint).toBe('https://staging.chitchats.com/api/v1/clients/123/shipments');
  });
  it('saves the purchase intent before charging and polls the same shipment until ready', async () => {
    const events = [];
    const request = vi.fn(async ({ method }) => { events.push(method); return method === 'PATCH' ? {} : { shipment: { id: 'CC123', status: 'ready', purchase_amount: '9.68', postage_label_pdf_url: 'https://staging.chitchats.com/labels/shipments/cc123.pdf?auth_token=x' } }; });
    const result = await buyChitChatsLabel({ ...credentials, shipmentId: 'CC123', postageType: 'chit_chats_select', request, onIntent: () => events.push('saved') });
    expect(events).toEqual(['saved', 'PATCH', 'GET']);
    expect(result.status).toBe('ready');
  });
  it('recovers a purchase by reading only and never repeats the buy request', async () => {
    const request = vi.fn().mockResolvedValue({ shipment: { id: 'CC123', status: 'postage_requested' } });
    await expect(buyChitChatsLabel({ ...credentials, shipmentId: 'CC123', resume: true, request, attempts: 2, wait: async () => {} })).rejects.toMatchObject({ pending: true });
    expect(request.mock.calls.every(([call]) => call.method === 'GET')).toBe(true);
  });
  it('does not turn an unpaid draft into an expense or guess a missing charge', () => {
    expect(normalizeChitChatsShipment({ id: 'draft', status: 'unpaid', purchase_amount: '8' })).toBeNull();
    expect(normalizeChitChatsShipment({ id: 'paid', status: 'ready', purchase_amount: null }).amountUnknown).toBe(true);
    expect(normalizeChitChatsShipment({ id: 'paid', status: 'ready', purchase_amount: '9.68' }).amount).toBe(9.68);
  });
  it('imports a voided label as awaiting a confirmed refund, keeping the charge until then', () => {
    const expense = normalizeChitChatsShipment({ id: 'voided', status: 'voided', purchase_amount: '9.68' });
    expect(expense.amount).toBe(9.68);
    expect(expense.refundRequest).toMatchObject({ id: 'voided', status: 'REQUESTED' });
  });
  it('uses a simple Apps Script request without a CORS preflight', async () => {
    localStorage.setItem('lm-sheets-url', 'https://script.google.com/macros/s/test/exec');
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, status: 200, data: [] }) });
    vi.stubGlobal('fetch', fetch);
    await executeChitChatsProxy({ endpoint: 'https://staging.chitchats.com/api/v1/clients/123/shipments', token: 'test-token' });
    expect(fetch.mock.calls[0][1].headers['Content-Type']).toBe('text/plain;charset=utf-8');
    expect(JSON.parse(fetch.mock.calls[0][1].body).version).toBe(2);
  });
  it('refuses arbitrary proxy destinations before sending credentials', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(executeChitChatsProxy({ endpoint: 'https://evil.example/steal', token: 'secret' })).rejects.toThrow(/endpoint/i);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('paginates imports through the final page', async () => {
    const request = vi.fn().mockResolvedValueOnce([{ id: 'one' }, { id: 'two' }]).mockResolvedValueOnce([{ id: 'three' }]);
    expect(await listChitChatsShipments({ ...credentials, request, limit: 2 })).toHaveLength(3);
    expect(request.mock.calls[1][0].endpoint).toContain('page=2');
  });
  it('validates parcel fields before creating a remote shipment', () => {
    expect(() => buildChitChatsShipment({ ...parcel, weight: 0 })).toThrow(/weight/i);
    expect(() => buildChitChatsShipment({ ...parcel, country_code: 'US' })).toThrow(/customs/i);
  });
  it('re-prices an unchanged draft with refresh instead of creating another', async () => {
    const request = vi.fn(async ({ method }) => method === 'GET' ? { shipment: { id: 'CC123', status: 'pending', rates: [] } }
      : { shipment: { id: 'CC123', status: 'pending', rates: [{ postage_type: 'chit_chats_select', payment_amount: '9.10' }] } });
    const result = await getChitChatsRates({ ...credentials, payload: parcel, shipmentId: 'CC123', request });
    expect(request.mock.calls.map(([call]) => call.method)).toEqual(['GET', 'PATCH']);
    expect(request.mock.calls[1][0].endpoint).toMatch(/\/CC123\/refresh$/);
    expect(result.rates[0].totalPrice).toBe(9.1);
  });
  it('starts a fresh draft when the saved one was deleted in Chit Chats', async () => {
    const request = vi.fn(async ({ method }) => {
      if (method === 'GET') throw Object.assign(new Error('gone'), { status: 404 });
      return { shipment: { id: 'CC999', status: 'pending', rates: [{ postage_type: 'chit_chats_select', payment_amount: '9.68' }] } };
    });
    const result = await getChitChatsRates({ ...credentials, payload: parcel, shipmentId: 'CC123', request });
    expect(result.shipment.id).toBe('CC999');
    expect(request.mock.calls.map(([call]) => call.method)).toEqual(['GET', 'POST']);
  });
  it('refuses to quote a draft that was already bought on the website', async () => {
    const request = vi.fn().mockResolvedValue({ shipment: { id: 'CC123', status: 'ready' } });
    await expect(getChitChatsRates({ ...credentials, payload: parcel, shipmentId: 'CC123', request })).rejects.toMatchObject({ alreadyBought: true });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('asks once more for rates when a new draft comes back without any', async () => {
    const request = vi.fn(async ({ method }) => method === 'POST' ? { shipment: { id: 'CC123', status: 'pending', rates: [] } }
      : { shipment: { id: 'CC123', status: 'pending', rates: [{ postage_type: 'chit_chats_select', payment_amount: '9.68' }] } });
    const result = await getChitChatsRates({ ...credentials, payload: parcel, request });
    expect(request.mock.calls.map(([call]) => call.method)).toEqual(['POST', 'PATCH']);
    expect(result.rates).toHaveLength(1);
  });
  it('treats a refused buy as no charge so the order is not blocked forever', async () => {
    const request = vi.fn(async () => { throw Object.assign(new Error('Chit Chats (422): Insufficient balance'), { status: 422 }); });
    await expect(buyChitChatsLabel({ ...credentials, shipmentId: 'CC123', postageType: 'chit_chats_select', request, onIntent: () => {} }))
      .rejects.toMatchObject({ purchaseFailed: true, message: expect.stringMatching(/No label was bought/) });
  });
  it('keeps a timed-out buy pending, because the charge may have gone through', async () => {
    const request = vi.fn(async () => { throw Object.assign(new Error('timeout'), { status: 504 }); });
    const error = await buyChitChatsLabel({ ...credentials, shipmentId: 'CC123', postageType: 'chit_chats_select', request, onIntent: () => {} }).catch(e => e);
    expect(error.purchaseFailed).toBeUndefined();
  });
  it('releases a saved purchase when Chit Chats still shows an unpaid draft', async () => {
    const request = vi.fn().mockResolvedValue({ shipment: { id: 'CC123', status: 'pending' } });
    await expect(buyChitChatsLabel({ ...credentials, shipmentId: 'CC123', resume: true, request, attempts: 2, wait: async () => {} }))
      .rejects.toMatchObject({ purchaseFailed: true });
    expect(request.mock.calls.every(([call]) => call.method === 'GET')).toBe(true);
  });
  it('reads Chit Chats error bodies in their common shapes', () => {
    expect(chitChatsErrorMessage({ error: { message: 'Bad postal code' } })).toBe('Bad postal code');
    expect(chitChatsErrorMessage({ errors: { postal_code: ['is invalid'] } })).toBe('postal code is invalid');
    expect(chitChatsErrorMessage({ error: 'Not allowed' })).toBe('Not allowed');
    expect(chitChatsErrorMessage(null, 'fallback')).toBe('fallback');
  });
  it('explains a wrong client ID on Test Connection', async () => {
    const request = vi.fn(async () => { throw Object.assign(new Error('Not found'), { status: 404 }); });
    const result = await verifyChitChatsConnection({ ...credentials, request });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/client ID/) });
  });
  it('turns a rejected token into a plain message', async () => {
    localStorage.setItem('lm-sheets-url', 'https://script.google.com/macros/s/test/exec');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, status: 401, data: { error: 'unauthorized' } }) }));
    await expect(executeChitChatsProxy({ endpoint: 'https://chitchats.com/api/v1/clients/123/shipments', token: 'bad' })).rejects.toThrow(/did not accept/);
  });
});
