import { describe, it, expect } from 'vitest';
import { appSource } from './helpers/extract-decl.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexContent = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

// resolveBookPresetSpecs is rebuilt standalone the same way tests/shippo.test.js
// rebuilds the customs helpers, so the DOM-heavy module never has to load.
function buildResolver() {
  const presetsMatch = appSource.match(/const GENERIC_SHIP_SPECS = \{[\s\S]+?\};/);
  const mapMatch = appSource.match(/const BOOK_SHIP_PRESETS = \{[\s\S]+?\n\};/);
  const legacyMatch = appSource.match(/const LEGACY_TITLE_PRESET_IDS = \[[\s\S]+?\];/);
  const fnMatch = appSource.match(/function resolveBookPresetSpecs\(book\) \{([\s\S]+?)\n\}/);

  expect(presetsMatch).not.toBeNull();
  expect(mapMatch).not.toBeNull();
  expect(legacyMatch).not.toBeNull();
  expect(fnMatch).not.toBeNull();

  return new Function('book',
    `${presetsMatch[0]}\n${mapMatch[0]}\n${legacyMatch[0]}\n${fnMatch[0]}\nreturn resolveBookPresetSpecs(book);`
  );
}

describe('Book parcel presets', () => {
  const resolveBookPresetSpecs = buildResolver();

  it('prefers ship specs saved on the book record', () => {
    const result = resolveBookPresetSpecs({
      id: 'hound',
      title: 'The Hound',
      shipLength: 13, shipWidth: 10, shipHeight: 2,
      shipWeight: 900, shipWeightUnit: 'g', shipDimUnit: 'cm',
    });
    expect(result.source).toBe('book');
    expect(result.specs).toEqual({
      length: 13, width: 10, height: 2, dim_unit: 'cm', weight: 900, weight_unit: 'g',
    });
  });

  it('resolves by book id, so a retitled book keeps its real dimensions', () => {
    // This is the regression: the old title-substring chain dropped a renamed
    // book onto the generic 10x8x1 / 1.2 lb parcel and mis-rated every quote.
    const renamed = resolveBookPresetSpecs({ id: 'hound', title: 'The Hound — Second Edition' });
    expect(renamed.source).toBe('preset');
    expect(renamed.specs).toEqual({
      length: 12, width: 9, height: 1.2, dim_unit: 'in', weight: 2.2, weight_unit: 'lb',
    });

    const fullyRetitled = resolveBookPresetSpecs({ id: 'sistema', title: 'Unauthorised System' });
    expect(fullyRetitled.source).toBe('preset');
    expect(fullyRetitled.specs.weight).toBe(0.7);
  });

  it('still matches a known title when the id is unfamiliar', () => {
    const copied = resolveBookPresetSpecs({ id: 'archaeology-reprint-2026', title: 'Archaeology of Presence' });
    expect(copied.source).toBe('preset');
    expect(copied.specs.length).toBe(9);
  });

  it('reports a generic fallback so the caller can warn', () => {
    const brandNew = resolveBookPresetSpecs({ id: 'newtitle', title: 'A Brand New Book' });
    expect(brandNew.source).toBe('generic');
    expect(brandNew.specs).toEqual({
      length: 10, width: 8, height: 1, dim_unit: 'in', weight: 1.2, weight_unit: 'lb',
    });

    expect(resolveBookPresetSpecs(null).source).toBe('generic');
  });

  it('does not treat a partially filled book record as custom specs', () => {
    const partial = resolveBookPresetSpecs({ id: 'nobody', title: 'As if Nobody is Watching', shipLength: 11 });
    expect(partial.source).toBe('preset');
    expect(partial.specs.length).toBe(10);
  });

  it('warns in the preset handler when specs are generic', () => {
    expect(appSource).toMatch(/source === 'generic'/);
    expect(appSource).toContain('has no shipping specs');
  });
});

