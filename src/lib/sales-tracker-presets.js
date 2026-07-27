// Pure helpers for "fair presets" on the printable sales-tracker sheet — a
// named snapshot of the tally sheet setup (layout, currency, which titles,
// how many copies of each are packed for the trip, and any one-off titles
// that aren't in the catalog at all, like a zine only sold at fairs).
//
// Same shape of problem as the QR-sheet presets in ./qr-presets.js — rebuild
// this by hand every fair and something gets left off the packing list — but
// this sheet's fields are different (a tally-column count up to 30, no base
// currency/price-column set, and a packed-quantity per title instead of a
// price override), so it gets its own small, dependency-free module.

export const ST_PRESET_STORAGE_KEY = 'lm_sales_tracker_fair_presets_v1';

const MAX_NAME_LENGTH = 60;
const MAX_COLS = 30;

// Stable id derived from the name, so saving under an existing name updates
// that preset instead of quietly stacking up near-duplicates.
export function stPresetId(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_NAME_LENGTH);
}

function clampCols(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.min(MAX_COLS, n));
}

function normalizeCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

function normalizeQty(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// Coerce whatever is on disk into a preset this app can apply, or null when it
// carries nothing usable. Never throws: a preset written by an older build (or
// a hand-edited localStorage entry) must not take the print modal down with it.
export function normalizeStPreset(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim().slice(0, MAX_NAME_LENGTH);
  if (!name) return null;
  const id = stPresetId(raw.id || name) || stPresetId(name);
  if (!id) return null;

  const bookIds = [];
  if (Array.isArray(raw.bookIds)) {
    for (const entry of raw.bookIds) {
      const bookId = String(entry || '').trim();
      if (bookId && !bookIds.includes(bookId)) bookIds.push(bookId);
    }
  }

  // Only positive whole counts survive: a stored NaN or negative would print
  // a packing list that lies about how many copies to grab off the shelf.
  const qtyBrought = {};
  if (raw.qtyBrought && typeof raw.qtyBrought === 'object') {
    for (const [bookId, qty] of Object.entries(raw.qtyBrought)) {
      const key = String(bookId || '').trim();
      const clean = normalizeQty(qty);
      if (key && clean > 0) qtyBrought[key] = clean;
    }
  }

  // Custom (not-in-catalog) titles are stored whole, since there's no catalog
  // record to look them up by id later — restoring a preset recreates them.
  const customBooks = [];
  if (Array.isArray(raw.customBooks)) {
    for (const entry of raw.customBooks) {
      const title = String(entry?.title || '').trim();
      if (!title) continue;
      customBooks.push({
        title,
        author: String(entry?.author || '').trim(),
        qty: normalizeQty(entry?.qty),
      });
    }
  }

  const savedAtRaw = String(raw.savedAt || '');
  const savedAt = savedAtRaw && !isNaN(new Date(savedAtRaw).getTime())
    ? savedAtRaw
    : new Date().toISOString();

  return {
    id,
    name,
    cols: clampCols(raw.cols),
    currencyCode: normalizeCode(raw.currencyCode) || 'EUR',
    includeNotes: raw.includeNotes === true,
    bookIds,
    qtyBrought,
    customBooks,
    savedAt,
  };
}

export function sortStPresets(presets) {
  return [...(presets || [])].sort((a, b) =>
    String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })
  );
}

export function loadStPresets(storage) {
  try {
    const raw = storage?.getItem(ST_PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
    return sortStPresets(list.map(normalizeStPreset).filter(Boolean));
  } catch {
    return [];
  }
}

export function saveStPresets(storage, presets) {
  const clean = sortStPresets((presets || []).map(normalizeStPreset).filter(Boolean));
  try {
    storage?.setItem(ST_PRESET_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // A full or unavailable quota shouldn't lose the in-memory list; the caller
    // still gets the normalized presets back and the UI stays consistent.
  }
  return clean;
}

export function upsertStPreset(presets, preset) {
  const normalized = normalizeStPreset(preset);
  const existing = (presets || []).map(normalizeStPreset).filter(Boolean);
  if (!normalized) return sortStPresets(existing);
  return sortStPresets([...existing.filter((p) => p.id !== normalized.id), normalized]);
}

export function removeStPreset(presets, id) {
  const target = stPresetId(id);
  return sortStPresets((presets || []).map(normalizeStPreset).filter(Boolean).filter((p) => p.id !== target));
}

export function findStPreset(presets, id) {
  const target = stPresetId(id);
  if (!target) return null;
  return (presets || []).find((p) => p && p.id === target) || null;
}

// Book ids a preset remembers that no longer exist in the catalog — a title
// retired since the last fair. Custom titles aren't checked here: a preset
// recreates them wholesale, so there's nothing in the catalog for them to
// fall out of.
export function stPresetMissingBooks(preset, availableIds) {
  if (!preset || !Array.isArray(preset.bookIds)) return [];
  const available = new Set(availableIds || []);
  return preset.bookIds.filter((id) => !available.has(id));
}

function totalPacked(preset) {
  const fromCatalog = Object.values(preset.qtyBrought || {}).reduce((sum, n) => sum + n, 0);
  const fromCustom = (preset.customBooks || []).reduce((sum, b) => sum + (b.qty || 0), 0);
  return fromCatalog + fromCustom;
}

// One-line description for the preset picker, e.g.
// "9 titles · 64 packed · EUR · 10 cols".
export function stPresetSummary(preset) {
  if (!preset) return '';
  const parts = [];
  const titleCount = (preset.bookIds?.length || 0) + (preset.customBooks?.length || 0);
  parts.push(`${titleCount} title${titleCount === 1 ? '' : 's'}`);
  const packed = totalPacked(preset);
  if (packed > 0) parts.push(`${packed} packed`);
  parts.push(preset.currencyCode);
  parts.push(`${preset.cols} col${preset.cols === 1 ? '' : 's'}`);
  if (preset.includeNotes) parts.push('price rows');
  return parts.join(' · ');
}
