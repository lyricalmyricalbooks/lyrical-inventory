import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHarness } from './helpers/extract-decl.js';
import { escapeHtml } from '../src/lib/html.js';
import {
  ADDRESS_FIELD_LABELS,
  SHIPPO_ADDRESSES_V1_URL,
  SHIPPO_VALIDATE_V2_URL,
  addressFromOrder,
  addressSignature,
  addressValidationBlocker,
  buildAddressValidationQuery,
  buildLegacyValidationPayload,
  isDeliverable,
  normalizeAddressVerification,
  orderAddressPatch,
  persistableVerification,
  storedVerificationIsCurrent,
  verificationVerdict,
} from '../src/lib/address-verification.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// The verifier's fetch logic is the part no unit test of the parser can reach:
// which endpoint it calls, when it falls back, and what it puts on screen. It
// lives in a feature module that cannot be imported (main.js has top-level
// Firebase side effects), so it is lifted out of the source and run against
// injected dependencies and a real jsdom form.
const DEST_FIELDS = ['name', 'company', 'phone', 'street1', 'street2', 'city', 'state', 'zip'];

function mountDestinationForm(values = {}) {
  document.body.innerHTML = `
    ${DEST_FIELDS.map(f => `<input id="st-${f}">`).join('')}
    <select id="st-country"><option value="US">US</option><option value="CA">CA</option><option value="GB">GB</option></select>
    <button id="ship-verify-btn">🔍 Verify Address</button>
    <div id="ship-dest-verify-panel" class="addr-verify" hidden></div>
  `;
  Object.entries(values).forEach(([field, value]) => {
    const el = document.getElementById(`st-${field}`);
    if (el) el.value = value;
  });
}

const TORONTO = {
  name: 'Lyricalmyrical Books', street1: '456 Montrose Ave',
  city: 'Toronto', state: 'ON', zip: 'M6G 3H1', country: 'CA',
};

const MARKET_ST = {
  name: 'Wilson', street1: '731 Market Street', street2: '#200',
  city: 'San Francisco', state: 'CA', zip: '94103', country: 'US',
};

const V2_PARTIALLY_VALID = {
  recommended_address: {
    address_line_1: '731 Market St', address_line_2: 'Ste 200', city_locality: 'San Francisco',
    state_province: 'CA', postal_code: '94103-2005', country_code: 'US', name: 'Wilson',
    confidence_result: { score: 'high', code: 'postal_data_match', description: 'Verified to the most granular level possible.' },
  },
  analysis: {
    validation_result: {
      value: 'partially_valid',
      reasons: [{ code: 'address_abbreviation_fixed', type: 'correction', description: 'Address inputted was standardized.' }],
    },
    address_type: 'commercial',
  },
  geo: { latitude: 37.78677, longitude: -122.40437 },
};

const V2_INVALID = {
  analysis: {
    validation_result: {
      value: 'invalid',
      reasons: [{ code: 'zip_post_code_not_found', type: 'error', description: 'The ZIP Code could not be found.' }],
    },
    address_type: 'unknown',
  },
};

