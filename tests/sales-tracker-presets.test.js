import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  ST_PRESET_STORAGE_KEY,
  stPresetId,
  normalizeStPreset,
  sortStPresets,
  loadStPresets,
  saveStPresets,
  upsertStPreset,
  removeStPreset,
  findStPreset,
  stPresetMissingBooks,
  stPresetSummary,
} from '../src/lib/sales-tracker-presets.js';
// The Event POS handlers were `window.x = function …` at column 0, which runs
// at import time — not allowed once this domain moves into a feature module.
// They are plain declarations now, so these assertions locate them by name
// through the shared helper rather than by how their export is spelled.
import { bodyOfFunction } from './helpers/extract-decl.js';

// Minimal localStorage stand-in, matching the one in tests/qr-presets.test.js —
// the point of injecting storage is that these rules are testable without a DOM.
function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

const fullPreset = {
  name: 'Mexico City Book Fair',
  cols: 12,
  currencyCode: 'MXN',
  includeNotes: true,
  bookIds: ['hound', 'injured'],
  qtyBrought: { hound: 20, injured: 15 },
  customBooks: [{ title: 'Zine 001', author: 'Self-published', qty: 30 }],
  savedAt: '2026-07-01T10:00:00.000Z',
};

describe('stPresetId', () => {
  it('slugs a fair name so the same name always addresses the same preset', () => {
    expect(stPresetId('Mexico City Book Fair')).toBe('mexico-city-book-fair');
    expect(stPresetId('  Mexico City  Book Fair  ')).toBe('mexico-city-book-fair');
  });

  it('returns an empty id for a name with nothing to slug', () => {
    expect(stPresetId('   ')).toBe('');
    expect(stPresetId('!!!')).toBe('');
    expect(stPresetId(null)).toBe('');
  });
});

describe('normalizeStPreset', () => {
  it('round-trips a well-formed preset unchanged', () => {
    expect(normalizeStPreset(fullPreset)).toEqual({ ...fullPreset, id: 'mexico-city-book-fair' });
  });

  it('rejects anything without a usable name', () => {
    expect(normalizeStPreset(null)).toBeNull();
    expect(normalizeStPreset('nope')).toBeNull();
    expect(normalizeStPreset({ name: '  ' })).toBeNull();
    expect(normalizeStPreset({ name: '###' })).toBeNull();
  });

  it('clamps the tally-column count into the range the sheet supports (1-30)', () => {
    expect(normalizeStPreset({ name: 'a', cols: 99 }).cols).toBe(30);
    expect(normalizeStPreset({ name: 'a', cols: 0 }).cols).toBe(1);
    expect(normalizeStPreset({ name: 'a', cols: 'garbage' }).cols).toBe(10);
  });

  it('accepts MXN as the tracker currency', () => {
    expect(normalizeStPreset({ name: 'cdmx', currencyCode: 'mxn' }).currencyCode).toBe('MXN');
  });

  it('falls back to EUR for a currency it cannot read', () => {
    expect(normalizeStPreset({ name: 'a', currencyCode: 'pesos' }).currencyCode).toBe('EUR');
    expect(normalizeStPreset({ name: 'a', currencyCode: '' }).currencyCode).toBe('EUR');
  });

  it('drops packed quantities that would print a wrong or missing count', () => {
    const p = normalizeStPreset({
      name: 'a',
      qtyBrought: { good: 12, zero: 0, negative: -5, notNumber: 'lots', empty: '', fractional: 3.7 },
    });
    expect(p.qtyBrought).toEqual({ good: 12, fractional: 3 });
  });

  it('de-duplicates book ids and drops blanks', () => {
    expect(normalizeStPreset({ name: 'a', bookIds: ['x', 'x', '', null, 'y'] }).bookIds).toEqual(['x', 'y']);
  });

  it('drops a custom title with no name, keeping the rest', () => {
    const p = normalizeStPreset({
      name: 'a',
      customBooks: [{ title: '', author: 'nobody' }, { title: 'Zine', author: '', qty: -4 }],
    });
    expect(p.customBooks).toEqual([{ title: 'Zine', author: '', qty: 0 }]);
  });

  it('defaults includeNotes off unless explicitly true', () => {
    expect(normalizeStPreset({ name: 'a' }).includeNotes).toBe(false);
    expect(normalizeStPreset({ name: 'a', includeNotes: 'yes' }).includeNotes).toBe(false);
    expect(normalizeStPreset({ name: 'a', includeNotes: true }).includeNotes).toBe(true);
  });

  it('replaces an unreadable savedAt with a usable timestamp', () => {
    expect(normalizeStPreset({ name: 'a', savedAt: 'not a date' }).savedAt).not.toBe('not a date');
    expect(isNaN(new Date(normalizeStPreset({ name: 'a', savedAt: 'x' }).savedAt).getTime())).toBe(false);
  });
});

