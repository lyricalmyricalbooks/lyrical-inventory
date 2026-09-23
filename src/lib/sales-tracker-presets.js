// Pure helpers for "fair presets" on the printable sales-tracker sheet — a
// named snapshot of the tally sheet setup (layout, currency, which titles,
// how many copies of each are packed for the trip, and any one-off titles
// that aren't in the catalog at all, like a zine only sold at fairs).
//
// Same shape of problem as the QR-sheet presets in ./qr-presets.js — rebuild
// this by hand every fair and something gets left off the packing list — but
// this sheet's fields are different (a tally-column count up to 30, no base
// currency/price-column set, and a packed-quantity per title instead of a
// price override), so it keeps its own normalizer and shares only the
// list/storage plumbing in ./fair-presets.js.

import {
  createPresetList,
  MAX_PRESET_NAME_LENGTH,
  normalizeCurrencyCode,
  presetId,
  presetMissingBooks,
  sortPresets,
} from './fair-presets.js';

export const ST_PRESET_STORAGE_KEY = 'lm_sales_tracker_fair_presets_v1';

const MAX_COLS = 30;

export const stPresetId = presetId;

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
  const name = String(raw.name || '').trim().slice(0, MAX_PRESET_NAME_LENGTH);
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
    currencyCode: normalizeCurrencyCode(raw.currencyCode) || 'EUR',
    includeNotes: raw.includeNotes === true,
    bookIds,
    qtyBrought,
    customBooks,
    savedAt,
  };
}

export const sortStPresets = sortPresets;

const stPresetList = createPresetList(ST_PRESET_STORAGE_KEY, normalizeStPreset);
export const loadStPresets = stPresetList.load;
export const saveStPresets = stPresetList.save;
export const upsertStPreset = stPresetList.upsert;
export const removeStPreset = stPresetList.remove;
export const findStPreset = stPresetList.find;

// Book ids a preset remembers that no longer exist in the catalog — a title
// retired since the last fair. Custom titles aren't checked here: a preset
// recreates them wholesale, so there's nothing in the catalog for them to
// fall out of.
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