const V2_VALID_RESPONSE = {
  analysis: {
    validation_result: {
      value: 'valid',
      reasons: [{ code: 'address_found', type: 'info', description: 'The entire address is present in the database.' }],
    },
    address_type: 'residential',
  },
};

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function buildVerifier({ fetchImpl, taxCenter = { settings: { shippoKey: 'shippo_test_token' } } }) {
  const toasts = [];
  const harness = buildHarness({
    names: [
      'readShippoDestinationAddress',
      'currentDestinationVerification',
      'fetchShippoAddressVerification',
      'VERIFY_TONE_CLASS',
      'renderVerificationReasons',
      'renderVerificationCorrections',
      'renderDestinationVerification',
      'markDestinationVerificationStale',
      'bindDestinationVerificationWatchers',
      'dismissAddressVerification',
      'verifyDestinationAddress',
      'applyVerifiedAddressCorrections',
    ],
    deps: {
      $: (id) => document.getElementById(id),
      fetch: fetchImpl,
      TAX_CENTER: taxCenter,
      showToast: (message, type = 'ok') => { toasts.push({ message, type }); },
      // The real one maps display names to ISO codes; the form here already
      // holds codes, so identity is the honest stand-in.
      normalizeCountryCode: (code) => String(code || '').trim().toUpperCase(),
      onShippoDestCountryChange: () => {},
      escapeHtml,
      console: { error: () => {}, warn: () => {} },
      ADDRESS_FIELD_LABELS,
      SHIPPO_ADDRESSES_V1_URL,
      SHIPPO_VALIDATE_V2_URL,
      addressSignature,
      addressValidationBlocker,
      buildAddressValidationQuery,
      buildLegacyValidationPayload,
      isDeliverable,
      normalizeAddressVerification,
      verificationVerdict,
    },
    moduleState: 'let _destVerification = null;',
    returns: `{
      readShippoDestinationAddress,
      currentDestinationVerification,
      verifyDestinationAddress,
      applyVerifiedAddressCorrections,
      dismissAddressVerification,
      bindDestinationVerificationWatchers,
      renderDestinationVerification,
    }`,
  });
  return { ...harness, toasts, panel: () => document.getElementById('ship-dest-verify-panel') };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('destination address verifier — endpoint selection', () => {
  it('calls Shippo v2 with the renamed query fields and no auth token in the URL', async () => {
    mountDestinationForm(MARKET_ST);
    const fetchImpl = vi.fn(async () => jsonResponse(V2_PARTIALLY_VALID));
    const verifier = buildVerifier({ fetchImpl });

    await verifier.verifyDestinationAddress();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url.startsWith(`${SHIPPO_VALIDATE_V2_URL}?`)).toBe(true);
    const query = new URL(url).searchParams;
    expect(query.get('address_line_1')).toBe('731 Market Street');
    expect(query.get('postal_code')).toBe('94103');
    expect(query.get('country_code')).toBe('US');
    // The token belongs in the header; a URL is logged and cached.
    expect(url).not.toContain('shippo_test_token');
    expect(init.headers.Authorization).toBe('ShippoToken shippo_test_token');
  });

  it('falls back to the legacy validator when v2 is not available to the token', async () => {
    mountDestinationForm(TORONTO);
    const fetchImpl = vi.fn(async (url) => (
      String(url).includes('/v2/')
        ? jsonResponse({ detail: 'Not found.' }, 404)
        : jsonResponse({ ...TORONTO, validation_results: { is_valid: true, messages: [] } })
    ));
    const verifier = buildVerifier({ fetchImpl });

    await verifier.verifyDestinationAddress();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [legacyUrl, legacyInit] = fetchImpl.mock.calls[1];
    expect(legacyUrl).toBe(SHIPPO_ADDRESSES_V1_URL);
    expect(legacyInit.method).toBe('POST');
    expect(JSON.parse(legacyInit.body).validate).toBe(true);
    expect(verifier.panel().className).toContain('ok');
    expect(verifier.panel().innerHTML).toContain('Shippo legacy');
  });

  it('does not double up on a rate limit or an outage', async () => {
    mountDestinationForm(TORONTO);
    const fetchImpl = vi.fn(async () => jsonResponse({ detail: 'Throttled' }, 429));
    const verifier = buildVerifier({ fetchImpl });

    await verifier.verifyDestinationAddress();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(verifier.toasts.at(-1).type).toBe('err');
    expect(verifier.panel().hidden).toBe(true);
  });

  it('reports both failures when the fallback fails too', async () => {
    mountDestinationForm(TORONTO);
    const fetchImpl = vi.fn(async (url) => jsonResponse({ detail: 'nope' }, String(url).includes('/v2/') ? 403 : 500));
    const verifier = buildVerifier({ fetchImpl });

    await verifier.verifyDestinationAddress();

    expect(verifier.toasts.at(-1).message).toMatch(/403/);
    expect(verifier.toasts.at(-1).message).toMatch(/500/);
  });
});