describe('loadStPresets', () => {
  let storage;
  beforeEach(() => { storage = makeStorage(); });

  it('returns an empty list when nothing has been saved', () => {
    expect(loadStPresets(storage)).toEqual([]);
    expect(loadStPresets(null)).toEqual([]);
  });

  it('degrades to no presets rather than throwing on corrupt storage', () => {
    storage.setItem(ST_PRESET_STORAGE_KEY, '{not json');
    expect(loadStPresets(storage)).toEqual([]);
  });

  it('skips individually broken entries instead of losing the whole list', () => {
    storage.setItem(ST_PRESET_STORAGE_KEY, JSON.stringify([fullPreset, { name: '' }, null, 'nope']));
    const loaded = loadStPresets(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Mexico City Book Fair');
  });

  it('survives a full round-trip through storage', () => {
    saveStPresets(storage, [fullPreset]);
    expect(loadStPresets(storage)).toEqual([{ ...fullPreset, id: 'mexico-city-book-fair' }]);
  });
});

describe('saveStPresets', () => {
  it('does not throw when storage refuses the write', () => {
    const broken = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
    expect(() => saveStPresets(broken, [fullPreset])).not.toThrow();
    expect(saveStPresets(broken, [fullPreset])).toHaveLength(1);
  });

  it('stores presets sorted by name so the picker order is stable', () => {
    const storage = makeStorage();
    saveStPresets(storage, [{ name: 'Turin' }, { name: 'Mexico City' }, { name: 'Antwerp' }]);
    expect(loadStPresets(storage).map((p) => p.name)).toEqual(['Antwerp', 'Mexico City', 'Turin']);
  });
});

describe('upsertStPreset', () => {
  it('adds a preset that is not there yet', () => {
    expect(upsertStPreset([], fullPreset).map((p) => p.id)).toEqual(['mexico-city-book-fair']);
  });

  it('replaces rather than duplicates when the same name is saved again', () => {
    const first = upsertStPreset([], fullPreset);
    const again = upsertStPreset(first, { ...fullPreset, cols: 6, bookIds: ['hound'] });
    expect(again).toHaveLength(1);
    expect(again[0].cols).toBe(6);
    expect(again[0].bookIds).toEqual(['hound']);
  });

  it('leaves the list untouched when handed an unusable preset', () => {
    expect(upsertStPreset([fullPreset], { name: '' }).map((p) => p.id)).toEqual(['mexico-city-book-fair']);
  });
});

describe('removeStPreset / findStPreset', () => {
  const list = [normalizeStPreset(fullPreset), normalizeStPreset({ name: 'Turin' })];

  it('removes only the named preset', () => {
    expect(removeStPreset(list, 'mexico-city-book-fair').map((p) => p.name)).toEqual(['Turin']);
  });

  it('is a no-op for an id that is not stored', () => {
    expect(removeStPreset(list, 'nowhere')).toHaveLength(2);
  });

  it('finds by id and returns null for a miss or a blank id', () => {
    expect(findStPreset(list, 'turin').name).toBe('Turin');
    expect(findStPreset(list, 'nope')).toBeNull();
    expect(findStPreset(list, '')).toBeNull();
  });
});

describe('stPresetMissingBooks', () => {
  it('names the saved catalog titles that are no longer in the catalog', () => {
    const preset = normalizeStPreset(fullPreset);
    expect(stPresetMissingBooks(preset, ['hound'])).toEqual(['injured']);
    expect(stPresetMissingBooks(preset, ['hound', 'injured', 'extra'])).toEqual([]);
    expect(stPresetMissingBooks(null, ['hound'])).toEqual([]);
  });

  it('never flags custom titles — they are recreated wholesale, not looked up', () => {
    const preset = normalizeStPreset(fullPreset);
    expect(stPresetMissingBooks(preset, [])).toEqual(['hound', 'injured']);
  });
});

describe('stPresetSummary', () => {
  it('describes the packing list and sheet a preset will print', () => {
    expect(stPresetSummary(normalizeStPreset(fullPreset)))
      .toBe('3 titles · 65 packed · MXN · 12 cols · price rows');
  });

  it('omits the packed count when nothing is packed yet', () => {
    expect(stPresetSummary(normalizeStPreset({ name: 'a', bookIds: ['x'] })))
      .toBe('1 title · EUR · 10 cols');
  });

  it('returns an empty string for no preset', () => {
    expect(stPresetSummary(null)).toBe('');
  });
});

describe('sortStPresets', () => {
  it('sorts case-insensitively and tolerates malformed entries', () => {
    expect(sortStPresets([{ name: 'zurich' }, { name: 'Antwerp' }, {}]).map((p) => p.name))
      .toEqual([undefined, 'Antwerp', 'zurich']);
  });
});

describe('Sales tracker fair preset wiring', () => {
  const root = process.cwd();
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

  // The tally sheet and the QR sheet share one dialog and one saved fair, so
  // the tracker's preset controls are the fair kit's preset controls.
  it('exposes the preset controls in the fair kit modal', () => {
    expect(html).toContain('id="fk-preset-select"');
    expect(html).toContain('id="fk-preset-delete"');
    expect(html).toContain('id="fk-preset-note"');
    expect(html).toContain('fkSaveFairPreset()');
    expect(html).toContain('fkDeleteFairPreset()');
    expect(html).toContain('fkPresetSelected(this.value)');
  });

  it('saves and deletes the tally half of a fair alongside its QR half', () => {
    const saveBody = bodyOfFunction('fkSaveFairPreset', mainJs);
    expect(saveBody).toContain('_stReadPresetForm(name)');
    expect(saveBody).toContain('_qrReadPresetForm(name)');

    const del = bodyOfFunction('fkDeleteFairPreset', mainJs);
    const delBody = del.slice(0, del.indexOf('\n};'));
    expect(delBody).toContain('removeStPreset');
    expect(delBody).toContain('removeQrPreset');
  });

  it('exposes a packing-quantity field per book and a running total', () => {
    expect(html).toContain('id="st-pack-total"');
    expect(html).toContain('id="st-custom-qty"');
    expect(mainJs).toContain('class="st-book-qty"');
    expect(mainJs).toMatch(/(?:window\.|const |let |function )salesTrackerQtyInput\b/);
  });

  it('loads presets when the modal opens, so a fair survives a page reload', () => {
    expect(bodyOfFunction('openFairKitModal', mainJs)).toContain('loadStPresets');
  });

  it('re-renders the book list before imposing a preset selection on it', () => {
    // renderSalesTrackerBookList() rebuilds every row (and re-checks inventory
    // rows by default), so a preset applied first and rendered second would
    // silently print the wrong titles or packed counts. Order matters here.
    const apply = mainJs.slice(mainJs.indexOf('function _stApplyPresetToForm'));
    const body = apply.slice(0, apply.indexOf('\nfunction '));
    expect(body.indexOf('renderSalesTrackerBookList()')).toBeGreaterThan(-1);
    expect(body.indexOf('renderSalesTrackerBookList()')).toBeLessThan(body.indexOf('st-book-check'));
  });

  it('prints the packed quantity and a packed total on the sheet', () => {
    const body = bodyOfFunction('printSalesTracker', mainJs);
    expect(body).toContain('title-packed');
    expect(body).toContain('totalPacked');
  });
});
