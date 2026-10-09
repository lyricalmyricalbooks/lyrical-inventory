import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { readChitChatsState, saveChitChatsState } from '../src/lib/chitchats-state.js';
let app, shipping;
const account = { clientId: '123', token: 'fake', isTest: false };
const paid = { id: 'CCABC123', status: 'ready', purchase_amount: '9.68', order_id: 'LM-701', to_name: 'Jane', to_postal_code: 'M1M1M1', carrier_tracking_code: 'CCABC123', postage_type: 'chit_chats_select', created_at: '2026-10-01T10:00:00Z', ship_date: '2026-10-02', tracking_url: 'https://chitchats.com/tracking/ccabc123' };
beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'harbour' })] });
  shipping = await import('../src/features/shipping.js');
}, 30000);
beforeEach(async () => {
  localStorage.clear(); localStorage.setItem('lm-sheets-url', 'https://script.google.com/macros/s/fake/exec');
  await app.resetBook('harbour', { hist: [{ num: 'LM-701', chan: 'Website', qty: 1, price: 25, shippingPaid: 12, date: '2026-10-01' }] });
  app.main.TAX_CENTER.settings = { ccClientId: '123', ccToken: 'fake', ccEnabled: true, ccTestMode: false };
  app.main.TAX_CENTER.businessExpenses = [];
  document.getElementById('ship-prefill-dest').dataset.orderNumber = 'LM-701';
  for (const [id, value] of Object.entries({ 'st-name': 'Jane', 'st-street1': '1 Main St', 'st-city': 'Toronto', 'st-state': 'ON', 'st-zip': 'M1M1M1', 'st-country': 'CA', 'sp-qty': '1', 'sp-customs-value': '25', 'sp-customs-description': 'Books', 'sp-weight': '250', 'sp-weight-unit': 'g', 'sp-length': '20', 'sp-width': '15', 'sp-height': '2', 'sp-dim-unit': 'cm' })) document.getElementById(id).value = value;
});
function reply(data) { return { ok: true, json: async () => ({ ok: true, status: 200, data }) }; }
describe('Chit Chats portal and accounts', () => {
  it('saves the credentials and staging switch through the real settings form', async () => {
    document.getElementById('tc-cc-client-id').value = '456';
    document.getElementById('tc-cc-token').value = 'new-fake';
    document.getElementById('tc-cc-test-mode').checked = true;
    document.getElementById('tc-cc-enabled').checked = true;
    // Credential fields become authoritative when the owner types into them.
    document.getElementById('tc-cc-token').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('tc-cc-client-id').dispatchEvent(new Event('input', { bubbles: true }));
    await app.window.saveTaxCenterSettings();
    expect(app.cloud.settings.taxCenter.settings).toMatchObject({ ccClientId: '456', ccToken: 'new-fake', ccTestMode: true, ccEnabled: true });
  });
  it('shows real rate buttons and refuses a changed parcel without a charge', async () => {
    const fetch = vi.fn(async () => reply({ shipment: { id: paid.id, status: 'unpaid', rates: [{ postage_type: 'chit_chats_select', postage_description: 'Select', payment_amount: '9.68' }] } }));
    vi.stubGlobal('fetch', fetch);
    await shipping.calculateChitChatsRatesHandler();
    const card = document.getElementById('chitchats-rates-card');
    expect(card.hidden).toBe(false);
    expect(card.textContent).toContain('9.68 CAD');
    document.getElementById('sp-weight').value = '500';
    await shipping.buyChitChatsLabelHandler(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(app.toast()).toMatch(/parcel changed/i);
  });
  it('deduplicates repeated imports and links the confirmed cost to the order', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply([paid])));
    await shipping.importChitChatsShippingHandler();
    await shipping.importChitChatsShippingHandler();
    expect(app.main.TAX_CENTER.businessExpenses).toHaveLength(1);
    expect(app.main.TAX_CENTER.businessExpenses[0]).toMatchObject({ amount: 9.68, baseAmount: 9.68, shippingOrderNumber: '#LM-701' });
    expect(app.main.states.harbour.hist[0]).toMatchObject({ shipped: true, trackingNumber: 'CCABC123', postagePaid: 9.68 });
  });
  it('keeps staging shipments outside the real expense and order ledgers', async () => {
    app.main.TAX_CENTER.settings.ccTestMode = true;
    vi.stubGlobal('fetch', vi.fn(async () => reply([paid])));
    await shipping.importChitChatsShippingHandler();
    expect(app.main.TAX_CENTER.businessExpenses).toHaveLength(0);
    expect(app.main.states.harbour.hist[0].shipped).not.toBe(true);
  });
  it('recovers a completed carrier charge after reload using GET only', async () => {
    saveChitChatsState(account, { purchases: { [paid.id]: { id: paid.id, status: 'pending', orderNumber: 'LM-701' } } });
    const fetch = vi.fn(async (_url, options) => {
      const data = JSON.parse(options.body).payload;
      if (data.isArtifact) return reply(null);
      expect(data.method).toBe('GET');
      return reply({ shipment: paid });
    });
    vi.stubGlobal('fetch', fetch);
    await shipping.checkChitChatsPurchaseHandler(paid.id);
    expect(app.main.TAX_CENTER.businessExpenses).toHaveLength(1);
    expect(readChitChatsState(account).purchases[paid.id].status).toBe('complete');
  });
  it('replays a saved charge offline without contacting a carrier', async () => {
    saveChitChatsState(account, { shipments: { [paid.id]: paid } });
    await app.setOnline(false);
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await shipping.recoverChitChatsRecords();
    expect(app.main.TAX_CENTER.businessExpenses[0].amount).toBe(9.68);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends only documented fields and tidies the draft a changed parcel replaced', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const call = JSON.parse(options.body).payload; calls.push(call);
      const id = calls.filter(item => item.method === 'POST').length === 1 ? 'CCFIRST' : 'CCSECOND';
      return reply({ shipment: { id, status: 'pending', rates: [{ postage_type: 'chit_chats_select', postage_description: 'Select', payment_amount: '9.68' }] } });
    }));
    document.getElementById('st-country').value = 'US'; document.getElementById('st-state').value = 'NY'; document.getElementById('st-zip').value = '10001';
    document.getElementById('sp-customs-hs').value = '4901.99'; document.getElementById('cc-origin-country').value = 'ca';
    await shipping.calculateChitChatsRatesHandler();
    const created = calls[0].jsonPayload;
    expect(created).not.toHaveProperty('order_store');
    expect(Object.keys(created.line_items[0]).sort()).toEqual(['currency_code', 'description', 'hs_tariff_code', 'origin_country', 'quantity', 'value_amount']);
    document.getElementById('sp-weight').value = '400';
    await shipping.calculateChitChatsRatesHandler();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(calls.map(call => call.method)).toEqual(['POST', 'POST', 'DELETE']);
    expect(calls[2].endpoint).toMatch(/\/shipments\/CCFIRST$/);
  });
  it('refuses a drop-off date in the past before contacting Chit Chats', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    document.getElementById('cc-ship-date').value = '2020-01-01';
    await shipping.calculateChitChatsRatesHandler();
    expect(fetch).not.toHaveBeenCalled();
    expect(document.getElementById('chitchats-rates-card').textContent).toMatch(/drop-off date/i);
    document.getElementById('cc-ship-date').value = '';
  });
});

