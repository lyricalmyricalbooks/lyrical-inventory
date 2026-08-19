import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appSource, extractDecl } from './helpers/extract-decl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const styleCss = fs.readFileSync(path.resolve(__dirname, '../src/style.css'), 'utf8');

// shippoRateRules is pure apart from the country check, which it accepts as an
// injectable, so it runs standalone without main.js's DOM or country table.
function buildRules() {
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${extractDecl('shippoRateRules')}\nreturn shippoRateRules;`);
  return factory();
}

const shippoRateRules = buildRules();
const supported = (v) => ['CA', 'US', 'GB'].includes(String(v || '').trim().toUpperCase());
const rulesFor = (opts) => shippoRateRules({ isSupportedCountry: supported, ...opts });

/** The rules that fail for a given map of field id → value. */
function failing(values, opts = {}) {
  return rulesFor(opts).filter(r => !r.test(values[r.id] ?? '', null));
}

const COMPLETE = {
  'sf-name': 'Lyricalmyrical Books',
  'sf-phone': '+1 416 555 0123',
  'sf-street1': '123 Bookish Way',
  'sf-city': 'Toronto',
  'sf-zip': 'M4B 1B3',
  'sf-country': 'CA',
  'st-name': 'Jane Reader',
  'st-phone': '+1 604 555 0199',
  'st-street1': '456 Reading Ave',
  'st-city': 'Vancouver',
  'st-zip': 'V6B 1A1',
  'st-country': 'CA',
  'sp-length': '10',
  'sp-width': '8',
  'sp-height': '1',
  'sp-weight': '1.2',
};

describe('Shipping rate form — which box is actually empty', () => {
  it('passes a fully filled domestic form', () => {
    expect(failing(COMPLETE)).toEqual([]);
  });

  it('names the one empty field instead of the whole card', () => {
    const missing = failing({ ...COMPLETE, 'st-city': '   ' });
    expect(missing).toHaveLength(1);
    expect(missing[0].id).toBe('st-city');
    expect(missing[0].label).toBe('Recipient city');
    // The inline message is what lands under the box, so it has to read as a
    // sentence to a non-technical publisher, not as a field name.
    expect(missing[0].msg).toMatch(/city/i);
  });

  it('reports every empty box at once, in the order they appear on the form', () => {
    const missing = failing({ ...COMPLETE, 'sf-street1': '', 'st-name': '', 'sp-weight': '0' });
    expect(missing.map(r => r.id)).toEqual(['sf-street1', 'st-name', 'sp-weight']);
  });

  it('does not ask for phone numbers on a domestic quote', () => {
    const domestic = rulesFor({ international: false }).map(r => r.id);
    expect(domestic).not.toContain('sf-phone');
    expect(domestic).not.toContain('st-phone');
    // …and a domestic form with both phones blank still quotes.
    expect(failing({ ...COMPLETE, 'sf-phone': '', 'st-phone': '' })).toEqual([]);
  });

  it('asks for both phone numbers once the shipment crosses a border', () => {
    const missing = failing({ ...COMPLETE, 'sf-phone': '', 'st-phone': '' }, { international: true });
    expect(missing.map(r => r.id)).toEqual(['sf-phone', 'st-phone']);
  });

  it('treats a zero or negative parcel measurement as missing', () => {
    for (const [id, bad] of [['sp-length', '0'], ['sp-width', '-2'], ['sp-height', ''], ['sp-weight', 'abc']]) {
      const missing = failing({ ...COMPLETE, [id]: bad });
      expect(missing.map(r => r.id), `${id}=${bad}`).toEqual([id]);
    }
  });

  it('flags an unsupported country on the country select itself', () => {
    const missing = failing({ ...COMPLETE, 'st-country': 'ZZ' });
    expect(missing.map(r => r.id)).toEqual(['st-country']);
  });

  it('gives every rule a plain-language label and message', () => {
    for (const r of rulesFor({ international: true })) {
      expect(typeof r.label, r.id).toBe('string');
      expect(r.label.length, r.id).toBeGreaterThan(0);
      expect(typeof r.msg, r.id).toBe('string');
      expect(r.msg.length, r.id).toBeGreaterThan(0);
    }
  });
});

describe('Shipping rate form — wiring', () => {
  it('no longer falls back to a toast naming a whole address card', () => {
    // Asserted as booleans rather than .not.toContain, so a regression prints a
    // one-line failure instead of dumping the whole concatenated app source.
    const blanket = [
      'Origin address (Sender Name, Street, City, Zip) is required',
      'Destination address (Recipient Name, Street, City, Zip) is required',
      'Parcel dimensions and weight must be positive numbers',
      'Choose a supported origin and destination country before rating',
    ];
    const stillToasted = blanket.filter(msg => appSource.includes(`showToast('⚠️ ${msg}`));
    expect(stillToasted).toEqual([]);
  });

  it('marks the failing boxes with the app\'s existing inline validation helper', () => {
    const fn = extractDecl('calculateShippoRates');
    expect(fn).toContain('validateFields(rules)');
    expect(fn).toContain('clearFieldErrors(');
  });

  it('keeps the scroll to the first empty box instant under reduced motion', () => {
    expect(extractDecl('calculateShippoRates')).toContain("_prefersReducedMotion() ? 'auto' : 'smooth'");
  });

  it('renders a readiness host the tab can announce into', () => {
    expect(indexHtml).toContain('id="ship-rate-readiness"');
    expect(indexHtml).toMatch(/id="ship-rate-readiness"[^>]*aria-live="polite"/);
  });

  it('re-renders readiness after a prefill writes fields in code', () => {
    expect(extractDecl('onShippoPreFillDestChange')).toContain('renderShippoRateReadiness()');
    expect(extractDecl('onShippoBookPresetChange')).toContain('renderShippoRateReadiness()');
    expect(extractDecl('initShippingTab')).toContain('renderShippoRateReadiness()');
  });

  it('binds the live watchers once per tab element', () => {
    const fn = extractDecl('bindRateReadinessWatchers');
    expect(fn).toContain('rateReadyWatch');
    expect(fn).toContain("addEventListener('input'");
    expect(fn).toContain("addEventListener('change'");
  });

  it('reuses the existing pill vocabulary rather than new status colours', () => {
    const fn = extractDecl('renderShippoRateReadiness');
    expect(fn).toContain('pill green');
    expect(fn).toContain('pill amber');
  });

  it('styles the readiness line off design tokens and a container query', () => {
    expect(styleCss).toContain('.ship-readiness {');
    expect(styleCss).toContain('@container shiprateform');
    expect(styleCss).toContain('.ship-readiness:empty { display: none; }');
  });
});
