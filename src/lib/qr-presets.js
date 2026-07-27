// Pure helpers for "fair presets" — named snapshots of the printable payment-QR
// sheet setup (layout, base currency, which price columns, which books, and the
// per-book price overrides).
//
// Rebuilding that setup by hand on the morning of every event is where mistakes
// get printed: a stall in Mexico City wants pesos and its own door prices, a
// Turin fair wants euros, and the QR on the card is only right if the whole
// form is right. A preset recalls the entire sheet in one click.
//
// Kept dependency-free (storage is injected) so the rules can be unit-tested
// without a DOM, and so a corrupt or half-written localStorage entry degrades
// to "no presets" instead of breaking the print modal.

export const QR_PRESET_STORAGE_KEY = 'lm_qr_fair_presets_v1';

// Price columns the sheet can print, in the order they appear on a card.
export const QR_PRESET_PRICE_CURRENCIES = ['CAD', 'EUR', 'USD', 'MXN'];

const MAX_NAME_LENGTH = 60;

// Stable id derived from the name, so saving under an existing name updates
// that preset instead of quietly stacking up near-duplicates.
export function qrPresetId(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_NAME_LENGTH);
}

function clampCols(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(6, n));
}

function normalizeCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

// Coerce whatever is on disk into a preset this app can apply, or null when it
// carries nothing usable. Never throws: a preset written by an older build (or
// a hand-edited localStorage entry) must not take the print modal down with it.
export function normalizeQrPreset(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim().slice(0, MAX_NAME_LENGTH);
  if (!name) return null;
  const id = qrPresetId(raw.id || name) || qrPresetId(name);
  if (!id) return null;

  const baseCurRaw = String(raw.baseCur || 'auto').trim();
  const baseCur = baseCurRaw.toLowerCase() === 'auto' ? 'auto' : (normalizeCode(baseCurRaw) || 'auto');

  const currencies = [];
  if (Array.isArray(raw.currencies)) {
    for (const entry of raw.currencies) {
      const code = normalizeCode(entry);
      if (code && !currencies.includes(code)) currencies.push(code);
    }
  }

  const bookIds = [];
  if (Array.isArray(raw.bookIds)) {
    for (const entry of raw.bookIds) {
      const id_ = String(entry || '').trim();
      if (id_ && !bookIds.includes(id_)) bookIds.push(id_);
    }
  }

  // Only positive finite prices survive: a stored NaN or negative would print a
  // QR that charges the wrong amount, which is worse than printing no override.
  const overrides = {};
  if (raw.overrides && typeof raw.overrides === 'object') {
    for (const [bookId, value] of Object.entries(raw.overrides)) {
      const key = String(bookId || '').trim();
      const amount = Number(value);
      if (key && Number.isFinite(amount) && amount > 0) overrides[key] = amount;
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
    baseCur,
    currencies,
    fitOnePage: raw.fitOnePage !== false,
    bookIds,
    overrides,
    savedAt,
  };
}

export function sortQrPresets(presets) {
  return [...(presets || [])].sort((a, b) =>
    String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })
  );
}

export function loadQrPresets(storage) {
  try {
    const raw = storage?.getItem(QR_PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Tolerate both the array shape and an older id-keyed object shape.
    const list = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
    return sortQrPresets(list.map(normalizeQrPreset).filter(Boolean));
  } catch {
    return [];
  }
}

export function saveQrPresets(storage, presets) {
  const clean = sortQrPresets((presets || []).map(normalizeQrPreset).filter(Boolean));
  try {
    storage?.setItem(QR_PRESET_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // A full or unavailable quota shouldn't lose the in-memory list; the caller
    // still gets the normalized presets back and the UI stays consistent.
  }
  return clean;
}

export function upsertQrPreset(presets, preset) {
  const normalized = normalizeQrPreset(preset);
  const existing = (presets || []).map(normalizeQrPreset).filter(Boolean);
  if (!normalized) return sortQrPresets(existing);
  return sortQrPresets([...existing.filter((p) => p.id !== normalized.id), normalized]);
}

export function removeQrPreset(presets, id) {
  const target = qrPresetId(id);
  return sortQrPresets((presets || []).map(normalizeQrPreset).filter(Boolean).filter((p) => p.id !== target));
}

export function findQrPreset(presets, id) {
  const target = qrPresetId(id);
  if (!target) return null;
  return (presets || []).find((p) => p && p.id === target) || null;
}

// Book ids a preset remembers that no longer exist in the catalog — a title
// retired between fairs. Surfaced so the seller learns why the sheet came back
// one card short instead of discovering it at the table.
export function qrPresetMissingBooks(preset, availableIds) {
  if (!preset || !Array.isArray(preset.bookIds)) return [];
  const available = new Set(availableIds || []);
  return preset.bookIds.filter((id) => !available.has(id));
}

// One-line description for the preset picker, e.g.
// "8 books · MXN base · CAD/MXN · 4 cols".
export function qrPresetSummary(preset) {
  if (!preset) return '';
  const parts = [];
  const bookCount = Array.isArray(preset.bookIds) ? preset.bookIds.length : 0;
  parts.push(`${bookCount} book${bookCount === 1 ? '' : 's'}`);
  parts.push(preset.baseCur === 'auto' ? 'native base' : `${preset.baseCur} base`);
  if (preset.currencies?.length) parts.push(preset.currencies.join('/'));
  parts.push(`${preset.cols} col${preset.cols === 1 ? '' : 's'}`);
  const overrideCount = Object.keys(preset.overrides || {}).length;
  if (overrideCount) parts.push(`${overrideCount} priced`);
  return parts.join(' · ');
}
