import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ISO_COUNTRIES,
  REGION_LABELS,
  countryIsUnrecognized,
  countryName,
  countryOptions,
  isCountryCode,
  resolveCountryCode,
  shipmentRegion,
} from '../src/lib/countries.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// The bug this file exists for:
//
// An order shipped to Bačka Palanka, Serbia showed up in the shipping ledger
// and the region split as a United States sale. The country table held about
// forty entries, Serbia was not one of them, and the resolver answered 'US' for
// everything it could not place. Nothing anywhere said so.
describe('country resolution', () => {
  it('resolves Serbia, the country that was silently filed as the United States', () => {
    expect(resolveCountryCode('Serbia')).toBe('RS');
    expect(resolveCountryCode('serbia')).toBe('RS');
    expect(resolveCountryCode('RS')).toBe('RS');
    expect(shipmentRegion('Serbia')).toBe('intl');
    expect(shipmentRegion('Serbia')).not.toBe('US');
  });

  it('covers every ISO country, not a curated shortlist', () => {
    // The old table had ~40 entries. Anything in that range means someone has
    // gone back to hand-picking, which is what caused the mis-filing.
    expect(Object.keys(ISO_COUNTRIES).length).toBeGreaterThan(200);
    ['RS', 'HR', 'SI', 'NG', 'PH', 'VN', 'AR', 'CL', 'TH', 'MA', 'KE', 'EE']
      .forEach(code => expect(ISO_COUNTRIES[code]).toBeTruthy());
  });

  it('resolves every ISO name and code back to its own code', () => {
    for (const [code, name] of Object.entries(ISO_COUNTRIES)) {
      expect(resolveCountryCode(name)).toBe(code);
      expect(resolveCountryCode(code)).toBe(code);
      expect(resolveCountryCode(code.toLowerCase())).toBe(code);
    }
  });

  it('reads the spellings people and storefronts actually write', () => {
    expect(resolveCountryCode('USA')).toBe('US');
    expect(resolveCountryCode('united states of america')).toBe('US');
    expect(resolveCountryCode('UK')).toBe('GB');
    expect(resolveCountryCode('England')).toBe('GB');
    expect(resolveCountryCode('Holland')).toBe('NL');
    expect(resolveCountryCode('Deutschland')).toBe('DE');
    expect(resolveCountryCode('Czech Republic')).toBe('CZ');
    expect(resolveCountryCode('Turkey')).toBe('TR');
    expect(resolveCountryCode('South Korea')).toBe('KR');
  });

  it('shrugs off accents, punctuation and spacing differences', () => {
    expect(resolveCountryCode('Turkiye')).toBe('TR');
    expect(resolveCountryCode('Türkiye')).toBe('TR');
    expect(resolveCountryCode('Reunion')).toBe('RE');
    expect(resolveCountryCode('Curacao')).toBe('CW');
    expect(resolveCountryCode('Bosnia & Herzegovina')).toBe('BA');
    expect(resolveCountryCode('bosnia-and-herzegovina')).toBe('BA');
    expect(resolveCountryCode('  Serbia  ')).toBe('RS');
  });

  it('reads a country carried as an object rather than a string', () => {
    expect(resolveCountryCode({ code: 'RS' })).toBe('RS');
    expect(resolveCountryCode({ name: 'Serbia' })).toBe('RS');
    expect(resolveCountryCode({ country_code: 'IT' })).toBe('IT');
  });

  it('answers nothing rather than guessing when it cannot place a value', () => {
    // The specific old failure: an unplaceable value came back as 'US'.
    expect(resolveCountryCode('Wakanda')).toBe('');
    expect(resolveCountryCode('???')).toBe('');
    expect(resolveCountryCode(12345)).toBe('');
    expect(resolveCountryCode('')).toBe('');
    expect(resolveCountryCode(null)).toBe('');
    expect(resolveCountryCode(undefined)).toBe('');
  });
});

