import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  QR_PRESET_STORAGE_KEY,
  QR_PRESET_PRICE_CURRENCIES,
  qrPresetId,
  normalizeQrPreset,
  sortQrPresets,
  loadQrPresets,
  saveQrPresets,
  upsertQrPreset,
  removeQrPreset,
  findQrPreset,
  qrPresetMissingBooks,
  qrPresetSummary,
} from '../src/lib/qr-presets.js';
// The Event POS handlers were `window.x = function …` at column 0, which runs
// at import time — not allowed once this domain moves into a feature module.
// They are plain declarations now, so these assertions locate them by name
// through the shared helper rather than by how their export is spelled.
import { bodyOfFunction } from './helpers/extract-decl.js';

// Minimal localStorage stand-in: the real one is a browser API, and the point
// of injecting storage is that these rules can be tested without a DOM.
function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    _raw: () => data,
  };
}

const fullPreset = {
  name: 'Mexico City Book Fair',
  cols: 4,
  baseCur: 'MXN',
  currencies: ['MXN', 'CAD'],
  fitOnePage: true,
  bookIds: ['hound', 'injured'],
  overrides: { hound: 540, injured: 320 },
  savedAt: '2026-07-01T10:00:00.000Z',
};

describe('qrPresetId', () => {
  it('slugs a fair name so the same name always addresses the same preset', () => {
    expect(qrPresetId('Mexico City Book Fair')).toBe('mexico-city-book-fair');
    expect(qrPresetId('  Mexico City  Book Fair  ')).toBe('mexico-city-book-fair');
    expect(qrPresetId('MEXICO CITY BOOK FAIR')).toBe('mexico-city-book-fair');
  });

  it('returns an empty id for a name with nothing to slug', () => {
    expect(qrPresetId('   ')).toBe('');
    expect(qrPresetId('!!!')).toBe('');
    expect(qrPresetId(null)).toBe('');
  });
});

describe('normalizeQrPreset', () => {
  it('round-trips a well-formed preset unchanged', () => {
    expect(normalizeQrPreset(fullPreset)).toEqual({ ...fullPreset, id: 'mexico-city-book-fair' });
  });

  it('rejects anything without a usable name', () => {
    expect(normalizeQrPreset(null)).toBeNull();
    expect(normalizeQrPreset('nope')).toBeNull();
    expect(normalizeQrPreset({ name: '  ' })).toBeNull();
    expect(normalizeQrPreset({ name: '###' })).toBeNull();
  });

  it('clamps the column count into the range the print sheet supports', () => {
    expect(normalizeQrPreset({ name: 'a', cols: 99 }).cols).toBe(6);
    expect(normalizeQrPreset({ name: 'a', cols: 0 }).cols).toBe(1);
    expect(normalizeQrPreset({ name: 'a', cols: 'garbage' }).cols).toBe(3);
  });

  it('accepts MXN as a base currency and as a price column', () => {
    const p = normalizeQrPreset({ name: 'cdmx', baseCur: 'mxn', currencies: ['mxn', 'CAD'] });
    expect(p.baseCur).toBe('MXN');
    expect(p.currencies).toEqual(['MXN', 'CAD']);
  });

  it('falls back to per-book native for a base currency it cannot read', () => {
    expect(normalizeQrPreset({ name: 'a', baseCur: 'pesos' }).baseCur).toBe('auto');
    expect(normalizeQrPreset({ name: 'a', baseCur: '' }).baseCur).toBe('auto');
    expect(normalizeQrPreset({ name: 'a', baseCur: 'AUTO' }).baseCur).toBe('auto');
  });

  it('drops junk currency codes and de-duplicates the rest', () => {
    const p = normalizeQrPreset({ name: 'a', currencies: ['CAD', 'cad', 'pesos', '', null, 'MXN'] });
    expect(p.currencies).toEqual(['CAD', 'MXN']);
  });

  it('drops price overrides that would print a wrong or missing amount', () => {
    const p = normalizeQrPreset({
      name: 'a',
      overrides: { good: 42.5, zero: 0, negative: -10, notNumber: 'free', empty: '' },
    });
    expect(p.overrides).toEqual({ good: 42.5 });
  });

  it('de-duplicates book ids and drops blanks', () => {
    expect(normalizeQrPreset({ name: 'a', bookIds: ['x', 'x', '', null, 'y'] }).bookIds).toEqual(['x', 'y']);
  });

  it('defaults fit-on-one-page on, and honours an explicit false', () => {
    expect(normalizeQrPreset({ name: 'a' }).fitOnePage).toBe(true);
    expect(normalizeQrPreset({ name: 'a', fitOnePage: false }).fitOnePage).toBe(false);
  });

  it('replaces an unreadable savedAt with a usable timestamp', () => {
    expect(normalizeQrPreset({ name: 'a', savedAt: 'not a date' }).savedAt).not.toBe('not a date');
    expect(isNaN(new Date(normalizeQrPreset({ name: 'a', savedAt: 'x' }).savedAt).getTime())).toBe(false);
  });
});

