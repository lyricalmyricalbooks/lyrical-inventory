import { describe, it, expect } from 'vitest';
import {
  ADDRESS_FIELD_LABELS,
  addressCorrections,
  addressFromOrder,
  addressSignature,
  addressValidationBlocker,
  buildAddressValidationQuery,
  buildLegacyValidationPayload,
  countryFallbackWarning,
  describeShippoError,
  formatAddressLines,
  isDeliverable,
  normalizeAddressVerification,
  orderAddressPatch,
  persistableVerification,
  storedVerificationIsCurrent,
  verificationVerdict,
} from '../src/lib/address-verification.js';

// Captured verbatim from Shippo's v2 ValidateAddress operation so the parser is
// tested against the real payload shape rather than an invented one.
const V2_PARTIALLY_VALID = {
  original_address: {
    address_line_1: '731 Market Street', address_line_2: '#200', city_locality: 'San Francisco',
    state_province: 'CA', postal_code: '94103', country_code: 'US', name: 'Wilson',
  },
  recommended_address: {
    address_line_1: '731 Market St', address_line_2: 'Ste 200', city_locality: 'San Francisco',
    state_province: 'CA', postal_code: '94103-2005', country_code: 'US', name: 'Wilson',
    complete_address: 'Wilson; 731 Market St Ste 200; San Francisco CA 94103-2005; US',
    confidence_result: {
      score: 'high',
      code: 'postal_data_match',
      description: 'The address has been completely verified to the most granular level possible.',
    },
  },
  analysis: {
    validation_result: {
      value: 'partially_valid',
      reasons: [
        { code: 'address_abbreviation_fixed', type: 'correction', description: 'Address inputted was standardized for abbreviations according to postal authority rules.' },
        { code: 'address_vacant', type: 'warning', description: 'Address has been marked as vacant by the postal authority after 90 days of inactivity.' },
      ],
    },
    address_type: 'commercial',
    changed_attributes: ['address_line_1', 'postal_code', 'address_line_2'],
  },
  geo: { latitude: 37.78677, longitude: -122.40437 },
};

const V2_INVALID = {
  original_address: {
    address_line_1: '99999 Nowhere Fake Street', city_locality: 'Springfield',
    state_province: 'ZZ', postal_code: '00000', country_code: 'US', name: 'Test Person',
  },
  analysis: {
    validation_result: {
      value: 'invalid',
      reasons: [{ code: 'zip_post_code_not_found', type: 'error', description: 'The ZIP Code in the submitted address could not be found because neither a valid city and state, nor valid 5-digit ZIP Code was present.' }],
    },
    address_type: 'unknown',
  },
};

const V2_VALID = {
  original_address: {
    address_line_1: '456 Montrose Ave', city_locality: 'Toronto', state_province: 'ON',
    postal_code: 'M6G 3H1', country_code: 'CA', name: 'Lyricalmyrical Books',
  },
  analysis: {
    validation_result: {
      value: 'valid',
      reasons: [{ code: 'address_found', type: 'info', description: 'The entire address is present in the database.' }],
    },
    address_type: 'unknown',
  },
  geo: { latitude: 43.661836, longitude: -79.420758 },
};

const TORONTO = {
  name: 'Lyricalmyrical Books', company: '', street1: '456 Montrose Ave', street2: '',
  city: 'Toronto', state: 'ON', zip: 'M6G 3H1', country: 'CA',
};

const MARKET_ST = {
  name: 'Wilson', company: '', street1: '731 Market Street', street2: '#200',
  city: 'San Francisco', state: 'CA', zip: '94103', country: 'US',
};

