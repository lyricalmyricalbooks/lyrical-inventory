// Shared storage rules for the two "fair preset" pickers — the payment-QR sheet
// (./qr-presets.js) and the sales-tracker sheet (./sales-tracker-presets.js).
//
// The two sheets remember different fields, so each module keeps its own
// normalizer and summary line. What they share is everything around that: how a
// name becomes a stable id, how presets are sorted, read back from and written
// to localStorage, and upserted/removed/found. Those rules live here once so the
// two pickers can't drift apart (e.g. one tolerating a corrupt entry the other
// chokes on).
//
// Kept dependency-free with storage injected, like the modules that use it.

export const MAX_PRESET_NAME_LENGTH = 60;

// Stable id derived from the name, so saving under an existing name updates
// that preset instead of quietly stacking up near-duplicates.
export function presetIdFromName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_PRESET_NAME_LENGTH);
}

// A three-letter currency code, upper-cased, or '' when the value isn't one.
export function normalizePresetCurrency(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

// Trimmed, de-duplicated book ids in their saved order; anything that isn't an
// array comes back empty.
export function normalizePresetBookIds(list) {
  const bookIds = [];
  if (Array.isArray(list)) {
    for (const entry of list) {
      const bookId = String(entry || '').trim();
      if (bookId && !bookIds.includes(bookId)) bookIds.push(bookId);
    }
  }
  return bookIds;
}

// Keep a parseable saved-at stamp; otherwise stamp it now.
export function normalizePresetSavedAt(value) {
  const savedAtRaw = String(value || '');
  return savedAtRaw && !isNaN(new Date(savedAtRaw).getTime())
    ? savedAtRaw
    : new Date().toISOString();
}

// Book ids a preset remembers that no longer exist in the catalog.
export function presetMissingBooks(preset, availableIds) {
  if (!preset || !Array.isArray(preset.bookIds)) return [];
  const available = new Set(availableIds || []);
  return preset.bookIds.filter((id) => !available.has(id));
}

export function sortPresetsByName(presets) {
  return [...(presets || [])].sort((a, b) =>
    String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })
  );
}

// The load/save/upsert/remove/find set for one preset list, bound to its
// localStorage key and its normalizer (which must return null for anything
// unusable and never throw).
export function createPresetStore({ storageKey, normalize }) {
  const cleanList = (presets) => (presets || []).map(normalize).filter(Boolean);

  return {
    load(storage) {
      try {
        const raw = storage?.getItem(storageKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        // Tolerate both the array shape and an older id-keyed object shape.
        const list = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
        return sortPresetsByName(cleanList(list));
      } catch {
        return [];
      }
    },

    save(storage, presets) {
      const clean = sortPresetsByName(cleanList(presets));
      try {
        storage?.setItem(storageKey, JSON.stringify(clean));
      } catch {
        // A full or unavailable quota shouldn't lose the in-memory list; the caller
        // still gets the normalized presets back and the UI stays consistent.
      }
      return clean;
    },

    upsert(presets, preset) {
      const normalized = normalize(preset);
      const existing = cleanList(presets);
      if (!normalized) return sortPresetsByName(existing);
      return sortPresetsByName([...existing.filter((p) => p.id !== normalized.id), normalized]);
    },

    remove(presets, id) {
      const target = presetIdFromName(id);
      return sortPresetsByName(cleanList(presets).filter((p) => p.id !== target));
    },

    find(presets, id) {
      const target = presetIdFromName(id);
      if (!target) return null;
      return (presets || []).find((p) => p && p.id === target) || null;
    },
  };
}
