// On-device receipt cache — the copy that survives the folder moving.
//
// Local receipts are reached through a stored FileSystemDirectoryHandle. That
// handle points at a folder, not a path, and when the folder is moved, renamed
// at an ancestor level, or lands on another volume, the handle goes stale. Every
// lookup in resolveLocalReceiptFile() runs *through* that handle — the
// `receipts/` subfolder, the folder root, and the deep search by basename alike
// — so when it dies they do not degrade one at a time, they all fail at once and
// every receipt in the ledger stops opening together.
//
// Cloud storage is no longer a second source either: a receipt that has been
// filed locally has had its cloud copy deleted on purpose, which is the whole
// point of the reclaim.
//
// So the bytes are also kept here, in IndexedDB, keyed by the receipt reference
// and reachable with no folder involved at all. The folder stays the system of
// record — this is what makes a receipt render while the folder is missing, and
// what gives the owner something to look at while they reconnect it.
//
// This module is the decision-making half and is deliberately free of browser
// storage APIs so it can be tested directly: what is worth caching, at what
// size, and what to drop when the budget is reached. main.js owns the IndexedDB
// and canvas work.

/** Total the cache may occupy before older entries are evicted. */
export const RECEIPT_CACHE_BUDGET_BYTES = 250 * 1024 * 1024;

/** Longest edge, in pixels, of a downscaled preview. */
export const PREVIEW_MAX_EDGE = 2000;

/** JPEG quality for downscaled previews. */
export const PREVIEW_QUALITY = 0.72;

/**
 * Images at or under this size are cached byte-for-byte.
 *
 * Above it a preview is kept instead — a phone photo of a receipt is commonly
 * 4-8MB, and a few hundred of those would blow any realistic browser quota,
 * while a 2000px JPEG of the same receipt stays readable at a fraction of it.
 * The original is still the file on disk; this is the standby copy.
 */
export const ORIGINAL_KEEP_MAX_BYTES = 1.5 * 1024 * 1024;

/** PDFs cannot be downscaled here, so they are kept whole or not at all. */
export const PDF_KEEP_MAX_BYTES = 8 * 1024 * 1024;

/** Strip `local://` so a reference and a bare path resolve to the same entry. */
export function cacheKeyFor(ref) {
  if (!ref) return '';
  const s = String(ref);
  return (s.startsWith('local://') ? s.slice('local://'.length) : s).replace(/^\/+/, '');
}

function extensionOf(name) {
  const dot = String(name || '').lastIndexOf('.');
  return dot > 0 ? String(name).slice(dot + 1).toLowerCase() : '';
}

export function isPdf(type, name) {
  return /pdf/i.test(type || '') || extensionOf(name) === 'pdf';
}

export function isImage(type, name) {
  if (/^image\//i.test(type || '')) return true;
  return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif'].includes(extensionOf(name));
}

/**
 * Decide how a given receipt file should be cached.
 *
 * Returns `{ store, reason }` where store is:
 *   'original' — keep the exact bytes
 *   'preview'  — downscale to a readable image first
 *   'skip'     — too large to be worth a standby copy
 *
 * An unrecognised type is kept as-is when small: a receipt in an odd format is
 * still a receipt, and guessing wrong towards keeping it costs only space.
 */
export function cachePlanFor({ size = 0, type = '', name = '' } = {}) {
  if (!size) return { store: 'skip', reason: 'empty file' };

  if (isPdf(type, name)) {
    return size <= PDF_KEEP_MAX_BYTES
      ? { store: 'original', reason: 'pdf within budget' }
      : { store: 'skip', reason: 'pdf too large to cache' };
  }

  if (isImage(type, name)) {
    return size <= ORIGINAL_KEEP_MAX_BYTES
      ? { store: 'original', reason: 'image already small' }
      : { store: 'preview', reason: 'image downscaled to preview' };
  }

  return size <= ORIGINAL_KEEP_MAX_BYTES
    ? { store: 'original', reason: 'unknown type kept whole' }
    : { store: 'skip', reason: 'unknown type too large' };
}

/**
 * Fit an image inside a square bound, preserving aspect ratio.
 * Images already inside the bound are returned unchanged rather than upscaled.
 */
export function previewDimensions(width, height, maxEdge = PREVIEW_MAX_EDGE) {
  const w = Math.max(1, Math.round(width || 0));
  const h = Math.max(1, Math.round(height || 0));
  const longest = Math.max(w, h);
  if (!longest || longest <= maxEdge) return { width: w, height: h, scaled: false };
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(w * ratio)),
    height: Math.max(1, Math.round(h * ratio)),
    scaled: true,
  };
}

/**
 * Which cached entries to drop to get back under budget, least-recently-seen
 * first. Entries are `{ key, size, lastSeenAt }`.
 *
 * Recency beats age deliberately: a receipt opened last week is one the owner is
 * working with, even if it was filed two years ago.
 */
export function planEviction(entries, budgetBytes = RECEIPT_CACHE_BUDGET_BYTES) {
  const list = (entries || []).filter(e => e && e.key);
  let total = list.reduce((sum, e) => sum + (e.size || 0), 0);
  if (total <= budgetBytes) return [];

  const byOldest = [...list].sort((a, b) => {
    const at = new Date(a.lastSeenAt || 0).getTime() || 0;
    const bt = new Date(b.lastSeenAt || 0).getTime() || 0;
    return at - bt;
  });

  const evict = [];
  for (const entry of byOldest) {
    if (total <= budgetBytes) break;
    evict.push(entry.key);
    total -= entry.size || 0;
  }
  return evict;
}

/** Roll cache entries up for the "receipts available offline" readout. */
export function cacheStats(entries) {
  const list = (entries || []).filter(Boolean);
  return {
    count: list.length,
    bytes: list.reduce((sum, e) => sum + (e.size || 0), 0),
    previews: list.filter(e => e.kind === 'preview').length,
  };
}

/**
 * Which local receipts have no cached copy yet.
 *
 * Receipts saved before the cache existed are exactly the ones most exposed to a
 * folder move, so the backfill needs to find them. `refs` are receipt
 * references; `cachedKeys` is what the cache already holds.
 */
export function uncachedRefs(refs, cachedKeys) {
  const have = new Set(cachedKeys || []);
  const seen = new Set();
  const out = [];
  (refs || []).forEach(ref => {
    const key = cacheKeyFor(ref);
    if (!key || have.has(key) || seen.has(key)) return;
    seen.add(key);
    out.push(ref);
  });
  return out;
}

/** Human-sized byte count for the cache readout. */
export function formatCacheSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