describe('shipmentRegion', () => {
  it('buckets the three regions the shipping ledger reports on', () => {
    expect(shipmentRegion('Canada')).toBe('CA');
    expect(shipmentRegion('CA')).toBe('CA');
    expect(shipmentRegion('United States')).toBe('US');
    expect(shipmentRegion('usa')).toBe('US');
    expect(shipmentRegion('Italy')).toBe('intl');
    expect(shipmentRegion('Serbia')).toBe('intl');
  });

  it('sends an unplaceable or missing country to International, never to USA', () => {
    ['Wakanda', '', null, undefined, 'zzz', 12345].forEach(value => {
      expect(shipmentRegion(value)).toBe('intl');
    });
  });

  it('labels every bucket it can return', () => {
    ['CA', 'US', 'intl'].forEach(key => expect(REGION_LABELS[key]).toBeTruthy());
  });
});

describe('country helpers', () => {
  it('names a country canonically however it was written', () => {
    expect(countryName('serbia')).toBe('Serbia');
    expect(countryName('RS')).toBe('Serbia');
    expect(countryName('usa')).toBe('United States');
    // An unrecognized value is returned untouched rather than replaced.
    expect(countryName('Wakanda')).toBe('Wakanda');
  });

  it('flags a country that was written down but cannot be placed', () => {
    expect(countryIsUnrecognized('Wakanda')).toBe(true);
    expect(countryIsUnrecognized('Serbia')).toBe(false);
    // Blank is a missing country, not a wrong one — a different warning.
    expect(countryIsUnrecognized('')).toBe(false);
    expect(countryIsUnrecognized(null)).toBe(false);
  });

  it('recognises ISO codes and nothing else', () => {
    expect(isCountryCode('rs')).toBe(true);
    expect(isCountryCode('ZZ')).toBe(false);
    expect(isCountryCode('Serbia')).toBe(false);
  });

  it('offers every country for selection, with the two domestic ones pinned', () => {
    const options = countryOptions();
    expect(options).toHaveLength(Object.keys(ISO_COUNTRIES).length);
    expect(options[0].code).toBe('CA');
    expect(options[1].code).toBe('US');
    expect(options.some(o => o.code === 'RS')).toBe(true);
    const rest = options.slice(2).map(o => o.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'en')));
  });
});

describe('the country pickers are built from the shared table', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const shipping = fs.readFileSync(path.join(root, 'src/features/shipping.js'), 'utf8');

  // Hand-listing countries in the markup is how Serbia became unselectable in
  // the first place. Both pickers are filled from the ISO table now, so the
  // markup holds only the two pinned defaults.
  ['sf-country', 'st-country'].forEach(id => {
    it(`fills #${id} from the ISO table rather than from hand-written markup`, () => {
      const block = html.slice(html.indexOf(`<select id="${id}"`));
      const select = block.slice(0, block.indexOf('</select>'));
      const codes = [...select.matchAll(/<option value="([A-Z]{2})"/g)].map(m => m[1]);
      expect(codes.sort()).toEqual(['CA', 'US']);
      expect(shipping).toContain(`populateCountrySelect('${id}')`);
    });
  });

  it('suggests every country on the free-text country box', () => {
    expect(html).toContain('id="sl-country-options"');
    expect(html).toContain('list="sl-country-options"');
    expect(shipping).toContain("populateCountryDatalist('sl-country-options')");
  });
});

describe('nothing classifies an order with the US-defaulting resolver', () => {
  const shipping = fs.readFileSync(path.join(root, 'src/features/shipping.js'), 'utf8');

  // normalizeCountryCode still ends in 'US' so the Shipping tab's own form has
  // something selected. That default must never reach a region bucket again.
  it('routes every region decision through shipmentRegion', () => {
    expect(shipping).not.toMatch(/normalizeCountryCode\(o\.shipCountry/);
    expect(shipping).toMatch(/shipmentRegion\(o\.shipCountry\)/);
  });
});
