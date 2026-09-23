// Shared plumbing for the named "fair presets" saved from the print modals —
// the payment-QR sheet (./qr-presets.js) and the sales-tracker tally sheet
// (./sales-tracker-presets.js). Each sheet keeps its own field rules in its own
// normalizer; everything here is the part that was identical between them: the
// name-derived id, the alphabetical picker order, and the localStorage-backed
// list that degrades to "no presets" rather than breaking the modal.

export const MAX_PRESET_NAME_LENGTH = 60;

// Stable id derived from the name, so saving under an existing name updates
// that preset instead of quietly stacking up near-duplicates.
export function presetId(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_PRESET_NAME_LENGTH);
}

// A three-letter currency code, upper-cased, or '' when the value isn't one.
export function normalizeCurrencyCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

export function sortPresets(presets) {
  return [...(presets || [])].sort((a, b) =>
    String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })
  );
}

// Book ids a preset remembers that no longer exist in the catalog.
export function presetMissingBooks(preset, availableIds) {
  if (!preset || !Array.isArray(preset.bookIds)) return [];
  const available = new Set(availableIds || []);
  return preset.bookIds.filter((id) => !available.has(id));
}

// The list operations for one sheet's presets, bound to its storage key and
// normalizer. Storage is injected so the rules stay testable without a DOM.
export function createPresetList(storageKey, normalize) {
  const clean = (presets) => (presets || []).map(normalize).filter(Boolean);

  function load(storage) {
    try {
      const raw = storage?.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      // Tolerate both the array shape and an older id-keyed object shape.
      const list = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
      return sortPresets(clean(list));
    } catch {
      return [];
    }
  }

  function save(storage, presets) {
    const sorted = sortPresets(clean(presets));
    try {
      storage?.setItem(storageKey, JSON.stringify(sorted));
    } catch {
      // A full or unavailable quota shouldn't lose the in-memory list; the caller
      // still gets the normalized presets back and the UI stays consistent.
    }
    return sorted;
  }

  function upsert(presets, preset) {
    const normalized = normalize(preset);
    const existing = clean(presets);
    if (!normalized) return sortPresets(existing);
    return sortPresets([...existing.filter((p) => p.id !== normalized.id), normalized]);
  }

  function remove(presets, id) {
    const target = presetId(id);
    return sortPresets(clean(presets).filter((p) => p.id !== target));
  }

  function find(presets, id) {
    const target = presetId(id);
    if (!target) return null;
    return (presets || []).find((p) => p && p.id === target) || null;
  }

  return { load, save, upsert, remove, find };
}