describe('destination address verifier — guard rails', () => {
  it('refuses to call Shippo without an API key', async () => {
    mountDestinationForm(TORONTO);
    const fetchImpl = vi.fn();
    const verifier = buildVerifier({ fetchImpl, taxCenter: { settings: {} } });

    await verifier.verifyDestinationAddress();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(verifier.toasts.at(-1).type).toBe('warn');
  });

  it('refuses to call Shippo with an address it will reject, and says which field is missing', async () => {
    mountDestinationForm({ city: 'Toronto', country: 'CA' });
    const fetchImpl = vi.fn();
    const verifier = buildVerifier({ fetchImpl });

    await verifier.verifyDestinationAddress();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(verifier.toasts.at(-1).message).toMatch(/street/i);
  });

  it('re-enables the verify button after a failure', async () => {
    mountDestinationForm(TORONTO);
    const verifier = buildVerifier({ fetchImpl: vi.fn(async () => { throw new Error('offline'); }) });

    await verifier.verifyDestinationAddress();

    const button = document.getElementById('ship-verify-btn');
    expect(button.disabled).toBe(false);
    expect(button.innerHTML).toContain('Verify Address');
  });
});

describe('destination address verifier — verdict panel', () => {
  it('shows the verdict, its reasons and the suggested corrections', async () => {
    mountDestinationForm(MARKET_ST);
    const verifier = buildVerifier({ fetchImpl: vi.fn(async () => jsonResponse(V2_PARTIALLY_VALID)) });

    await verifier.verifyDestinationAddress();
    const panel = verifier.panel();

    expect(panel.hidden).toBe(false);
    expect(panel.className).toContain('warn');
    expect(panel.innerHTML).toContain('Needs corrections');
    expect(panel.innerHTML).toContain('high confidence');
    expect(panel.innerHTML).toContain('commercial');
    expect(panel.innerHTML).toContain('Address inputted was standardized.');
    expect(panel.innerHTML).toContain('731 Market St');
    expect(panel.innerHTML).toContain('applyVerifiedAddressCorrections()');
  });

  it('flags an undeliverable address in the error tone with nothing to apply', async () => {
    mountDestinationForm({ street1: '99999 Nowhere Fake Street', city: 'Springfield', state: 'ZZ', zip: '00000', country: 'US' });
    const verifier = buildVerifier({ fetchImpl: vi.fn(async () => jsonResponse(V2_INVALID)) });

    await verifier.verifyDestinationAddress();
    const panel = verifier.panel();

    expect(panel.className).toContain('err');
    expect(panel.innerHTML).toContain('Undeliverable');
    expect(panel.innerHTML).not.toContain('applyVerifiedAddressCorrections()');
  });

  it('escapes what Shippo sends back rather than injecting it', async () => {
    mountDestinationForm(TORONTO);
    const verifier = buildVerifier({
      fetchImpl: vi.fn(async () => jsonResponse({
        analysis: {
          validation_result: {
            value: 'invalid',
            reasons: [{ code: 'x', type: 'error', description: '<img src=x onerror="alert(1)">' }],
          },
        },
      })),
    });

    await verifier.verifyDestinationAddress();

    expect(verifier.panel().innerHTML).not.toContain('<img');
    expect(verifier.panel().querySelector('img')).toBeNull();
    expect(verifier.panel().innerHTML).toContain('&lt;img');
  });

  it('clears the panel when dismissed', async () => {
    mountDestinationForm(MARKET_ST);
    const verifier = buildVerifier({ fetchImpl: vi.fn(async () => jsonResponse(V2_PARTIALLY_VALID)) });

    await verifier.verifyDestinationAddress();
    verifier.dismissAddressVerification();

    expect(verifier.panel().hidden).toBe(true);
    expect(verifier.panel().innerHTML).toBe('');
  });
});

