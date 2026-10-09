/**
 * sync-queue-store.js — safe load/persist for the offline sales queue.
 *
 * When a sale or edit can't reach the cloud, `queueSync()` in main.js parks the
 * latest state of that book in a queue that is mirrored to localStorage, so the
 * change survives the app being closed before signal returns. Two things about
 * device storage make a bare `JSON.parse(getItem())` / `setItem()` pair unsafe:
 *
 *  - The stored value can be unreadable (truncated write, another tab or an
 *    extension scribbling on it, blocked storage that throws on access). A throw
 *    at module load stopped the whole app from starting.
 *  - Queue items are whole book states and can be large, so a write can fail
 *    with QuotaExceededError. That throw used to escape queueSync before the
 *    retry was kicked off, leaving the sale only in memory with no warning.
 *
 * Both functions here never throw. Storage is passed in (anything with the Web
 * Storage getItem/setItem/removeItem shape) so the behaviour is unit-testable
 * without a browser. Same precedent as persistSheetsQueue() in main.js.
 */

export const SYNC_QUEUE_KEY = 'lm-sync-queue';
/** Where an unreadable queue value is copied before it is set aside. */
export const SYNC_QUEUE_CORRUPT_KEY = 'lm-sync-queue-corrupt';

/**
 * Resolve window.localStorage without throwing. Some browsers throw a
 * SecurityError on the property access itself when site data is blocked.
 *
 * @returns {Storage|null}
 */
export function getLocalStorage() {
  try {
    const s = globalThis.localStorage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch (_) {
    return null;
  }
}

/**
 * True for the family of errors browsers throw when storage is full (or, in
 * some older private-browsing modes, has a zero quota).
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isQuotaError(err) {
  if (!err || typeof err !== 'object') return false;
  const name = /** @type {{name?: unknown}} */ (err).name;
  const code = /** @type {{code?: unknown}} */ (err).code;
  return name === 'QuotaExceededError'
    || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || code === 22
    || code === 1014;
}

/** A queue entry main.js can actually upload: a book id and a state object. */
function isValidItem(item) {
  return !!item
    && typeof item === 'object'
    && typeof item.bookId === 'string'
    && item.bookId !== ''
    && !!item.state
    && typeof item.state === 'object';
}

/**
 * Read the persisted queue. Never throws.
 *
 * - Missing key → empty queue, nothing discarded.
 * - Storage unavailable / getItem throws → empty queue, `unavailable: true`.
 * - Bad JSON, a non-array, or entries that can't be uploaded → whatever is
 *   usable is kept, `discarded: true`, and the raw value is copied to
 *   SYNC_QUEUE_CORRUPT_KEY (best effort) so it can be recovered by hand. Only
 *   once that copy has landed is the main key rewritten with the usable part;
 *   if the copy fails the original is left where it is rather than destroyed.
 *
 * @param {Storage|null|undefined} storage
 * @returns {{queue: Array<{bookId: string, state: object, ts?: number}>,
 *            discarded: boolean, droppedCount: number, backedUp: boolean,
 *            unavailable: boolean}}
 */
export function loadSyncQueue(storage, key = SYNC_QUEUE_KEY) {
  const result = { queue: [], discarded: false, droppedCount: 0, backedUp: false, unavailable: false };
  if (!storage) {
    result.unavailable = true;
    return result;
  }

  let raw;
  try {
    raw = storage.getItem(key);
  } catch (_) {
    result.unavailable = true;
    return result;
  }
  if (raw === null || raw === undefined || raw === '') return result;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    parsed = undefined;
  }

  if (Array.isArray(parsed)) {
    result.queue = parsed.filter(isValidItem);
    result.droppedCount = parsed.length - result.queue.length;
  } else {
    // Unparseable, or valid JSON of the wrong shape (an object, a number…).
    // There is no telling how many changes it held; count it as one loss.
    result.droppedCount = 1;
  }
  if (!result.droppedCount) return result;

  result.discarded = true;
  try {
    storage.setItem(SYNC_QUEUE_CORRUPT_KEY, String(raw));
    result.backedUp = true;
  } catch (_) { /* full or blocked — leave the original in place instead */ }

  if (result.backedUp) {
    // Rewrite the main key so the next launch doesn't re-report the same damage.
    persistSyncQueue(storage, result.queue, key);
  }
  return result;
}

