// A device-local copy of each book's old-storage (Realtime Database) record,
// so the Website orders card's Storage check doesn't download every book's
// whole history from the old storage on every start.
//
// The old copy is never deleted and almost never changes once a book has moved
// to Firestore, yet the check used to fetch all of it, for every book, each
// time the app opened. The Realtime Database bills by data downloaded, so that
// was the app's largest recurring download. Every write to the old storage
// stamps `ts` with the time of the write (database.rules.json requires it), so
// reading just `ts` — a few bytes — says whether the copy kept here is still
// the one the server holds. Only a changed (or never seen) copy is downloaded.
//
// The answer is the same as reading the whole record every time: a matching
// stamp returns the very text that was downloaded with it.

export const OLD_COPY_DB = 'lm-old-copy-cache';
export const OLD_COPY_STORE = 'books';

/**
 * The old-storage JSON text for a book, or null when it has none.
 *   readTs   () => Promise<number|null>   the record's `ts` on the server
 *   readFull () => Promise<{ json, ts }|null>  the whole record
 *   cache    { get(id) => Promise<{ ts, json }|null>, put(id, value) => Promise }
 * Read failures propagate, as the uncached read's did; cache failures never do.
 */
export async function readOldCopyCached(bookId, { readTs, readFull, cache = null } = {}) {
  const ts = await readTs();
  if (typeof ts === 'number' && cache) {
    let kept = null;
    try { kept = await cache.get(bookId); } catch (_) { kept = null; }
    if (kept && kept.ts === ts && typeof kept.json === 'string') return kept.json;
  }
  const full = await readFull();
  if (!full || typeof full.json !== 'string' || !full.json) return null;
  if (cache && typeof full.ts === 'number') {
    try { await cache.put(bookId, { ts: full.ts, json: full.json }); } catch (_) { /* next check downloads again */ }
  }
  return full.json;
}

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(OLD_COPY_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OLD_COPY_STORE)) db.createObjectStore(OLD_COPY_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

function run(mode, fn) {
  return openDb().then(db => {
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(OLD_COPY_STORE, mode);
        const req = fn(tx.objectStore(OLD_COPY_STORE));
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
        tx.oncomplete = () => db.close();
        tx.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  });
}

/** The IndexedDB-backed cache; behaves as an always-empty cache where IndexedDB is unavailable. */
export const oldCopyCache = {
  get: (bookId) => run('readonly', store => store.get(String(bookId))),
  put: (bookId, value) => run('readwrite', store => store.put(value, String(bookId))),
};