describe('destination address verifier — staleness', () => {
  it('marks the verdict stale and withdraws the corrections once the address is edited', async () => {
    mountDestinationForm(MARKET_ST);
    const verifier = buildVerifier({ fetchImpl: vi.fn(async () => jsonResponse(V2_PARTIALLY_VALID)) });
    verifier.bindDestinationVerificationWatchers();

    await verifier.verifyDestinationAddress();
    expect(verifier.panel().className).not.toContain('stale');

    const city = document.getElementById('st-city');
    city.value = 'Oakland';
    city.dispatchEvent(new window.Event('input'));

    expect(verifier.panel().className).toContain('stale');
    expect(verifier.panel().innerHTML).toContain('verify again');
    // A stale verdict must not still be offering to rewrite the form.
    expect(verifier.panel().innerHTML).not.toContain('applyVerifiedAddressCorrections()');
  });

  it('stops vouching for an edited address when a label purchase asks', async () => {
    mountDestinationForm(MARKET_ST);
    const verifier = buildVerifier({ fetchImpl: vi.fn(async () => jsonResponse(V2_INVALID)) });

    await verifier.verifyDestinationAddress();
    expect(isDeliverable(verifier.currentDestinationVerification().result)).toBe(false);

    document.getElementById('st-street1').value = '1 Real Street';
    expect(verifier.currentDestinationVerification()).toBeNull();
  });

  it('binds each field only once across repeated tab visits', async () => {
    mountDestinationForm(MARKET_ST);
    const verifier = buildVerifier({ fetchImpl: vi.fn(async () => jsonResponse(V2_PARTIALLY_VALID)) });
    const city = document.getElementById('st-city');
    const addSpy = vi.spyOn(city, 'addEventListener');

    verifier.bindDestinationVerificationWatchers();
    verifier.bindDestinationVerificationWatchers();
    verifier.bindDestinationVerificationWatchers();

    expect(addSpy).toHaveBeenCalledTimes(2); // input + change, once
  });
});

describe('destination address verifier — applying corrections', () => {
  it('writes only the fields Shippo changed', async () => {
    mountDestinationForm(MARKET_ST);
    const verifier = buildVerifier({ fetchImpl: vi.fn(async () => jsonResponse(V2_PARTIALLY_VALID)) });

    await verifier.verifyDestinationAddress();
    verifier.applyVerifiedAddressCorrections();

    expect(document.getElementById('st-street1').value).toBe('731 Market St');
    expect(document.getElementById('st-street2').value).toBe('Ste 200');
    expect(document.getElementById('st-zip').value).toBe('94103-2005');
    // Untouched by the recommendation, so untouched on the form.
    expect(document.getElementById('st-city').value).toBe('San Francisco');
    expect(document.getElementById('st-name').value).toBe('Wilson');
  });

  it('re-pins the verdict to the corrected address instead of offering the same changes twice', async () => {
    mountDestinationForm(MARKET_ST);
    const verifier = buildVerifier({ fetchImpl: vi.fn(async () => jsonResponse(V2_PARTIALLY_VALID)) });

    await verifier.verifyDestinationAddress();
    verifier.applyVerifiedAddressCorrections();

    const panel = verifier.panel();
    expect(panel.className).not.toContain('stale');
    expect(panel.innerHTML).not.toContain('applyVerifiedAddressCorrections()');
    expect(verifier.currentDestinationVerification()).not.toBeNull();
  });

  it('will not overwrite the form from a verdict the user has already moved past', async () => {
    mountDestinationForm(MARKET_ST);
    const verifier = buildVerifier({ fetchImpl: vi.fn(async () => jsonResponse(V2_PARTIALLY_VALID)) });

    await verifier.verifyDestinationAddress();
    document.getElementById('st-street1').value = '900 Somewhere Else Ave';
    verifier.applyVerifiedAddressCorrections();

    expect(document.getElementById('st-street1').value).toBe('900 Somewhere Else Ave');
    expect(document.getElementById('st-zip').value).toBe('94103');
    expect(verifier.toasts.at(-1).type).toBe('warn');
  });
});

// ─── Verifying from the shipping ledger ───────────────────────────────────

function buildLedgerVerifier({ fetchImpl, states, saveState = vi.fn(async () => {}), confirmDialog = vi.fn(async () => true) }) {
  const toasts = [];
  const harness = buildHarness({
    names: [
      'findLedgerOrder',
      'fetchShippoAddressVerification',
      'verifyOrderAddressRecord',
      'verifyLedgerOrderAddress',
      'batchVerifyLedgerAddresses',
      'applyLedgerAddressCorrections',
      'renderLedgerVerifyCell',
    ],
    deps: {
      $: (id) => document.getElementById(id),
      fetch: fetchImpl,
      states,
      saveState,
      confirmDialog,
      TAX_CENTER: { settings: { shippoKey: 'shippo_test_token' } },
      showToast: (message, type = 'ok') => { toasts.push({ message, type }); },
      escapeHtml,
      console: { error: () => {}, warn: () => {} },
      renderHist: vi.fn(),
      renderShippingAnalysisHub: vi.fn(),
      SHIPPO_ADDRESSES_V1_URL,
      SHIPPO_VALIDATE_V2_URL,
      addressFromOrder,
      addressSignature,
      addressValidationBlocker,
      buildAddressValidationQuery,
      buildLegacyValidationPayload,
      isDeliverable,
      normalizeAddressVerification,
      orderAddressPatch,
      persistableVerification,
      storedVerificationIsCurrent,
      verificationVerdict,
    },
    returns: `{
      verifyLedgerOrderAddress,
      batchVerifyLedgerAddresses,
      applyLedgerAddressCorrections,
      renderLedgerVerifyCell,
    }`,
  });
  return { ...harness, toasts, saveState, confirmDialog };
}

