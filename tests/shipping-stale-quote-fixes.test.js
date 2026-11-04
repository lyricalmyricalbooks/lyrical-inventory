// A Canada Post price is only bought for the parcel it was quoted for; an
// order with no readable country is never turned into a US parcel; a voided
// copy of an order never wins over the live one; and the sender a live label
// prints is the one the go-live check approved.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const buyLabelSpy = vi.fn();
vi.mock('../src/lib/carriers/canadapost.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, buyCanadaPostLabel: (...args) => buyLabelSpy(...args) };
});

let app, shipping;
const $ = (id) => document.getElementById(id);
const fill = (values) => { for (const [id, value] of Object.entries(values)) $(id).value = value; };
const toast = () => $('toast').textContent;
const QUOTES = [{ serviceCode: 'DOM.EP', serviceName: 'Expedited Parcel', totalPrice: 14.25, taxes: 0 }];

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'a' }), makeBook({ id: 'b' })] });
  shipping = await import('../src/features/shipping.js');
}, 30000);

beforeEach(() => {
  buyLabelSpy.mockReset();
  buyLabelSpy.mockRejectedValue(new Error('stop here'));
  app.main.TAX_CENTER.settings = { cpEnabled: true, cpTestMode: true, cpApiKey: 'k', cpApiSecret: 's', cpCustomerNumber: '0001234567' };
  fill({
    'sf-name': 'Shop', 'sf-phone': '4165550142', 'sf-street1': '456 Montrose Ave', 'sf-city': 'Toronto', 'sf-state': 'ON', 'sf-zip': 'M6G 3H1', 'sf-country': 'CA',
    'st-name': 'A Customer', 'st-phone': '9055550100', 'st-street1': '141 Rothsay Ave', 'st-city': 'Hamilton', 'st-state': 'ON', 'st-zip': 'L8M 3G5', 'st-country': 'CA',
    'sp-weight': '0.5',
  });
});

afterEach(() => { try { localStorage.clear(); } catch (_) { /* none */ } });

describe('Canada Post Buy buttons belong to the parcel they were quoted for', () => {
  it('refuses to buy once the address changes after the quote, and clears the stale prices', async () => {
    shipping.renderCanadaPostRatesCard(QUOTES, { stCountryCode: 'CA', isOffline: false, isTest: true });
    expect($('canadapost-rates-card').style.display).toBe('block');
    fill({ 'st-zip': 'V6B 2W9' });
    await shipping.buyCanadaPostLabelHandler('DOM.EP', 'Expedited Parcel', 14.25);
    expect(buyLabelSpy).not.toHaveBeenCalled();
    expect(toast()).toMatch(/parcel changed\. Get fresh Canada Post rates/);
    expect($('canadapost-rates-card').style.display).toBe('none');
  });

  it('refuses to buy once the parcel weight changes', async () => {
    shipping.renderCanadaPostRatesCard(QUOTES, { stCountryCode: 'CA', isOffline: false, isTest: true });
    fill({ 'sp-weight': '2' });
    await shipping.buyCanadaPostLabelHandler('DOM.EP', 'Expedited Parcel', 14.25);
    expect(buyLabelSpy).not.toHaveBeenCalled();
    expect(toast()).toMatch(/parcel changed/);
  });

  it('a quote taken with a blank postal code cannot be bought once the code is typed in', async () => {
    fill({ 'st-zip': '' });
    shipping.renderCanadaPostRatesCard(QUOTES, { stCountryCode: 'CA', isOffline: false, isTest: true });
    fill({ 'st-zip': 'L8M 3G5' });
    await shipping.buyCanadaPostLabelHandler('DOM.EP', 'Expedited Parcel', 14.25);
    expect(buyLabelSpy).not.toHaveBeenCalled();
    expect(toast()).toMatch(/parcel changed/);
  });

  it('hides the Canada Post prices when a different order fills the form', async () => {
    shipping.renderCanadaPostRatesCard(QUOTES, { stCountryCode: 'CA', isOffline: false, isTest: true });
    const select = $('ship-prefill-dest');
    const value = JSON.stringify({ name: 'Other', street1: '1 Main St', city: 'Ottawa', state: 'ON', zip: 'K1A 0B1', country: 'CA' });
    select.innerHTML = `<option value=""></option><option></option>`;
    select.options[1].value = value;
    select.value = value;
    await shipping.onShippoPreFillDestChange();
    expect($('canadapost-rates-card').style.display).toBe('none');
  });

  it('still buys when only the U.S. Declaration ID was pasted in after quoting', async () => {
    shipping.renderCanadaPostRatesCard(QUOTES, { stCountryCode: 'CA', isOffline: false, isTest: true });
    const decl = $('sp-zonos-declaration-id');
    if (decl) decl.value = 'ABCD1234EFGH5';
    const pending = shipping.buyCanadaPostLabelHandler('DOM.EP', 'Expedited Parcel', 14.25);
    await vi.waitFor(() => expect($('m-confirm').style.display).toBe('flex'));
    $('m-confirm-ok').click();
    await pending;
    expect(buyLabelSpy).toHaveBeenCalledTimes(1);
    if (decl) decl.value = '';
  });
});

