// Address suggestions: the pure half of the Shipping tab's street-address
// autocomplete.
//
// Shippo can check an address but cannot suggest one. Suggestions come from
// Photon (photon.komoot.io), a free OpenStreetMap search with no key and no
// account: nothing to sign up for, nothing secret in the app. It is the same
// free finder the Lyricalmyrical website's checkout falls back to.
//
// OpenStreetMap is thinner than a paid service on house numbers and postcodes,
// so a suggestion is a head start, not a verdict: the Shippo check still runs
// on whatever the form ends up holding.
//
// Kept DOM-free and fetch-free so the query cleanup and the mapping from
// Photon's fields onto the destination form are testable on their own.

import { normalizeStateOrProvince } from './carriers/canadapost.js';

/** Photon's public search endpoint. */
export const PHOTON_URL = 'https://photon.komoot.io/api/';

/** Wait after a keystroke before asking: one request per pause, not per letter. */
export const SUGGEST_DELAY_MS = 300;

/** Fewer letters than this match half a continent, so it is not worth asking. */
export const SUGGEST_MIN_CHARS = 4;

/** How many suggestions to show. Five fits a phone screen above the keyboard. */
export const SUGGEST_LIMIT = 5;

const str = (value) => String(value ?? '').trim();

/** Whether what is in the street box is worth asking about. */
export function shouldSuggest(text) {
  const value = str(text);
  // A run of digits alone ("1234") is a house number with no street yet.
  return value.length >= SUGGEST_MIN_CHARS && /[^\d\s]/.test(value);
}

// Postal abbreviations OpenStreetMap stores spelled out. Only the street-type
// word is expanded, the last one before any compass direction, so "St Clair
// Ave W" becomes "St Clair Avenue W" and the "St" that means Saint is kept.
const ABBREVIATIONS = {
  st: 'Street', ave: 'Avenue', av: 'Avenue', rd: 'Road', blvd: 'Boulevard',
  dr: 'Drive', ln: 'Lane', ct: 'Court', cres: 'Crescent', hwy: 'Highway',
  pl: 'Place', sq: 'Square', pkwy: 'Parkway', ter: 'Terrace',
};

/**
 * Cleans what was typed into something OpenStreetMap can match: the unit is
 * dropped (it is never in the map data, and "200-731 Market" matches nothing),
 * and common abbreviations are spelled out.
 */
export function cleanSuggestQuery(text) {
  const words = str(text)
    // "200-731 Market St" / "200 - 731 Market St": unit-dash-number at the start.
    .replace(/^\s*[a-z]?\d+[a-z]?\s*-\s*(?=\d)/i, '')
    // "… #200", "… Apt 3", "… Suite 4B", "… Unit 12" anywhere after the street.
    .replace(/[\s,]+(#|apt\.?|apartment|suite|ste\.?|unit)\s*[\w-]+/gi, '')
    .split(/\s+/)
    .filter(Boolean);
  let typeAt = words.length - 1;
  while (typeAt > 0 && COMPASS.has(words[typeAt].toLowerCase().replace(/\.$/, ''))) typeAt -= 1;
  // The first word is never the street type (it is the number or the name).
  if (typeAt > 0) {
    const spelled = ABBREVIATIONS[words[typeAt].toLowerCase().replace(/\.$/, '')];
    if (spelled) words[typeAt] = spelled;
  }
  return words.join(' ');
}

const COMPASS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'north', 'south', 'east', 'west']);

/** The request URL. */
export function buildSuggestUrl({ text } = {}) {
  const params = new URLSearchParams({ q: cleanSuggestQuery(text), limit: String(SUGGEST_LIMIT) });
  return `${PHOTON_URL}?${params.toString()}`;
}

/**
 * Turns a Photon response into suggestions the form can take.
 *
 * Only results that name a street are kept: a city or a postcode on its own is
 * not an address, and offering one would overwrite a street the publisher was
 * halfway through typing with nothing. Duplicates (the same address mapped
 * twice) collapse into one.
 */
export function parseSuggestions(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const seen = new Set();
  const out = [];
  for (const feature of features) {
    const p = feature?.properties;
    if (!p || typeof p !== 'object') continue;
    const number = str(p.housenumber);
    // A street feature carries its own name in `name` and no `street`.
    const street = str(p.street) || (str(p.osm_key) === 'highway' ? str(p.name) : '');
    if (!street) continue;
    const country = str(p.countrycode).toUpperCase();
    const stateCode = normalizeStateOrProvince(str(p.state), country);
    const address = {
      street1: [number, street].filter(Boolean).join(' '),
      city: str(p.city) || str(p.town) || str(p.village) || str(p.locality) || str(p.district),
      // Carriers want "ON", not "Ontario"; elsewhere the name is kept as written.
      state: stateCode.length === 2 ? stateCode : str(p.state),
      zip: str(p.postcode),
      country,
    };
    const key = [address.street1, address.city, address.zip, address.country].join('|').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      address,
      hasNumber: Boolean(number),
      label: address.street1,
      detail: [address.city, address.state, address.zip, address.country].filter(Boolean).join(', '),
    });
  }
  return out;
}