function ledgerOrder(overrides = {}) {
  return {
    id: 'ord-1', num: '#DTWO-539860', bookId: 'collective',
    // Matches V2_PARTIALLY_VALID's recommended_address.name: Shippo echoes the
    // name it was sent, so a mismatch here would fake a correction.
    shipName: 'Wilson', shipAddr1: '731 Market Street', shipAddr2: '#200',
    shipCity: 'San Francisco', shipProvince: 'CA', shipPostal: '94103', shipCountry: 'US',
    ...overrides,
  };
}

describe('verifying an address from the shipping ledger', () => {
  it('writes the verdict onto the order and saves the book once', async () => {
    const order = ledgerOrder();
    const verifier = buildLedgerVerifier({
      fetchImpl: vi.fn(async () => jsonResponse(V2_PARTIALLY_VALID)),
      states: { collective: { hist: [order] } },
    });

    await verifier.verifyLedgerOrderAddress('collective', 'ord-1');

    expect(order.addrVerify.status).toBe('partially_valid');
    expect(order.addrVerify.corrections.map(c => c.field)).toEqual(['street1', 'street2', 'zip']);
    expect(verifier.saveState).toHaveBeenCalledTimes(1);
    expect(verifier.saveState).toHaveBeenCalledWith('collective');
  });

  it('does not call Shippo for an order with no street address', async () => {
    const order = ledgerOrder({ shipAddr1: '' });
    const fetchImpl = vi.fn();
    const verifier = buildLedgerVerifier({ fetchImpl, states: { collective: { hist: [order] } } });

    await verifier.verifyLedgerOrderAddress('collective', 'ord-1');

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(order.addrVerify).toBeUndefined();
    expect(verifier.saveState).not.toHaveBeenCalled();
    expect(verifier.toasts.at(-1).type).toBe('warn');
  });

  it('leaves the order untouched when Shippo cannot be reached', async () => {
    const order = ledgerOrder();
    const verifier = buildLedgerVerifier({
      fetchImpl: vi.fn(async () => { throw new Error('offline'); }),
      states: { collective: { hist: [order] } },
    });

    await verifier.verifyLedgerOrderAddress('collective', 'ord-1');

    expect(order.addrVerify).toBeUndefined();
    expect(verifier.saveState).not.toHaveBeenCalled();
    expect(verifier.toasts.at(-1).type).toBe('err');
  });
});

