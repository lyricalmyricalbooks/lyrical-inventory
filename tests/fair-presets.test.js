import { describe, it, expect } from 'vitest';
import {
  createPresetList,
  normalizeIdList,
  normalizePresetIdentity,
  normalizeSavedAt,
  presetIdFromName,
} from '../src/lib/fair-presets.js';

function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

// A stand-in preset kind: the shared list operations must work with any
// normalizer, not just the QR or sales-tracker ones.
function normalizeNote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const identity = normalizePresetIdentity(raw);
  return identity ? { ...identity, note: String(raw.note || '') } : null;
}

describe('fair-presets shared helpers', () => {
  it('derives a stable id from the name', () => {
    expect(presetIdFromName('  Turin Book Fair 2026! ')).toBe('turin-book-fair-2026');
    expect(presetIdFromName('')).toBe('');
  });

  it('rejects entries with no usable name', () => {
    expect(normalizePresetIdentity({ name: '   ' })).toBeNull();
    expect(normalizePresetIdentity({ name: '!!!' })).toBeNull();
    expect(normalizePresetIdentity({ name: 'Zine Fest', id: '' })).toEqual({ id: 'zine-fest', name: 'Zine Fest' });
  });

  it('dedupes and trims id lists, ignoring non-arrays', () => {
    expect(normalizeIdList([' a ', 'b', 'a', '', null])).toEqual(['a', 'b']);
    expect(normalizeIdList('a')).toEqual([]);
  });

  it('keeps a valid saved date and replaces a broken one', () => {
    expect(normalizeSavedAt('2026-01-02T00:00:00.000Z')).toBe('2026-01-02T00:00:00.000Z');
    expect(Number.isNaN(new Date(normalizeSavedAt('garbage')).getTime())).toBe(false);
  });

  it('binds load/save/upsert/remove/find to one storage key and normalizer', () => {
    const list = createPresetList({ storageKey: 'k', normalize: normalizeNote });
    const storage = makeStorage();
    let presets = list.upsert([], { name: 'b fair', note: 'x' });
    presets = list.upsert(presets, { name: 'A Fair' });
    presets = list.upsert(presets, { name: 'B Fair', note: 'y' });
    expect(presets.map((p) => p.name)).toEqual(['A Fair', 'B Fair']);
    list.save(storage, presets);
    expect(list.load(storage)).toEqual(presets);
    expect(list.find(presets, 'B FAIR')?.note).toBe('y');
    expect(list.remove(presets, 'a fair').map((p) => p.id)).toEqual(['b-fair']);
    expect(list.load(makeStorage({ k: '{not json' }))).toEqual([]);
  });
});
