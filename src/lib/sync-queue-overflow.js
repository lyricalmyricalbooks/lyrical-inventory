/**
 * sync-queue-overflow.js — where the offline sales queue goes when localStorage
 * is full.
 *
 * The queue (see sync-queue-store.js) holds a copy of each book with changes
 * waiting to upload, and localStorage only has room for about 5 MB per site. A
 * big book could fill it, and the sale then lived only in memory: closing the
 * app before the signal came back lost it. IndexedDB has a far larger allowance
 * (a share of the free disk), so a queue that doesn't fit in localStorage is
 * kept here instead, under the same per-tab key, and read back on the next
 * start. localStorage stays the first choice because it can be read
 * synchronously at startup.
 *
 * Every method resolves and never rejects: a storage problem must not stop the
 * upload being attempted. `indexedDB` is passed in so this can be tested
 * without a browser (same pattern as receipt-finder-store.js).
 */

const STORE = 'queues';

export function createSyncOverflowStore(indexedDB = globalThis.indexedDB, dbName = 'lm-sync-overflow') {
  function open() {
    return new Promise(resolve => {
      if (!indexedDB || typeof indexedDB.open !== 'function') { resolve(null); return; }
      let req;
      try { req = indexedDB.open(dbName, 1); } catch (_) { resolve(null); return; }
      req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE); } catch (_) { /* exists */ } };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }

  // Resolves with `pick(request)` once the transaction has committed, or with
  // `fallback` if anything failed.
  async function run(mode, action, pick, fallback) {
    const db = await open();
    if (!db) return fallback;
    return new Promise(resolve => {
      let tx;
      let req;
      try {
        tx = db.transaction(STORE, mode);
        req = action(tx.objectStore(STORE));
      } catch (_) {
        try { db.close(); } catch (_) { /* closed */ }
        resolve(fallback);
        return;
      }
      tx.oncomplete = () => { try { db.close(); } catch (_) { /* closed */ } resolve(pick(req)); };
      tx.onabort = tx.onerror = () => { try { db.close(); } catch (_) { /* closed */ } resolve(fallback); };
    });
  }

  return {
    /** Store one tab's queue. Resolves true once it has committed. */
    put: (key, queue) => run('readwrite', store => store.put(JSON.parse(JSON.stringify(queue)), key), () => true, false),
    /** Resolves true once that key is gone. */
    remove: key => run('readwrite', store => store.delete(key), () => true, false),
    /** Every stored queue, as `{ key, queue }`. */
    readAll: () => run('readonly', store => {
      const keys = store.getAllKeys();
      const values = store.getAll();
      return { keys, values };
    }, ({ keys, values }) => (keys.result || []).map((key, i) => ({
      key: String(key),
      queue: Array.isArray(values.result?.[i]) ? values.result[i] : [],
    })), []),
  };
}