describe('batch verifying selected ledger rows', () => {
  function mountSelection(values) {
    document.body.innerHTML = `
      <div id="ship-analysis-batch-actions"><button id="ship-analysis-batch-verify">⌖ Verify addresses</button></div>
      ${values.map(v => `<input type="checkbox" class="ship-order-checkbox" value="${v}" checked>`).join('')}
    `;
  }

  it('verifies every selected order but saves each book only once', async () => {
    const a = ledgerOrder({ id: 'a', num: '#A' });
    const b = ledgerOrder({ id: 'b', num: '#B' });
    const c = ledgerOrder({ id: 'c', num: '#C' });
    mountSelection(['collective|a', 'collective|b', 'hound|c']);
    const fetchImpl = vi.fn(async () => jsonResponse(V2_VALID_RESPONSE));
    const verifier = buildLedgerVerifier({
      fetchImpl,
      states: { collective: { hist: [a, b] }, hound: { hist: [c] } },
    });

    await verifier.batchVerifyLedgerAddresses();

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect([a, b, c].every(o => o.addrVerify?.status === 'valid')).toBe(true);
    expect(verifier.saveState).toHaveBeenCalledTimes(2);
    expect(verifier.saveState.mock.calls.flat().sort()).toEqual(['collective', 'hound']);
  });

  it('finishes the run when one address fails, and counts it', async () => {
    const a = ledgerOrder({ id: 'a', num: '#A', shipPostal: '00001' });
    const b = ledgerOrder({ id: 'b', num: '#B', shipPostal: '94103' });
    mountSelection(['collective|a', 'collective|b']);
    const verifier = buildLedgerVerifier({
      // Fails on both endpoints for order A: a thrown v2 call is a fallback
      // trigger, so failing only the first request would still succeed via v1.
      fetchImpl: vi.fn(async (url, init) => {
        const payload = `${url} ${init?.body || ''}`;
        if (payload.includes('00001')) throw new Error('boom');
        return jsonResponse(V2_VALID_RESPONSE);
      }),
      states: { collective: { hist: [a, b] } },
    });

    await verifier.batchVerifyLedgerAddresses();

    const summary = verifier.toasts.at(-1).message;
    expect(summary).toMatch(/Verified 1 address/);
    expect(summary).toMatch(/1 failed/);
    expect(verifier.saveState).toHaveBeenCalledTimes(1);
  });

  it('reports undeliverable addresses in the summary', async () => {
    const a = ledgerOrder({ id: 'a', num: '#A' });
    mountSelection(['collective|a']);
    const verifier = buildLedgerVerifier({
      fetchImpl: vi.fn(async () => jsonResponse(V2_INVALID)),
      states: { collective: { hist: [a] } },
    });

    await verifier.batchVerifyLedgerAddresses();

    expect(verifier.toasts.at(-1).message).toMatch(/1 undeliverable/);
    expect(verifier.toasts.at(-1).type).toBe('warn');
  });

  it('says so rather than calling Shippo when nothing is selected', async () => {
    document.body.innerHTML = '<div id="ship-analysis-batch-actions"></div>';
    const fetchImpl = vi.fn();
    const verifier = buildLedgerVerifier({ fetchImpl, states: {} });

    await verifier.batchVerifyLedgerAddresses();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(verifier.toasts.at(-1).type).toBe('warn');
  });
});

describe('applying ledger corrections to the order record', () => {
  async function verified(overrides) {
    const order = ledgerOrder(overrides);
    const verifier = buildLedgerVerifier({
      fetchImpl: vi.fn(async () => jsonResponse(V2_PARTIALLY_VALID)),
      states: { collective: { hist: [order] } },
    });
    await verifier.verifyLedgerOrderAddress('collective', 'ord-1');
    verifier.saveState.mockClear();
    return { order, verifier };
  }

  it('writes Shippo’s standardized text to the stored shipAddr fields', async () => {
    const { order, verifier } = await verified();

    await verifier.applyLedgerAddressCorrections('collective', 'ord-1');

    expect(order.shipAddr1).toBe('731 Market St');
    expect(order.shipAddr2).toBe('Ste 200');
    expect(order.shipPostal).toBe('94103-2005');
    // Not part of the recommendation, so not rewritten.
    expect(order.shipCity).toBe('San Francisco');
    expect(verifier.saveState).toHaveBeenCalledWith('collective');
  });

  it('spends the corrections so the same fix is not offered twice', async () => {
    const { order, verifier } = await verified();

    await verifier.applyLedgerAddressCorrections('collective', 'ord-1');

    expect(order.addrVerify.corrections).toEqual([]);
    expect(storedVerificationIsCurrent(order.addrVerify, order)).toBe(true);
  });

  it('refuses to apply a verdict the order has moved past', async () => {
    const { order, verifier } = await verified();
    order.shipAddr1 = '900 Somewhere Else Ave';

    await verifier.applyLedgerAddressCorrections('collective', 'ord-1');

    expect(order.shipAddr1).toBe('900 Somewhere Else Ave');
    expect(order.shipPostal).toBe('94103');
    expect(verifier.saveState).not.toHaveBeenCalled();
    expect(verifier.toasts.at(-1).type).toBe('warn');
  });

  it('writes nothing when the confirmation is declined', async () => {
    const order = ledgerOrder();
    const verifier = buildLedgerVerifier({
      fetchImpl: vi.fn(async () => jsonResponse(V2_PARTIALLY_VALID)),
      states: { collective: { hist: [order] } },
      confirmDialog: vi.fn(async () => false),
    });
    await verifier.verifyLedgerOrderAddress('collective', 'ord-1');
    verifier.saveState.mockClear();

    await verifier.applyLedgerAddressCorrections('collective', 'ord-1');

    expect(order.shipAddr1).toBe('731 Market Street');
    expect(verifier.saveState).not.toHaveBeenCalled();
  });
});