describe('Customs declared-total hint', () => {
  it('renders the quantity-scaled total', () => {
    const fnMatch = appSource.match(/function updateShippoCustomsTotalHint\(\) \{([\s\S]+?)\n\}/);
    expect(fnMatch).not.toBeNull();

    const elements = { 'sp-customs-total': { textContent: '' }, 'sp-qty': { value: '3' }, 'sp-customs-value': { value: '25' } };
    const run = new Function('$', `${fnMatch[0]}\nreturn updateShippoCustomsTotalHint();`);
    run((id) => elements[id]);
    expect(elements['sp-customs-total'].textContent).toBe('Declared to customs: 3 × 25.00 = 75.00 CAD');

    elements['sp-qty'].value = '1';
    run((id) => elements[id]);
    expect(elements['sp-customs-total'].textContent).toBe('Declared to customs: 25.00 CAD');
  });

  it('is wired to the quantity and value inputs in index.html', () => {
    expect(indexContent).toContain('id="sp-customs-total"');
    expect(indexContent).toContain('oninput="updateShippoCustomsTotalHint()"');
    expect(appSource).toMatch(/updateShippoCustomsTotalHint\(\);[\r\n]+  showToast\(`✓ Scaled specs/);
  });
});

describe('Incoterm preference memory', () => {
  const loadMatch = appSource.match(/function loadShippoIncotermPreference\(destCountryCode\) \{([\s\S]+?)\n\}/);
  const saveMatch = appSource.match(/function saveShippoIncotermPreference\(destCountryCode\) \{([\s\S]+?)\n\}/);
  const prefixMatch = appSource.match(/const INCOTERM_PREF_PREFIX = '[^']+';/);

  const makeHarness = (stored, optionValues = ['auto', 'DDP', 'DDU', 'DAP']) => {
    const select = { value: 'auto', options: optionValues.map(value => ({ value })) };
    const store = { ...stored };
    const localStorage = {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = value; },
    };
    return { select, store, localStorage };
  };

  it('restores a stored choice per destination country', () => {
    expect(loadMatch).not.toBeNull();
    const { select, localStorage } = makeHarness({ 'lm-shippo-incoterm-GB': 'DDU' });
    const run = new Function('$', 'normalizeCountryCode', 'localStorage', 'renderShippoIncotermHint', 'destCountryCode',
      `${prefixMatch[0]}\n${loadMatch[0]}\nreturn loadShippoIncotermPreference(destCountryCode);`);

    run((id) => (id === 'sp-incoterm' ? select : undefined), (c) => String(c || '').toUpperCase(), localStorage, () => {}, 'GB');
    expect(select.value).toBe('DDU');
  });

  it('falls back to auto for a country with no stored choice, so US never inherits DDU', () => {
    const { select, localStorage } = makeHarness({ 'lm-shippo-incoterm-GB': 'DDU' });
    const run = new Function('$', 'normalizeCountryCode', 'localStorage', 'renderShippoIncotermHint', 'destCountryCode',
      `${prefixMatch[0]}\n${loadMatch[0]}\nreturn loadShippoIncotermPreference(destCountryCode);`);

    select.value = 'DDU';
    run((id) => (id === 'sp-incoterm' ? select : undefined), (c) => String(c || '').toUpperCase(), localStorage, () => {}, 'US');
    expect(select.value).toBe('auto');
  });

  it('ignores a stored value that is not a valid option', () => {
    const { select, localStorage } = makeHarness({ 'lm-shippo-incoterm-FR': 'BOGUS' });
    const run = new Function('$', 'normalizeCountryCode', 'localStorage', 'renderShippoIncotermHint', 'destCountryCode',
      `${prefixMatch[0]}\n${loadMatch[0]}\nreturn loadShippoIncotermPreference(destCountryCode);`);

    run((id) => (id === 'sp-incoterm' ? select : undefined), (c) => String(c || '').toUpperCase(), localStorage, () => {}, 'FR');
    expect(select.value).toBe('auto');
  });

  it('persists the choice under the destination country key', () => {
    expect(saveMatch).not.toBeNull();
    const { select, store, localStorage } = makeHarness({});
    select.value = 'DAP';
    const run = new Function('$', 'normalizeCountryCode', 'localStorage', 'destCountryCode',
      `${prefixMatch[0]}\n${saveMatch[0]}\nreturn saveShippoIncotermPreference(destCountryCode);`);

    run((id) => (id === 'sp-incoterm' ? select : undefined), (c) => String(c || '').toUpperCase(), localStorage, 'FR');
    expect(store['lm-shippo-incoterm-FR']).toBe('DAP');
  });

  it('reloads the preference whenever the destination country changes', () => {
    expect(indexContent).toContain('onchange="onShippoDestCountryChange()"');
    expect(indexContent).toContain('onchange="onShippoIncotermChange()"');
  });
});

describe('Save to Book Preset UI & Persistence', () => {
  it('includes the Save to Book Preset modal and buttons in index.html', () => {
    expect(indexContent).toContain('id="m-save-book-preset"');
    expect(indexContent).toContain('id="sbp-target-book"');
    expect(indexContent).toContain('id="sbp-specs-preview"');
    expect(indexContent).toContain('id="sbp-confirm-btn"');
    expect(indexContent).toContain('onclick="openSaveBookPresetModal()"');
    expect(indexContent).toContain('onclick="confirmSaveBookPreset()"');
  });

  it('updates a book record with custom metric dimensions, weight, and customs info', () => {
    const resolveBookPresetSpecs = buildResolver();
    const photoBook = {
      id: 'photobook-2026',
      title: 'Book of Photography',
      shipLength: 23,
      shipWidth: 19.5,
      shipHeight: 2,
      shipDimUnit: 'cm',
      shipWeight: 0.367,
      shipWeightUnit: 'kg',
      shipHsCode: '4901.99.0070',
      shipCustomsDesc: 'book of photography',
      shipCustomsVal: 50,
      shipIncoterm: 'DDP'
    };

    const resolved = resolveBookPresetSpecs(photoBook);
    expect(resolved.source).toBe('book');
    expect(resolved.specs.length).toBe(23);
    expect(resolved.specs.width).toBe(19.5);
    expect(resolved.specs.height).toBe(2);
    expect(resolved.specs.dim_unit).toBe('cm');
    expect(resolved.specs.weight).toBe(0.367);
    expect(resolved.specs.weight_unit).toBe('kg');
  });
});