describe('loadQrPresets', () => {
  let storage;
  beforeEach(() => { storage = makeStorage(); });

  it('returns an empty list when nothing has been saved', () => {
    expect(loadQrPresets(storage)).toEqual([]);
    expect(loadQrPresets(null)).toEqual([]);
  });

  it('degrades to no presets rather than throwing on corrupt storage', () => {
    storage.setItem(QR_PRESET_STORAGE_KEY, '{not json');
    expect(loadQrPresets(storage)).toEqual([]);
  });

  it('skips individually broken entries instead of losing the whole list', () => {
    storage.setItem(QR_PRESET_STORAGE_KEY, JSON.stringify([fullPreset, { name: '' }, null, 'nope']));
    const loaded = loadQrPresets(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Mexico City Book Fair');
  });

  it('reads an id-keyed object as well as an array', () => {
    storage.setItem(QR_PRESET_STORAGE_KEY, JSON.stringify({ 'mexico-city-book-fair': fullPreset }));
    expect(loadQrPresets(storage).map((p) => p.id)).toEqual(['mexico-city-book-fair']);
  });

  it('survives a full round-trip through storage', () => {
    saveQrPresets(storage, [fullPreset]);
    expect(loadQrPresets(storage)).toEqual([{ ...fullPreset, id: 'mexico-city-book-fair' }]);
  });
});

describe('saveQrPresets', () => {
  it('does not throw when storage refuses the write', () => {
    const broken = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
    expect(() => saveQrPresets(broken, [fullPreset])).not.toThrow();
    expect(saveQrPresets(broken, [fullPreset])).toHaveLength(1);
  });

  it('stores presets sorted by name so the picker order is stable', () => {
    const storage = makeStorage();
    saveQrPresets(storage, [{ name: 'Turin' }, { name: 'Mexico City' }, { name: 'Antwerp' }]);
    expect(loadQrPresets(storage).map((p) => p.name)).toEqual(['Antwerp', 'Mexico City', 'Turin']);
  });
});

describe('upsertQrPreset', () => {
  it('adds a preset that is not there yet', () => {
    expect(upsertQrPreset([], fullPreset).map((p) => p.id)).toEqual(['mexico-city-book-fair']);
  });

  it('replaces rather than duplicates when the same name is saved again', () => {
    const first = upsertQrPreset([], fullPreset);
    const again = upsertQrPreset(first, { ...fullPreset, cols: 2, bookIds: ['hound'] });
    expect(again).toHaveLength(1);
    expect(again[0].cols).toBe(2);
    expect(again[0].bookIds).toEqual(['hound']);
  });

  it('treats a differently-cased name as the same preset', () => {
    const list = upsertQrPreset([fullPreset], { ...fullPreset, name: 'MEXICO CITY BOOK FAIR', cols: 1 });
    expect(list).toHaveLength(1);
    expect(list[0].cols).toBe(1);
  });

  it('leaves the list untouched when handed an unusable preset', () => {
    expect(upsertQrPreset([fullPreset], { name: '' }).map((p) => p.id)).toEqual(['mexico-city-book-fair']);
  });
});

describe('removeQrPreset / findQrPreset', () => {
  const list = [normalizeQrPreset(fullPreset), normalizeQrPreset({ name: 'Turin' })];

  it('removes only the named preset', () => {
    expect(removeQrPreset(list, 'mexico-city-book-fair').map((p) => p.name)).toEqual(['Turin']);
  });

  it('is a no-op for an id that is not stored', () => {
    expect(removeQrPreset(list, 'nowhere')).toHaveLength(2);
  });

  it('finds by id and returns null for a miss or a blank id', () => {
    expect(findQrPreset(list, 'turin').name).toBe('Turin');
    expect(findQrPreset(list, 'nope')).toBeNull();
    expect(findQrPreset(list, '')).toBeNull();
  });
});

describe('qrPresetMissingBooks', () => {
  it('names the saved books that are no longer in the catalog', () => {
    const preset = normalizeQrPreset(fullPreset);
    expect(qrPresetMissingBooks(preset, ['hound'])).toEqual(['injured']);
    expect(qrPresetMissingBooks(preset, ['hound', 'injured', 'extra'])).toEqual([]);
    expect(qrPresetMissingBooks(null, ['hound'])).toEqual([]);
  });
});

describe('qrPresetSummary', () => {
  it('describes the sheet a preset will print', () => {
    expect(qrPresetSummary(normalizeQrPreset(fullPreset)))
      .toBe('2 books · MXN base · MXN/CAD · 4 cols · 2 priced');
  });

  it('handles a native-base preset with no overrides', () => {
    expect(qrPresetSummary(normalizeQrPreset({ name: 'a', bookIds: ['x'], currencies: ['CAD'] })))
      .toBe('1 book · native base · CAD · 3 cols');
  });

  it('returns an empty string for no preset', () => {
    expect(qrPresetSummary(null)).toBe('');
  });
});

describe('sortQrPresets', () => {
  it('sorts case-insensitively and tolerates malformed entries', () => {
    expect(sortQrPresets([{ name: 'zurich' }, { name: 'Antwerp' }, {}]).map((p) => p.name))
      .toEqual([undefined, 'Antwerp', 'zurich']);
  });
});

describe('QR fair preset wiring', () => {
  const root = process.cwd();
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

  // Both sheets are set up in one dialog now, so the QR sheet's preset controls
  // are the fair kit's — one saved fair carries both halves.
  it('exposes the preset controls in the fair kit modal', () => {
    expect(html).toContain('id="fk-preset-select"');
    expect(html).toContain('id="fk-preset-delete"');
    expect(html).toContain('id="fk-preset-note"');
    expect(html).toContain('fkSaveFairPreset()');
    expect(html).toContain('fkDeleteFairPreset()');
    expect(html).toContain('fkPresetSelected(this.value)');
  });

  it('has a checkbox for every price column the presets can restore', () => {
    for (const code of QR_PRESET_PRICE_CURRENCIES) {
      expect(html).toContain(`id="qrp-show-${code.toLowerCase()}"`);
    }
  });

  it('loads presets when the modal opens, so a fair survives a page reload', () => {
    expect(bodyOfFunction('openFairKitModal', mainJs)).toContain('loadQrPresets');
  });

  it('re-renders the book list before imposing a preset selection on it', () => {
    // renderQRPrintBookList() re-checks every book with a payment link, so a
    // preset applied first and rendered second would silently print the wrong
    // titles. Order matters here.
    const apply = mainJs.slice(mainJs.indexOf('function _qrApplyPresetToForm'));
    const body = apply.slice(0, apply.indexOf('\nfunction '));
    expect(body.indexOf('renderQRPrintBookList()')).toBeGreaterThan(-1);
    expect(body.indexOf('renderQRPrintBookList()')).toBeLessThan(body.indexOf('qrp-book-check'));
  });
});