describe('the ledger row’s verify cell', () => {
  function cellFor(order) {
    const verifier = buildLedgerVerifier({ fetchImpl: vi.fn(), states: {} });
    return verifier.renderLedgerVerifyCell(order);
  }

  it('offers a verify button on an unchecked order', () => {
    const html = cellFor(ledgerOrder());
    expect(html).toContain('verifyLedgerOrderAddress(');
    expect(html).toContain('Verify address');
  });

  it('says so instead of offering a check it cannot run', () => {
    const html = cellFor(ledgerOrder({ shipAddr1: '' }));
    expect(html).toContain('No address');
    expect(html).not.toContain('verifyLedgerOrderAddress(');
    // Wrapped, or the Recipient cell's span rule truncates it to an ellipsis.
    expect(html.startsWith('<div class="ship-verify-cell"')).toBe(true);
  });

  it('shows the stored verdict and a fix button when corrections are pending', () => {
    const order = ledgerOrder();
    order.addrVerify = persistableVerification(
      normalizeAddressVerification(V2_PARTIALLY_VALID, addressFromOrder(order)),
      addressSignature(addressFromOrder(order)),
    );
    const html = cellFor(order);
    expect(html).toContain('Needs corrections');
    expect(html).toContain('applyLedgerAddressCorrections(');
    expect(html).toContain('Fix 3');
  });

  it('falls back to re-verify once the order is edited past its verdict', () => {
    const order = ledgerOrder();
    order.addrVerify = persistableVerification(
      normalizeAddressVerification(V2_PARTIALLY_VALID, addressFromOrder(order)),
      addressSignature(addressFromOrder(order)),
    );
    const edited = { ...order, shipPostal: '94104' };
    const html = cellFor(edited);
    expect(html).toContain('Re-verify address');
    expect(html).not.toContain('applyLedgerAddressCorrections(');
    expect(html).not.toContain('Needs corrections');
  });

  it('escapes an order number rather than letting it break the handler', () => {
    const html = cellFor(ledgerOrder({ id: `x' onmouseover='alert(1)`, shipName: 'X' }));
    expect(html).not.toContain("onmouseover='alert(1)");
    expect(html).toContain('&#39;');
  });
});

describe('verifier wiring', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const shippingJs = fs.readFileSync(path.join(root, 'src/features/shipping.js'), 'utf8');
  const styleCss = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');

  it('has the verify button and the panel it renders into', () => {
    expect(indexHtml).toContain('id="ship-verify-btn"');
    expect(indexHtml).toContain('onclick="verifyDestinationAddress()"');
    expect(indexHtml).toContain('id="ship-dest-verify-panel"');
  });

  it('replaced the toast-only validator rather than leaving both wired up', () => {
    expect(mainJs).not.toContain('validateDestinationAddress');
    expect(indexHtml).not.toContain('validateDestinationAddress');
  });

  it('exposes every handler the panel emits', () => {
    ['verifyDestinationAddress', 'applyVerifiedAddressCorrections', 'dismissAddressVerification'].forEach(name => {
      expect(mainJs).toContain(`window.${name} = ${name};`);
    });
  });

  it('keeps the label purchase guarded by the verdict', () => {
    expect(shippingJs).toContain('currentDestinationVerification()');
    expect(shippingJs).toMatch(/isDeliverable\(verification\.result\)/);
  });

  it('styles every tone the verdict panel can take', () => {
    ['.addr-verify.ok', '.addr-verify.warn', '.addr-verify.err', '.addr-verify.stale'].forEach(selector => {
      expect(styleCss).toContain(selector);
    });
  });
});
