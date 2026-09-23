// Shared plumbing for "fair presets" — named snapshots of a printable sheet's
// setup, kept in localStorage. ./qr-presets.js and ./sales-tracker-presets.js
// each own their sheet-specific fields; everything about naming, storing,
// sorting and looking presets up is identical, so it lives here once.
//
// Dependency-free (storage is injected) so the rules can be unit-tested
// without a DOM, and so a corrupt or half-written localStorage entry degrades
// to "no presets" instead of breaking the print modal.

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

// The { id, name } every preset needs, or null when the raw entry has no
// usable name.
export function normalizePresetIdentity(raw) {
  const name = String(raw.name || '').trim().slice(0, MAX_PRESET_NAME_LENGTH);
  if (!name) return null;
  const id = presetIdFromName(raw.id || name) || presetIdFromName(name);
  if (!id) return null;
  return { id, name };
}

export function normalizeCurrencyCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

// Trimmed, de-duplicated, non-empty ids in their original order.
export function normalizeIdList(value) {
  const ids = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      const id = String(entry || '').trim();
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

export function normalizeSavedAt(value) {
  const raw = String(value || '');
  return raw && !isNaN(new Date(raw).getTime()) ? raw : new Date().toISOString();
}

// Book ids a preset remembers that no longer exist in the catalog — a title
// retired between fairs. Surfaced so the seller learns why the sheet came back
// short instead of discovering it at the table.
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

// List operations for one kind of preset, bound to its storage key and its
// normalizer (which must return a preset with id/name, or null).
export function createPresetList({ storageKey, normalize }) {
  const normalizeAll = (presets) => (presets || []).map(normalize).filter(Boolean);

  function load(storage) {
    try {
      const raw = storage?.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      // Tolerate both the array shape and an older id-keyed object shape.
      const list = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
      return sortPresetsByName(normalizeAll(list));
    } catch {
      return [];
    }
  }

  function save(storage, presets) {
    const clean = sortPresetsByName(normalizeAll(presets));
    try {
      storage?.setItem(storageKey, JSON.stringify(clean));
    } catch {
      // A full or unavailable quota shouldn't lose the in-memory list; the caller
      // still gets the normalized presets back and the UI stays consistent.
    }
    return clean;
  }

  function upsert(presets, preset) {
    const normalized = normalize(preset);
    const existing = normalizeAll(presets);
    if (!normalized) return sortPresetsByName(existing);
    return sortPresetsByName([...existing.filter((p) => p.id !== normalized.id), normalized]);
  }

  function remove(presets, id) {
    const target = presetIdFromName(id);
    return sortPresetsByName(normalizeAll(presets).filter((p) => p.id !== target));
  }

  function find(presets, id) {
    const target = presetIdFromName(id);
    if (!target) return null;
    return (presets || []).find((p) => p && p.id === target) || null;
  }

  return { load, save, upsert, remove, find };
}
