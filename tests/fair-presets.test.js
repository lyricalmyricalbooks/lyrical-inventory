import { describe, it, expect } from 'vitest';
import {
  presetIdFromName,
  normalizePresetBookIds,
  normalizePresetCurrency,
  normalizePresetSavedAt,
  presetMissingBooks,
  createPresetStore,
} from '../src/lib/fair-presets.js';

function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    _raw: () => data,
  };
}

// A minimal normalizer: the store must work with any list's own rules.
const normalize = (raw) => {
  const name = String(raw?.name || '').trim();
  const id = presetIdFromName(raw?.id || name);
  return name && id ? { id, name } : null;
};

describe('fair-presets shared rules', () => {
  it('derives stable ids from names', () => {
    expect(presetIdFromName('  Turin  Fair! 2026 ')).toBe('turin-fair-2026');
    expect(presetIdFromName('')).toBe('');
    expect(presetIdFromName('x'.repeat(80))).toHaveLength(60);
  });

  it('cleans currency codes, book ids and saved-at stamps', () => {
    expect(normalizePresetCurrency(' mxn ')).toBe('MXN');
    expect(normalizePresetCurrency('pesos')).toBe('');
    expect(normalizePresetBookIds([' a ', 'b', 'a', '', null])).toEqual(['a', 'b']);
    expect(normalizePresetBookIds('a')).toEqual([]);
    expect(normalizePresetSavedAt('2026-07-01T10:00:00.000Z')).toBe('2026-07-01T10:00:00.000Z');
    expect(Number.isNaN(new Date(normalizePresetSavedAt('garbage')).getTime())).toBe(false);
  });

  it('lists book ids missing from the catalog', () => {
    expect(presetMissingBooks({ bookIds: ['a', 'b'] }, ['a'])).toEqual(['b']);
    expect(presetMissingBooks(null, ['a'])).toEqual([]);
  });

  it('binds load/save/upsert/remove/find to one storage key', () => {
    const store = createPresetStore({ storageKey: 'k', normalize });
    const storage = makeStorage();
    let list = store.upsert([], { name: 'Zine Fest' });
    list = store.upsert(list, { name: 'art book fair' });
    list = store.upsert(list, { name: 'Zine  Fest' });
    expect(list.map((p) => p.name)).toEqual(['art book fair', 'Zine  Fest']);
    store.save(storage, list);
    expect(store.load(storage)).toEqual(list);
    expect(store.find(list, 'Zine Fest')?.name).toBe('Zine  Fest');
    expect(store.remove(list, 'zine-fest').map((p) => p.id)).toEqual(['art-book-fair']);
  });

  it('degrades a corrupt entry to an empty list', () => {
    const store = createPresetStore({ storageKey: 'k', normalize });
    expect(store.load(makeStorage({ k: '{not json' }))).toEqual([]);
    expect(store.load(null)).toEqual([]);
  });
});
