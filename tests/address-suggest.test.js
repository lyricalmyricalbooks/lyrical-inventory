import { describe, it, expect } from 'vitest';
import {
  PHOTON_URL,
  buildSuggestUrl,
  cleanSuggestQuery,
  parseSuggestions,
  shouldSuggest,
} from '../src/lib/address-suggest.js';

// Photon answers GeoJSON; only `properties` matters here.
const photon = (...props) => ({ features: props.map(properties => ({ type: 'Feature', properties })) });

const MONTROSE = {
  osm_key: 'place', housenumber: '456', street: 'Montrose Avenue', city: 'Toronto',
  state: 'Ontario', postcode: 'M6G 3H1', countrycode: 'CA', country: 'Canada',
};
const MARKET = {
  osm_key: 'building', housenumber: '731', street: 'Market Street', city: 'San Francisco',
  state: 'California', postcode: '94103', countrycode: 'US',
};

describe('address suggestions — query', () => {
  it('waits for something worth asking about', () => {
    expect(shouldSuggest('456')).toBe(false);
    expect(shouldSuggest('1234')).toBe(false);
    expect(shouldSuggest('45 M')).toBe(true);
    expect(shouldSuggest('Main')).toBe(true);
  });

  it('drops the unit, which is never in the map data', () => {
    expect(cleanSuggestQuery('200-731 Market St')).toBe('731 Market Street');
    expect(cleanSuggestQuery('731 Market Street #200')).toBe('731 Market Street');
    expect(cleanSuggestQuery('12 King St W, Apt 4')).toBe('12 King Street W');
    expect(cleanSuggestQuery('5 Elm Rd Suite 3B')).toBe('5 Elm Road');
  });

  it('spells out only the street type, so a "St" that means Saint survives', () => {
    expect(cleanSuggestQuery('100 St Clair Ave W')).toBe('100 St Clair Avenue W');
    expect(cleanSuggestQuery('9 Stanley Blvd.')).toBe('9 Stanley Boulevard');
    expect(cleanSuggestQuery('9 Stanley')).toBe('9 Stanley');
  });

  it('asks Photon with no key in the URL', () => {
    const url = new URL(buildSuggestUrl({ text: '456 Montrose Ave' }));
    expect(`${url.origin}${url.pathname}`).toBe(PHOTON_URL);
    expect(url.searchParams.get('q')).toBe('456 Montrose Avenue');
    expect(url.searchParams.get('limit')).toBe('5');
    expect([...url.searchParams.keys()].some(k => /key|token/i.test(k))).toBe(false);
  });
});

describe('address suggestions — results', () => {
  it('maps a result onto the form, with a 2-letter province', () => {
    const [first] = parseSuggestions(photon(MONTROSE));
    expect(first.address).toEqual({
      street1: '456 Montrose Avenue', city: 'Toronto', state: 'ON', zip: 'M6G 3H1', country: 'CA',
    });
    expect(first.hasNumber).toBe(true);
    expect(first.detail).toBe('Toronto, ON, M6G 3H1, CA');
  });

  it('turns a US state name into its code', () => {
    expect(parseSuggestions(photon(MARKET))[0].address.state).toBe('CA');
  });

  it('keeps a state name as written where there are no codes', () => {
    const berlin = { housenumber: '5', street: 'Hauptstraße', city: 'Berlin', state: 'Berlin', postcode: '10115', countrycode: 'DE' };
    expect(parseSuggestions(photon(berlin))[0].address.state).toBe('Berlin');
  });

  it('offers a bare street, flagged as missing its number', () => {
    const street = { osm_key: 'highway', name: 'Montrose Avenue', city: 'Toronto', state: 'Ontario', countrycode: 'CA' };
    const [first] = parseSuggestions(photon(street));
    expect(first.address.street1).toBe('Montrose Avenue');
    expect(first.hasNumber).toBe(false);
  });

  it('leaves out results that are not a street address', () => {
    const city = { osm_key: 'place', name: 'Toronto', state: 'Ontario', countrycode: 'CA' };
    const shop = { osm_key: 'shop', name: 'Book Shop', city: 'Toronto', countrycode: 'CA' };
    expect(parseSuggestions(photon(city, shop))).toEqual([]);
  });

  it('collapses the same address mapped twice', () => {
    expect(parseSuggestions(photon(MONTROSE, { ...MONTROSE, osm_key: 'building' }))).toHaveLength(1);
  });

  it('survives a junk answer', () => {
    expect(parseSuggestions(null)).toEqual([]);
    expect(parseSuggestions({ features: [null, {}, { properties: 'x' }] })).toEqual([]);
  });
});
