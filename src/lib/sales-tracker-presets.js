// Pure helpers for "fair presets" on the printable sales-tracker sheet — a
// named snapshot of the tally sheet setup (layout, currency, which titles,
// how many copies of each are packed for the trip, and any one-off titles
// that aren't in the catalog at all, like a zine only sold at fairs).
//
// Same shape of problem as the QR-sheet presets in ./qr-presets.js — rebuild
// this by hand every fair and something gets left off the packing list — but
// this sheet's fields are different (a tally-column count up to 30, no base
// currency/price-column set, and a packed-quantity per title instead of a
// price override), so it owns its own fields here while naming, storage and
// lookup come from the shared ./fair-presets.js.

import {
  createPresetList,
  normalizeCurrencyCode,
  normalizeIdList,
  normalizePresetIdentity,
  normalizeSavedAt,
  presetIdFromName,
  presetMissingBooks,
  sortPresetsByName,
} from './fair-presets.js';

export const ST_PRESET_STORAGE_KEY = 'lm_sales_tracker_fair_presets_v1';

const MAX_COLS = 30;

// Stable id derived from the name, so saving under an existing name updates
// that preset instead of quietly stacking up near-duplicates.
export const stPresetId = presetIdFromName;

function clampCols(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.min(MAX_COLS, n));
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
  const identity = normalizePresetIdentity(raw);
  if (!identity) return null;

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

  return {
    ...identity,
    cols: clampCols(raw.cols),
    currencyCode: normalizeCurrencyCode(raw.currencyCode) || 'EUR',
    includeNotes: raw.includeNotes === true,
    bookIds: normalizeIdList(raw.bookIds),
    qtyBrought,
    customBooks,
    savedAt: normalizeSavedAt(raw.savedAt),
  };
}

const stPresets = createPresetList({ storageKey: ST_PRESET_STORAGE_KEY, normalize: normalizeStPreset });

export const sortStPresets = sortPresetsByName;
export const loadStPresets = stPresets.load;
export const saveStPresets = stPresets.save;
export const upsertStPreset = stPresets.upsert;
export const removeStPreset = stPresets.remove;
export const findStPreset = stPresets.find;
// Custom titles aren't checked for missing books: a preset recreates them
// wholesale, so there's nothing in the catalog for them to fall out of.
export const stPresetMissingBooks = presetMissingBooks;

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