/**
 * Write the queue. Never throws. An empty queue is written as a removal, which
 * cannot hit the quota — so draining the queue always clears the on-disk copy
 * and an already-uploaded change can't be replayed on the next launch.
 *
 * @param {Storage|null|undefined} storage
 * @param {Array} queue
 * @returns {{ok: true} | {ok: false, reason: 'quota'|'unavailable'|'error', error?: unknown}}
 */
export function persistSyncQueue(storage, queue, key = SYNC_QUEUE_KEY) {
  if (!storage) return { ok: false, reason: 'unavailable' };
  // Never let a bad argument turn into "wipe the stored queue".
  if (!Array.isArray(queue)) return { ok: false, reason: 'error' };
  try {
    if (queue.length === 0) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, JSON.stringify(queue));
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: isQuotaError(error) ? 'quota' : 'error', error };
  }
}

// ─── One queue per open tab ─────────────────────────────────────────────────
//
// Every open tab used to mirror its own in-memory queue over the single
// SYNC_QUEUE_KEY. Two tabs each holding an offline sale erased each other's
// copy on every write, so closing one before it uploaded lost its sale.
//
// Now each tab writes only its own key (SYNC_QUEUE_KEY + ':' + tab id), which
// no other tab ever overwrites, and keeps a heartbeat. A tab that stops beating
// (closed, crashed, frozen in the background) leaves its key behind as an
// orphan, and whichever tab next looks adopts those changes and uploads them.
// The legacy shared key, written by builds before this one, is always an orphan.

/** Heartbeat key prefix; the value is the epoch ms the tab was last seen. */
export const SYNC_TAB_PREFIX = 'lm-sync-tab:';
/** sessionStorage key holding this tab's id across reloads of the same tab. */
export const SYNC_TAB_SESSION_KEY = 'lm-sync-tab-id';
/** How often a live tab beats. */
export const SYNC_TAB_HEARTBEAT_MS = 15000;
/**
 * A tab not seen for this long is treated as gone and its queue adopted.
 * Generous on purpose: browsers slow a background tab's timers to about once a
 * minute, and adopting a live tab's queue would upload its changes twice. A tab
 * that closes normally removes its heartbeat, so its changes are adopted at once.
 */
export const SYNC_TAB_STALE_MS = 3 * 60_000;

/** The storage key holding one tab's queue. */
export function queueKeyFor(tabId) {
  return `${SYNC_QUEUE_KEY}:${tabId}`;
}

function readNumber(storage, key) {
  try {
    const n = Number(storage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (_) {
    return null;
  }
}

/**
 * This tab's id. Kept in sessionStorage so a reload of the same tab picks its
 * own queue straight back up. A duplicated tab inherits sessionStorage too, so
 * an id whose heartbeat is still fresh belongs to another live tab (a closing
 * tab removes its heartbeat on the way out) and a new id is minted instead.
 * Never throws.
 *
 * @param {Storage|null} session  sessionStorage
 * @param {Storage|null} storage  localStorage
 * @param {{now?: number, random?: () => string}} [opts]
 */
export function getSyncTabId(session, storage, { now = Date.now(), random } = {}) {
  const mint = random || (() => Math.random().toString(36).slice(2, 10) + now.toString(36));
  let id = null;
  try { id = session ? session.getItem(SYNC_TAB_SESSION_KEY) : null; } catch (_) { id = null; }
  if (id && storage) {
    const seen = readNumber(storage, SYNC_TAB_PREFIX + id);
    if (seen && now - seen < SYNC_TAB_STALE_MS) id = null;
  }
  if (!id) {
    id = mint();
    try { if (session) session.setItem(SYNC_TAB_SESSION_KEY, id); } catch (_) { /* per-load id then */ }
  }
  return id;
}

/** Record that this tab is alive. Never throws. */
export function markTabAlive(storage, tabId, now = Date.now()) {
  try { if (storage) storage.setItem(SYNC_TAB_PREFIX + tabId, String(now)); } catch (_) { /* best effort */ }
}

/** Drop this tab's heartbeat so its queue can be adopted straight away. Never throws. */
export function markTabGone(storage, tabId) {
  try { if (storage) storage.removeItem(SYNC_TAB_PREFIX + tabId); } catch (_) { /* best effort */ }
}

function storageKeys(storage) {
  const keys = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k != null) keys.push(k);
    }
  } catch (_) { /* unreadable storage has no orphans we can reach */ }
  return keys;
}

