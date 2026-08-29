import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { extractDecl } from './helpers/extract-decl.js';
import { countryIsUnrecognized, countryOptions } from '../src/lib/countries.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// The country pickers are the half of the fix that only exists in the DOM: the
// markup carries two options and everything else is built at runtime. A test
// that only reads the source would pass while the page still showed a
// forty-country list, so this one runs the real functions against the real
// markup and reads the options back out.
const harness = () => {
  const factory = new Function(
    '$', 'countryOptions', 'countryIsUnrecognized',
    [
      extractDecl('populateCountrySelect'),
      extractDecl('populateCountryDatalist'),
      extractDecl('renderLabelCountryHint'),
      'return { populateCountrySelect, populateCountryDatalist, renderLabelCountryHint };',
    ].join('\n'),
  );
  return factory(id => document.getElementById(id), countryOptions, countryIsUnrecognized);
};

const mountFragment = (startMarker) => {
  const start = indexHtml.indexOf(startMarker);
  expect(start, `expected ${startMarker} in index.html`).toBeGreaterThan(-1);
  return start;
};

describe('destination country picker', () => {
  let api;

  beforeEach(() => {
    const start = mountFragment('<select id="st-country"');
    const end = indexHtml.indexOf('</select>', start) + '</select>'.length;
    document.body.innerHTML = indexHtml.slice(start, end);
    api = harness();
  });

  it('offers every ISO country once the shipping tab has filled it', () => {
    const select = document.getElementById('st-country');
    expect(select.options.length).toBe(2);

    api.populateCountrySelect('st-country');

    const codes = Array.from(select.options).map(o => o.value).filter(Boolean);
    expect(codes.length).toBeGreaterThan(200);
    expect(codes).toContain('RS');
    expect(codes.slice(0, 2)).toEqual(['CA', 'US']);
    expect(select.querySelector('option[value="RS"]').textContent).toBe('Serbia');
  });

  it('keeps the chosen destination across a refill', () => {
    api.populateCountrySelect('st-country');
    document.getElementById('st-country').value = 'RS';
    api.populateCountrySelect('st-country');
    expect(document.getElementById('st-country').value).toBe('RS');
  });
});

describe('shipping label country box', () => {
  let api;

  beforeEach(() => {
    const start = mountFragment('<input type="text" id="sl-country"');
    const end = indexHtml.indexOf('</div>', indexHtml.indexOf('id="sl-country-hint"'));
    document.body.innerHTML = indexHtml.slice(start, end);
    api = harness();
  });

  it('suggests every country by name', () => {
    api.populateCountryDatalist('sl-country-options');
    const values = Array.from(document.getElementById('sl-country-options').options).map(o => o.value);
    expect(values.length).toBeGreaterThan(200);
    expect(values).toContain('Serbia');
  });

  it('says nothing about a country it can place', () => {
    document.getElementById('sl-country').value = 'Serbia';
    api.renderLabelCountryHint();
    expect(document.getElementById('sl-country-hint').hidden).toBe(true);
  });

  it('warns on the form itself about a country it cannot place', () => {
    document.getElementById('sl-country').value = 'Srbjia';
    api.renderLabelCountryHint();
    const hint = document.getElementById('sl-country-hint');
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toContain('Srbjia');
  });

  it('stays quiet while the box is still empty', () => {
    document.getElementById('sl-country').value = '';
    api.renderLabelCountryHint();
    expect(document.getElementById('sl-country-hint').hidden).toBe(true);
  });
});