describe('an order without a readable country', () => {
  it('leaves the country blank instead of making it a US parcel', async () => {
    const select = $('ship-prefill-dest');
    const value = JSON.stringify({ name: 'Somewhere', street1: '1 Rd', city: 'Nowhere', zip: '12345', country: '' });
    select.innerHTML = `<option value=""></option><option></option>`;
    select.options[1].value = value;
    select.value = value;
    await shipping.onShippoPreFillDestChange();
    expect($('st-country').value).toBe('');
  });

  it('Canada Post asks for the country rather than quoting or buying', async () => {
    $('st-country').value = '';
    await shipping.calculateCanadaPostRatesHandler();
    expect(toast()).toMatch(/Choose the recipient’s country before getting Canada Post rates/);
    expect($('canadapost-rates-card').style.display).toBe('none');

    shipping.renderCanadaPostRatesCard(QUOTES, { stCountryCode: 'CA', isOffline: false, isTest: true });
    $('st-country').value = '';
    shipping.renderCanadaPostRatesCard(QUOTES, { stCountryCode: 'CA', isOffline: false, isTest: true });
    await shipping.buyCanadaPostLabelHandler('DOM.EP', 'Expedited Parcel', 14.25);
    expect(buyLabelSpy).not.toHaveBeenCalled();
    expect(toast()).toMatch(/Choose the recipient’s country before buying/);
  });
});

describe('finding an order across books', () => {
  it('prefers the live copy over a voided one, and falls back to the voided one', async () => {
    await app.resetBook('a', { hist: [{ num: '#LM-9', voided: true, qty: 1 }] });
    await app.resetBook('b', { hist: [{ num: '#LM-9', qty: 1 }] });
    expect(shipping.findOrderAcrossBooks('LM-9')).toMatchObject({ bookId: 'b' });
    await app.resetBook('b', { hist: [] });
    expect(shipping.findOrderAcrossBooks('LM-9')).toMatchObject({ bookId: 'a' });
  });
});

describe('the sender on a Canada Post label', () => {
  it('falls back to the saved sender address, not a stand-in, when the form is empty', async () => {
    const saved = { name: 'Saved Shop', phone: '6045550111', street1: '9 Saved St', city: 'Vancouver', state: 'BC', zip: 'V5K 0A1' };
    for (const [k, v] of Object.entries(saved)) localStorage.setItem(`lm-shippo-origin-${k}`, v);
    fill({ 'sf-name': '', 'sf-phone': '', 'sf-street1': '', 'sf-city': '', 'sf-state': '', 'sf-zip': '' });
    shipping.renderCanadaPostRatesCard(QUOTES, { stCountryCode: 'CA', isOffline: false, isTest: true });
    const pending = shipping.buyCanadaPostLabelHandler('DOM.EP', 'Expedited Parcel', 14.25);
    await vi.waitFor(() => expect($('m-confirm').style.display).toBe('flex'));
    $('m-confirm-ok').click();
    await pending;
    expect(buyLabelSpy).toHaveBeenCalledTimes(1);
    expect(buyLabelSpy.mock.calls[0][0].sender).toMatchObject({
      name: 'Saved Shop', phone: '6045550111', address1: '9 Saved St', city: 'Vancouver', province: 'BC', postalCode: 'V5K 0A1',
    });
  });
});