describe('addressValidationBlocker', () => {
  it('accepts an address with a street, a country and a postal code', () => {
    expect(addressValidationBlocker({ street1: '1 A St', country: 'US', zip: '10001' })).toBe('');
  });

  it('accepts a city in place of a postal code, as Shippo does for international', () => {
    expect(addressValidationBlocker({ street1: '1 A St', country: 'GB', city: 'London' })).toBe('');
  });

  it('names the missing piece rather than failing generically', () => {
    expect(addressValidationBlocker({ country: 'US', zip: '10001' })).toMatch(/street/i);
    expect(addressValidationBlocker({ street1: '1 A St', zip: '10001' })).toMatch(/country/i);
    expect(addressValidationBlocker({ street1: '1 A St', country: 'US' })).toMatch(/city or a postal code/i);
  });

  // Regression: a display name here is what produced the 422 whose body was a
  // list of every ISO country code.
  it('refuses a country display name before Shippo has to', () => {
    expect(addressValidationBlocker({ street1: '1 A St', country: 'Canada', zip: 'M6G 3H1' }))
      .toMatch(/2-letter country code/);
    expect(addressValidationBlocker({ street1: '1 A St', country: 'United Kingdom', city: 'London' }))
      .toMatch(/United Kingdom/);
  });

  it('accepts a 2-letter code in either case', () => {
    expect(addressValidationBlocker({ street1: '1 A St', country: 'ca', zip: 'M6G 3H1' })).toBe('');
    expect(addressValidationBlocker({ street1: '1 A St', country: 'CA', zip: 'M6G 3H1' })).toBe('');
  });

  it('treats whitespace-only fields as missing', () => {
    expect(addressValidationBlocker({ street1: '   ', country: 'US', zip: '10001' })).toMatch(/street/i);
  });
});

describe('buildAddressValidationQuery', () => {
  it('renames every field to its v2 equivalent', () => {
    expect(buildAddressValidationQuery(MARKET_ST)).toEqual({
      name: 'Wilson',
      address_line_1: '731 Market Street',
      address_line_2: '#200',
      city_locality: 'San Francisco',
      state_province: 'CA',
      postal_code: '94103',
      country_code: 'US',
    });
  });

  it('omits empty fields instead of sending them blank', () => {
    const query = buildAddressValidationQuery({ street1: '1 A St', country: 'US', state: '  ' });
    expect(query).toEqual({ address_line_1: '1 A St', country_code: 'US' });
    expect('state_province' in query).toBe(false);
    expect('organization' in query).toBe(false);
  });
});

describe('buildLegacyValidationPayload', () => {
  it('asks the v1 endpoint to validate and keeps v1 field names', () => {
    const payload = buildLegacyValidationPayload(MARKET_ST);
    expect(payload.validate).toBe(true);
    expect(payload.street1).toBe('731 Market Street');
    expect(payload.zip).toBe('94103');
  });

  it('substitutes a placeholder name, which v1 requires', () => {
    expect(buildLegacyValidationPayload({ street1: '1 A St', country: 'US' }).name).toBe('Recipient');
  });
});

describe('normalizeAddressVerification — v2', () => {
  it('reads a partially valid verdict with its corrections and confidence', () => {
    const result = normalizeAddressVerification(V2_PARTIALLY_VALID, MARKET_ST);
    expect(result.source).toBe('v2');
    expect(result.status).toBe('partially_valid');
    expect(result.addressType).toBe('commercial');
    expect(result.confidence).toEqual({
      score: 'high',
      code: 'postal_data_match',
      description: 'The address has been completely verified to the most granular level possible.',
    });
    expect(result.geo).toEqual({ latitude: 37.78677, longitude: -122.40437 });
    expect(result.reasons.map(r => r.type)).toEqual(['correction', 'warning']);
    expect(result.corrections.map(c => c.field)).toEqual(['street1', 'street2', 'zip']);
    expect(result.corrections.find(c => c.field === 'zip')).toMatchObject({ from: '94103', to: '94103-2005' });
    expect(result.recommended.street1).toBe('731 Market St');
  });

  it('reads an invalid verdict and offers nothing to apply', () => {
    const result = normalizeAddressVerification(V2_INVALID, {
      name: 'Test Person', street1: '99999 Nowhere Fake Street', city: 'Springfield',
      state: 'ZZ', zip: '00000', country: 'US',
    });
    expect(result.status).toBe('invalid');
    expect(result.reasons[0].code).toBe('zip_post_code_not_found');
    expect(result.recommended).toBeNull();
    expect(result.corrections).toEqual([]);
    expect(result.geo).toBeNull();
  });

  it('reads a clean verdict without inventing corrections', () => {
    const result = normalizeAddressVerification(V2_VALID, TORONTO);
    expect(result.status).toBe('valid');
    expect(result.corrections).toEqual([]);
    expect(result.recommended).toBeNull();
    expect(result.geo).toEqual({ latitude: 43.661836, longitude: -79.420758 });
  });

  it('falls back to a no-verdict result rather than throwing on junk', () => {
    expect(normalizeAddressVerification(null, TORONTO).status).toBe('unknown');
    expect(normalizeAddressVerification({}, TORONTO).reasons).toEqual([]);
    expect(normalizeAddressVerification({ analysis: { validation_result: {} } }, TORONTO).status).toBe('unknown');
  });
});

