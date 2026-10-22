import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
