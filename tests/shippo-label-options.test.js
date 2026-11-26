// Shippo label options: signature, insurance and return labels go to Shippo in
// its `extra` block, belong to the quote they were priced with, and a return
// label is saved beside the order instead of shipping it.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { shippoLabelExtras } from '../src/lib/carriers/shippo-rules.js';
import { loadApp, makeBook } from './helpers/load-app.js';

describe('shippoLabelExtras', () => {
  it('is null when nothing is picked', () => {
    expect(shippoLabelExtras({})).toBeNull();
    expect(shippoLabelExtras({ insureAmount: 0 })).toBeNull();
  });
  it('names each option the way Shippo does, money as a string', () => {
    expect(shippoLabelExtras({ signature: true, insureAmount: 80, content: 'Printed books', isReturn: true })).toEqual({
      signature_confirmation: 'STANDARD',
      insurance: { amount: '80.00', currency: 'CAD', content: 'Printed books' },
      is_return: true,
    });
  });
});

describe('on the Shipping tab', () => {
  let app, shipping, fetchMock;
  const $ = (id) => document.getElementById(id);
  const RATE = { object_id: 'rate_1', provider: 'Canada Post', servicelevel: { name: 'Expedited' }, amount: '14.25', currency: 'CAD', estimated_days: 2 };

  beforeAll(async () => {
    app = await loadApp({ books: [makeBook({ id: 'a' })] });
    shipping = await import('../src/features/shipping.js');
  }, 30000);

  beforeEach(() => {
    app.main.TAX_CENTER.settings = { shippoKey: 'shippo_live_x' };
    app.main.TAX_CENTER.businessExpenses = [];
    const fill = {
      'sf-name': 'Shop', 'sf-phone': '4165550142', 'sf-street1': '456 Montrose Ave', 'sf-city': 'Toronto', 'sf-state': 'ON', 'sf-zip': 'M6G 3H1', 'sf-country': 'CA',
      'st-name': 'A Customer', 'st-phone': '9055550100', 'st-street1': '141 Rothsay Ave', 'st-city': 'Hamilton', 'st-state': 'ON', 'st-zip': 'L8M 3G5', 'st-country': 'CA',
      'sp-length': '23', 'sp-width': '15', 'sp-height': '2', 'sp-weight': '0.5', 'so-insure': '',
    };
    for (const [id, value] of Object.entries(fill)) $(id).value = value;
    $('so-signature').checked = false;
    $('so-return').checked = false;
    $('toast').textContent = '';
    fetchMock = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/shipments/')) return new Response(JSON.stringify({ rates: [RATE] }), { status: 200 });
      if (u.includes('/transactions/')) {
        return new Response(JSON.stringify({ status: 'SUCCESS', object_id: 'tx_9', tracking_number: 'RT123', label_url: '' }), { status: 200 });
      }
      return new Response('down', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('sends signature and insurance with the quote', async () => {
    $('so-signature').checked = true;
    $('so-insure').value = '60';
    await shipping.calculateShippoRates();
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/shipments/'));
    expect(JSON.parse(call[1].body).extra).toEqual({
      signature_confirmation: 'STANDARD',
      insurance: { amount: '60.00', currency: 'CAD', content: 'Printed books' },
    });
  });

  it('asks for fresh prices when an option changes after the quote', async () => {
    await shipping.calculateShippoRates();
    $('so-signature').checked = true;
    fetchMock.mockClear();
    await shipping.buyShippoLabel('rate_1', 'Canada Post', 'Expedited', 14.25, 'CAD');
    expect(fetchMock).not.toHaveBeenCalled();
    expect($('toast').textContent).toMatch(/fresh Shippo rates/);
  });

  it('saves a return label beside the order without touching its shipment', async () => {
    const order = { num: 'W-1', shipped: true, shippedDate: '2026-11-01', trackingNumber: 'OUT1', shipName: 'A Customer' };
    app.main.states.a.hist = [order];
    $('ship-prefill-dest').dataset.orderNumber = 'W-1';
    $('so-return').checked = true;
    await shipping.calculateShippoRates();
    expect(JSON.parse(fetchMock.mock.calls.find(([u]) => String(u).includes('/shipments/'))[1].body).extra).toEqual({ is_return: true });

    const done = shipping.buyShippoLabel('rate_1', 'Canada Post', 'Expedited', 14.25, 'CAD');
    // Answer every dialog (address not checked, then the purchase) with OK.
    const titles = [];
    const clicker = setInterval(() => {
      const overlay = $('m-confirm');
      if (overlay && overlay.style.display === 'flex' && !overlay.classList.contains('closing')) {
        titles.push($('m-confirm-title').textContent);
        $('m-confirm-ok').click();
      }
    }, 5);
    try { await done; } finally { clearInterval(clicker); delete $('ship-prefill-dest').dataset.orderNumber; }

    expect(titles).toContain('Purchase Return Label');
    expect(titles).not.toContain('This order already has a label');
    const saved = app.main.states.a.hist[0];
    expect(saved).toMatchObject({ trackingNumber: 'OUT1', shippedDate: '2026-11-01', returnTrackingNumber: 'RT123', returnCarrier: 'canada_post' });
    expect(app.main.TAX_CENTER.businessExpenses[0].desc).toMatch(/^Shippo shipping label #RT123 .*\(return\)$/);
  });
});