describe('normalizeAddressVerification — v1 fallback', () => {
  it('maps a valid legacy response with no changes to a clean verdict', () => {
    const result = normalizeAddressVerification({
      ...TORONTO, is_residential: false,
      validation_results: { is_valid: true, messages: [] },
    }, TORONTO);
    expect(result.source).toBe('v1');
    expect(result.status).toBe('valid');
    expect(result.addressType).toBe('commercial');
    expect(result.recommended).toBeNull();
  });

  it('infers partially_valid when v1 hands back a standardized address', () => {
    const result = normalizeAddressVerification({
      ...MARKET_ST, street1: '731 MARKET ST', zip: '94103-2005', is_residential: true,
      validation_results: { is_valid: true, messages: [{ source: 'Shippo', code: 'Corrected', text: 'The address was corrected.' }] },
    }, MARKET_ST);
    expect(result.status).toBe('partially_valid');
    expect(result.addressType).toBe('residential');
    expect(result.corrections.map(c => c.field)).toEqual(['street1', 'zip']);
    expect(result.reasons[0]).toMatchObject({ type: 'warning', description: 'The address was corrected.' });
  });

  it('marks an invalid legacy response as an error rather than a warning', () => {
    const result = normalizeAddressVerification({
      ...MARKET_ST,
      validation_results: { is_valid: false, messages: [{ source: 'USPS', code: 'Unknown Street', text: 'Invalid City/State/Zip.' }] },
    }, MARKET_ST);
    expect(result.status).toBe('invalid');
    expect(result.reasons[0].type).toBe('error');
  });

  it('reports unverified when v1 answers without a verdict at all', () => {
    const result = normalizeAddressVerification({ ...TORONTO, validation_results: { messages: [] } }, TORONTO);
    expect(result.status).toBe('unverified');
  });
});

describe('addressCorrections', () => {
  it('is empty when there is nothing recommended', () => {
    expect(addressCorrections(TORONTO, null)).toEqual([]);
  });

  it('never proposes blanking a field the recommendation omits', () => {
    const diffs = addressCorrections({ ...MARKET_ST, street2: 'Apt 4' }, { ...MARKET_ST, street2: '' });
    expect(diffs).toEqual([]);
  });

  it('reports standardization that only changes case or spacing', () => {
    const diffs = addressCorrections(TORONTO, { ...TORONTO, zip: 'M6G3H1' });
    expect(diffs).toEqual([{ field: 'zip', label: 'Zip / Postal', from: 'M6G 3H1', to: 'M6G3H1' }]);
  });

  it('orders diffs by the order the form itself uses', () => {
    const diffs = addressCorrections(MARKET_ST, {
      ...MARKET_ST, zip: '94103-2005', name: 'W. Wilson', city: 'SF',
    });
    expect(diffs.map(d => d.field)).toEqual(['name', 'city', 'zip']);
  });
});

describe('verificationVerdict', () => {
  it('gives every known status its own tone', () => {
    expect(verificationVerdict('valid').tone).toBe('ok');
    expect(verificationVerdict('partially_valid').tone).toBe('warn');
    expect(verificationVerdict('unverified').tone).toBe('warn');
    expect(verificationVerdict('invalid').tone).toBe('err');
  });

  it('never returns undefined for an unexpected status', () => {
    expect(verificationVerdict('something_new').label).toBe('No verdict');
    expect(verificationVerdict(undefined).label).toBe('No verdict');
  });
});

describe('isDeliverable', () => {
  it('blocks only the invalid verdict', () => {
    expect(isDeliverable({ status: 'valid' })).toBe(true);
    expect(isDeliverable({ status: 'partially_valid' })).toBe(true);
    // Plenty of real international destinations have no postal database.
    expect(isDeliverable({ status: 'unverified' })).toBe(true);
    expect(isDeliverable({ status: 'invalid' })).toBe(false);
    expect(isDeliverable(null)).toBe(false);
  });
});

