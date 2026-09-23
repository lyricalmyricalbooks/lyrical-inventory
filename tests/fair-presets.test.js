import { describe, it, expect } from 'vitest';
import { createPresetList, presetId } from '../src/lib/fair-presets.js';
import { loadQrPresets, saveQrPresets, QR_PRESET_STORAGE_KEY } from '../src/lib/qr-presets.js';
import { loadStPresets, saveStPresets, ST_PRESET_STORAGE_KEY } from '../src/lib/sales-tracker-presets.js';

function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    _raw: () => data,
  };
}

describe('createPresetList', () => {
  const normalize = (raw) => (raw?.name ? { id: presetId(raw.name), name: raw.name } : null);
  const list = createPresetList('test_key', normalize);

  it('runs every entry through the sheet normalizer and drops the unusable ones', () => {
    const storage = makeStorage();
    const saved = list.save(storage, [{ name: 'Zurich' }, null, { nope: 1 }, { name: 'Athens' }]);
    expect(saved.map((p) => p.name)).toEqual(['Athens', 'Zurich']);
    expect(list.load(storage)).toEqual(saved);
  });

  it('finds and removes by a name-derived id', () => {
    const presets = list.upsert([], { name: 'Turin Fair' });
    expect(list.find(presets, 'turin fair')?.name).toBe('Turin Fair');
    expect(list.remove(presets, 'Turin Fair')).toEqual([]);
  });
});

describe('QR and sales-tracker presets share plumbing but not storage', () => {
  it('keeps each sheet under its own key', () => {
    const storage = makeStorage();
    saveQrPresets(storage, [{ name: 'QR fair', cols: 3 }]);
    saveStPresets(storage, [{ name: 'Tally fair', cols: 10 }]);
    expect(Object.keys(storage._raw()).sort()).toEqual([QR_PRESET_STORAGE_KEY, ST_PRESET_STORAGE_KEY].sort());
    expect(loadQrPresets(storage).map((p) => p.name)).toEqual(['QR fair']);
    expect(loadStPresets(storage).map((p) => p.name)).toEqual(['Tally fair']);
  });
});
