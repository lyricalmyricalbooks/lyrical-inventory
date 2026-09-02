/**
 * IndexedDB storage for downloaded Canada Post shipping label PDF artifacts.
 *
 * Sits alongside label-archive.js:
 * - label-archive.js holds the JSON metadata & vector geometry (in localStorage).
 * - label-cache.js holds the raw PDF binary Blob in IndexedDB for instant,
 *   full-fidelity offline reprints with zero network latency.
 */

import { archiveKeyForPin } from './label-archive.js';

export const LABEL_CACHE_DB = 'lm-shipping-labels-db';
export const LABEL_CACHE_STORE = 'label_artifacts';

/**
 * Open the IndexedDB database instance. Returns null if IndexedDB is not supported.
 */
export async function openLabelCacheDb() {
  if (typeof indexedDB === 'undefined') return null;

  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(LABEL_CACHE_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LABEL_CACHE_STORE)) {
          db.createObjectStore(LABEL_CACHE_STORE, { keyPath: 'pin' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Store a downloaded label PDF Blob in IndexedDB.
 * Never throws — a cache write failure must never block application flow.
 */
export async function storeCachedLabelPdf(pin, blob, metadata = {}) {
  const key = archiveKeyForPin(pin);
  if (!key || !blob) return false;

  const db = await openLabelCacheDb();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(LABEL_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(LABEL_CACHE_STORE);
      const record = {
        pin: key,
        rawPin: String(pin || '').trim(),
        blob,
        mimeType: blob.type || 'application/pdf',
        size: blob.size || 0,
        storedAt: new Date().toISOString(),
        ...metadata
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      tx.oncomplete = () => db.close();
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Retrieve a cached label PDF from IndexedDB by tracking PIN.
 * Returns { blob, storedAt, pin, ... } or null if not found.
 */
export async function getCachedLabelPdf(pin) {
  const key = archiveKeyForPin(pin);
  if (!key) return null;

  const db = await openLabelCacheDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(LABEL_CACHE_STORE, 'readonly');
      const store = tx.objectStore(LABEL_CACHE_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const res = req.result;
        resolve(res && res.blob ? res : null);
      };
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Delete a cached label PDF from IndexedDB (e.g. on label void or refund).
 */
export async function deleteCachedLabelPdf(pin) {
  const key = archiveKeyForPin(pin);
  if (!key) return false;

  const db = await openLabelCacheDb();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(LABEL_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(LABEL_CACHE_STORE);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      tx.oncomplete = () => db.close();
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Clear all cached label PDFs.
 */
export async function clearLabelCache() {
  const db = await openLabelCacheDb();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(LABEL_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(LABEL_CACHE_STORE);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      tx.oncomplete = () => db.close();
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