describe('addressSignature', () => {
  it('is stable across case and whitespace noise', () => {
    expect(addressSignature(TORONTO)).toBe(addressSignature({
      ...TORONTO, name: 'LYRICALMYRICAL  BOOKS', city: ' Toronto ',
    }));
  });

  it('changes when any verified field is edited', () => {
    const base = addressSignature(TORONTO);
    for (const [field] of ADDRESS_FIELD_LABELS) {
      expect(addressSignature({ ...TORONTO, [field]: 'edited-value' })).not.toBe(base);
    }
  });
});

// A history entry as the ledger actually stores one: shipAddr1 / shipProvince /
// shipPostal, not street1 / state / zip.
const ORDER = {
  num: '#DTWO-539860',
  shipName: 'Guilherme Farinha',
  shipAddr1: '731 Market Street',
  shipAddr2: '#200',
  shipCity: 'San Francisco',
  shipProvince: 'CA',
  shipPostal: '94103',
  shipCountry: 'US',
  qty: 2,
  shippingPaid: 37,
};

describe('addressFromOrder', () => {
  it('reads the ledger’s own field names into the verifier’s shape', () => {
    expect(addressFromOrder(ORDER)).toEqual({
      name: 'Guilherme Farinha', company: '', street1: '731 Market Street', street2: '#200',
      city: 'San Francisco', state: 'CA', zip: '94103', country: 'US',
    });
  });

  it('produces a complete shape for an order with no address at all', () => {
    const empty = addressFromOrder({ num: '#X' });
    expect(Object.keys(empty).sort()).toEqual(
      ['city', 'company', 'country', 'name', 'state', 'street1', 'street2', 'zip'],
    );
    expect(Object.values(empty).every(v => v === '')).toBe(true);
  });

  it('round-trips against the form field names, so signatures are comparable', () => {
    // Same address typed into the Destination form must sign identically to the
    // stored order, or a verdict could never be shared between the two screens.
    expect(addressSignature(addressFromOrder(ORDER)))
      .toBe(addressSignature({ ...MARKET_ST, name: 'Guilherme Farinha' }));
  });
});

describe('orderAddressPatch', () => {
  it('keys corrections back onto the record’s own field names', () => {
    expect(orderAddressPatch([
      { field: 'street1', label: 'Street address', from: '731 Market Street', to: '731 Market St' },
      { field: 'zip', label: 'Zip / Postal', from: '94103', to: '94103-2005' },
    ])).toEqual({ shipAddr1: '731 Market St', shipPostal: '94103-2005' });
  });

  it('patches nothing when there is nothing to change', () => {
    expect(orderAddressPatch([])).toEqual({});
    expect(orderAddressPatch()).toEqual({});
  });

  it('never emits a blanking patch or an unknown field', () => {
    expect(orderAddressPatch([
      { field: 'street2', to: '' },
      { field: 'notAField', to: 'x' },
    ])).toEqual({});
  });
});

describe('persistableVerification', () => {
  const result = normalizeAddressVerification(V2_PARTIALLY_VALID, MARKET_ST);

  it('keeps the verdict, reasons and corrections', () => {
    const stored = persistableVerification(result, 'sig', '2026-08-09T00:00:00Z');
    expect(stored).toMatchObject({ signature: 'sig', at: '2026-08-09T00:00:00Z', status: 'partially_valid', source: 'v2', addressType: 'commercial' });
    expect(stored.corrections.map(c => c.field)).toEqual(['street1', 'street2', 'zip']);
    expect(stored.reasons).toHaveLength(2);
  });

  it('drops the recommended address, which corrections already carry', () => {
    expect(persistableVerification(result, 'sig')).not.toHaveProperty('recommended');
  });

  it('caps a chatty response so a book document cannot bloat', () => {
    const noisy = {
      status: 'invalid',
      reasons: Array.from({ length: 12 }, (_, i) => ({ code: `c${i}`, type: 'error', description: 'x'.repeat(500) })),
      corrections: [],
    };
    const stored = persistableVerification(noisy, 'sig');
    expect(stored.reasons).toHaveLength(4);
    expect(stored.reasons[0].description).toHaveLength(240);
  });

  it('is null for a missing result rather than an empty husk', () => {
    expect(persistableVerification(null, 'sig')).toBeNull();
  });
});

