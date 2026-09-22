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
export function loadSyncQueue(storage) {
  const result = { queue: [], discarded: false, droppedCount: 0, backedUp: false, unavailable: false };
  if (!storage) {
    result.unavailable = true;
    return result;
  }

  let raw;
  try {
    raw = storage.getItem(SYNC_QUEUE_KEY);
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
    persistSyncQueue(storage, result.queue);
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
export function persistSyncQueue(storage, queue) {
  if (!storage) return { ok: false, reason: 'unavailable' };
  // Never let a bad argument turn into "wipe the stored queue".
  if (!Array.isArray(queue)) return { ok: false, reason: 'error' };
  try {
    if (queue.length === 0) {
      storage.removeItem(SYNC_QUEUE_KEY);
    } else {
      storage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: isQuotaError(error) ? 'quota' : 'error', error };
  }
}
