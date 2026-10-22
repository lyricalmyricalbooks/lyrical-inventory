import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

// The "Get rates" carrier tiles: one per carrier, each showing its cheapest
// price from the last quote and whether it is connected, with the duties
// group shown only for parcels leaving the sender's country.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = read('index.html');
const shipping = read('src/features/shipping.js');

const handlerBody = (name) => {
  const at = shipping.indexOf(`async function ${name}(`);
  expect(at).toBeGreaterThan(-1);
  const next = shipping.indexOf('\nasync function ', at + 1);
  const nextFn = shipping.indexOf('\nfunction ', at + 1);
  return shipping.slice(at, Math.min(...[next, nextFn].filter(i => i > -1)));
};

describe('shipping carrier tiles', () => {
  it('has one tile per carrier, each with a price, note and status line', () => {
    for (const carrier of ['shippo', 'canadapost', 'chitchats']) {
      const at = html.indexOf(`data-carrier="${carrier}"`);
      expect(at).toBeGreaterThan(-1);
      const tile = html.slice(at, html.indexOf('</button>', at));
      expect(tile).toContain('ship-carrier-name');
      expect(tile).toContain('ship-carrier-price');
      expect(tile).toContain('ship-carrier-note');
      expect(tile).toContain('ship-carrier-status');
    }
  });

  it('records each carrier price against the form as it was when quoted', () => {
    expect(handlerBody('calculateShippoRates')).toMatch(/setCarrierTilePrice\('shippo'[\s\S]*fingerprint: quotedFor/);
    expect(handlerBody('calculateCanadaPostRatesHandler')).toMatch(/setCarrierTilePrice\('canadapost'[\s\S]*fingerprint: quotedFor/);
    expect(handlerBody('calculateChitChatsRatesHandler')).toMatch(/setCarrierTilePrice\('chitchats'[\s\S]*fingerprint: quotedFor/);
    // Each handler snapshots the form before its request, not after it answers.
    for (const name of ['calculateShippoRates', 'calculateCanadaPostRatesHandler', 'calculateChitChatsRatesHandler']) {
      const body = handlerBody(name);
      expect(body.indexOf('const quotedFor = shippingFormFingerprint()')).toBeLessThan(body.indexOf('setCarrierTilePrice('));
    }
  });

  it('starts the duties group hidden and lets the tile renderer reveal it for international parcels', () => {
    expect(html).toMatch(/id="ship-abroad-group" hidden/);
    expect(shipping).toMatch(/abroad\.hidden = !shippoRateFormState\(\)\.international/);
  });

  it('refreshes the tiles whenever the readiness line does, so edits clear stale prices', () => {
    const at = shipping.indexOf('function renderShippoRateReadiness()');
    expect(shipping.slice(at, at + 200)).toContain('renderCarrierTiles();');
  });
});

describe('shipping carrier tiles in the app', () => {
  let app, shipping;
  const tile = (key) => document.querySelector(`#tab-shipping .ship-carrier[data-carrier="${key}"]`);
  const fill = (values) => { for (const [id, value] of Object.entries(values)) document.getElementById(id).value = value; };

  beforeAll(async () => {
    app = await loadApp({ books: [makeBook({ id: 'harbour' })] });
    shipping = await import('../src/features/shipping.js');
  }, 30000);

  beforeEach(() => {
    app.main.TAX_CENTER.settings = { shippoKey: 'shippo_test_x', ccClientId: '1', ccToken: 't', ccEnabled: true };
    fill({ 'sf-country': 'CA', 'st-country': 'CA', 'st-zip': 'M1M1M1', 'sp-weight': '250' });
    for (const key of ['shippo', 'canadapost', 'chitchats']) shipping.setCarrierTilePrice(key, []);
  });

  it('marks only the lowest real quote once two carriers are priced', () => {
    shipping.setCarrierTilePrice('shippo', [14.62]);
    expect(tile('shippo').querySelector('.ship-carrier-badge').hidden).toBe(true);
    shipping.setCarrierTilePrice('chitchats', [9.68, 12]);
    expect(tile('chitchats').classList.contains('is-cheapest')).toBe(true);
    expect(tile('chitchats').querySelector('.ship-carrier-badge').hidden).toBe(false);
    expect(tile('shippo').classList.contains('is-cheapest')).toBe(false);
    expect(tile('chitchats').querySelector('.ship-carrier-price').textContent).toBe('From 9.68 CAD');
  });

  it('never crowns an estimate or a price in another currency', () => {
    shipping.setCarrierTilePrice('shippo', [14.62]);
    shipping.setCarrierTilePrice('canadapost', [5], { estimate: true });
    shipping.setCarrierTilePrice('chitchats', [3], { currency: 'USD' });
    for (const key of ['shippo', 'canadapost', 'chitchats']) expect(tile(key).classList.contains('is-cheapest')).toBe(false);
    expect(tile('canadapost').querySelector('.ship-carrier-price').textContent).toBe('About 5.00 CAD');
  });

  it('drops prices and the highlight once the parcel changes', () => {
    shipping.setCarrierTilePrice('shippo', [14.62]);
    shipping.setCarrierTilePrice('chitchats', [9.68]);
    document.getElementById('sp-weight').value = '500';
    shipping.renderCarrierTiles();
    expect(tile('chitchats').querySelector('.ship-carrier-price').textContent).toBe('');
    expect(tile('chitchats').classList.contains('is-cheapest')).toBe(false);
  });

  it('shows unconnected carriers as switched off', () => {
    app.main.TAX_CENTER.settings = {};
    shipping.renderCarrierTiles();
    expect(tile('shippo').classList.contains('is-unconnected')).toBe(true);
    expect(tile('chitchats').querySelector('.ship-carrier-status').textContent).toMatch(/Tax Centre/);
    expect(tile('canadapost').querySelector('.ship-carrier-status').textContent).toMatch(/estimates only/);
  });

  it('shows the duties group only for a parcel leaving the country', () => {
    shipping.renderCarrierTiles();
    expect(document.getElementById('ship-abroad-group').hidden).toBe(true);
    fill({ 'st-country': 'US' });
    shipping.renderCarrierTiles();
    expect(document.getElementById('ship-abroad-group').hidden).toBe(false);
  });
});