describe('storedVerificationIsCurrent', () => {
  const stored = persistableVerification(
    normalizeAddressVerification(V2_VALID, addressFromOrder(ORDER)),
    addressSignature(addressFromOrder(ORDER)),
  );

  it('holds while the order still has the address that was checked', () => {
    expect(storedVerificationIsCurrent(stored, addressFromOrder(ORDER))).toBe(true);
  });

  it('lapses the moment any address field on the order changes', () => {
    expect(storedVerificationIsCurrent(stored, addressFromOrder({ ...ORDER, shipPostal: '94104' }))).toBe(false);
    expect(storedVerificationIsCurrent(stored, addressFromOrder({ ...ORDER, shipAddr2: '' }))).toBe(false);
  });

  it('ignores changes to fields that are not part of the address', () => {
    expect(storedVerificationIsCurrent(stored, addressFromOrder({ ...ORDER, qty: 99, shippingPaid: 0 }))).toBe(true);
  });

  it('is false for an order that was never checked', () => {
    expect(storedVerificationIsCurrent(null, addressFromOrder(ORDER))).toBe(false);
    expect(storedVerificationIsCurrent({}, addressFromOrder(ORDER))).toBe(false);
  });

  // It takes a resolved address rather than the order precisely so a caller
  // that normalizes the country cannot end up comparing two different strings.
  it('compares the resolved address, not a re-derived one', () => {
    const resolved = { ...addressFromOrder(ORDER), country: 'US' };
    const fromDisplayName = { ...addressFromOrder({ ...ORDER, shipCountry: 'United States' }), country: 'US' };
    expect(addressSignature(resolved)).toBe(addressSignature(fromDisplayName));
  });
});

describe('countryFallbackWarning', () => {
  it('flags a country that was defaulted to US rather than recognised', () => {
    expect(countryFallbackWarning('Kanada', 'US')).toMatch(/Kanada/);
    expect(countryFallbackWarning('Britain', 'US')).toMatch(/does not recognise/);
  });

  it('stays quiet for every real spelling of the United States', () => {
    ['US', 'us', 'USA', 'United States', 'united states of america', 'U.S.'].forEach(raw => {
      expect(countryFallbackWarning(raw, 'US')).toBe('');
    });
  });

  it('stays quiet when the country resolved to anything other than US', () => {
    expect(countryFallbackWarning('Canada', 'CA')).toBe('');
    expect(countryFallbackWarning('Kanada', 'DE')).toBe('');
  });

  it('stays quiet for an order with no country at all, which the blocker handles', () => {
    expect(countryFallbackWarning('', 'US')).toBe('');
  });
});

describe('describeShippoError', () => {
  // The body that actually reached a toast in production: technically precise,
  // and every country on earth wide.
  const ENUM_422 = JSON.stringify({
    detail: [{
      type: 'enum',
      loc: ['query', 'country_code'],
      msg: `Input should be ${Array.from({ length: 200 }, (_, i) => `'C${i}'`).join(', ')}`,
    }],
  });

  it('names the offending field and truncates the wall of valid values', () => {
    const message = describeShippoError(422, ENUM_422);
    expect(message).toContain('country_code');
    expect(message).toContain('422');
    expect(message.length).toBeLessThan(160);
  });

  it('summarises several problems without listing them all', () => {
    const body = JSON.stringify({
      detail: [
        { loc: ['query', 'country_code'], msg: 'bad country' },
        { loc: ['query', 'postal_code'], msg: 'bad postcode' },
        { loc: ['query', 'city_locality'], msg: 'bad city' },
      ],
    });
    const message = describeShippoError(422, body);
    expect(message).toContain('country_code');
    expect(message).toContain('postal_code');
    expect(message).toContain('+1 more');
  });

  it('falls back to the raw body when it is not the shape we expect', () => {
    expect(describeShippoError(500, 'upstream exploded')).toContain('upstream exploded');
    expect(describeShippoError(503, '')).toContain('503');
    expect(describeShippoError(400, '<html>gateway</html>')).toContain('gateway');
  });

  it('reads a plain string detail', () => {
    expect(describeShippoError(401, JSON.stringify({ detail: 'Invalid token.' }))).toContain('Invalid token.');
  });
});

describe('formatAddressLines', () => {
  it('drops blank lines and uppercases the country', () => {
    expect(formatAddressLines(TORONTO)).toEqual([
      'Lyricalmyrical Books',
      '456 Montrose Ave',
      'Toronto, ON  M6G 3H1',
      'CA',
    ]);
  });

  it('survives an empty address without producing empty lines', () => {
    expect(formatAddressLines({})).toEqual([]);
  });
});