/**
 * Queue keys left behind by tabs that are gone, plus the legacy shared key.
 * Never throws.
 *
 * @returns {string[]}
 */
export function findOrphanQueueKeys(storage, myTabId, now = Date.now(), staleMs = SYNC_TAB_STALE_MS) {
  if (!storage) return [];
  const prefix = `${SYNC_QUEUE_KEY}:`;
  const out = [];
  for (const key of storageKeys(storage)) {
    if (key === SYNC_QUEUE_KEY) { out.push(key); continue; }
    if (!key.startsWith(prefix)) continue;
    const owner = key.slice(prefix.length);
    if (!owner || owner === myTabId) continue;
    const seen = readNumber(storage, SYNC_TAB_PREFIX + owner);
    if (!seen || now - seen >= staleMs) out.push(key);
  }
  return out;
}

/**
 * Read the changes waiting under orphaned queue keys, marked `adopted` (they
 * were made in another tab, so they are never superseded by an edit made here)
 * and given an id if they lack one. Does NOT delete anything: the caller first
 * stores them under its own key, then calls releaseOrphanKeys — so a failed
 * write leaves them where they were instead of in memory only. Never throws.
 *
 * @returns {{items: object[], keys: string[]}}
 */
export function readOrphanQueues(storage, myTabId, now = Date.now()) {
  const keys = findOrphanQueueKeys(storage, myTabId, now);
  const items = [];
  for (const key of keys) {
    const { queue } = loadSyncQueue(storage, key);
    queue.forEach((item, i) => {
      items.push({ ...item, adopted: true, qid: item.qid || `${key}#${item.ts || 0}#${i}` });
    });
  }
  return { items, keys };
}

/** Remove orphan keys once their changes are safely stored elsewhere. Never throws. */
export function releaseOrphanKeys(storage, keys) {
  for (const key of keys || []) {
    try { storage.removeItem(key); } catch (_) { /* left for the next pass; ids dedupe it */ }
    const owner = key.startsWith(`${SYNC_QUEUE_KEY}:`) ? key.slice(SYNC_QUEUE_KEY.length + 1) : null;
    if (owner) markTabGone(storage, owner);
  }
}

/**
 * The next queued change that may upload now, or null. Changes to one book go
 * out in the order they were queued, and a change made on top of another that
 * is still uploading waits for it (`after`). A change backing off after a
 * failure (`retryAt` in the future) is skipped so it can't hold up other books.
 */
export function pickNextSyncItem(queue, now = Date.now()) {
  const list = Array.isArray(queue) ? queue : [];
  const qids = new Set(list.map(item => item && item.qid).filter(Boolean));
  const blockedBooks = new Set();
  for (const item of list) {
    if (!item) continue;
    const waiting = (item.after && qids.has(item.after)) || (item.retryAt && item.retryAt > now);
    if (!blockedBooks.has(item.bookId) && !waiting) return item;
    blockedBooks.add(item.bookId);
  }
  return null;
}
