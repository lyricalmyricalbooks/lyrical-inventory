/**
 * safe-storage.js — device storage reads and writes that never throw.
 *
 * Two everyday conditions make a bare localStorage call throw: site data
 * blocked in the browser (the property access itself raises a SecurityError)
 * and a full device (`setItem` raises QuotaExceededError — the Big Cartel
 * order cache alone can run to megabytes). Most of the app already guards its
 * reads; these cover the few start-up reads and the "also keep a copy on this
 * device" writes that ran unguarded, where a throw stopped the app from
 * starting or turned a successful cloud save into an error halfway through.
 */
import { getLocalStorage } from './sync-queue-store.js';

/**
 * @param {string} key
 * @param {string} [fallback]
 * @returns {string}
 */
export function storageGet(key, fallback = '') {
  try {
    const s = getLocalStorage();
    const v = s ? s.getItem(key) : null;
    return v == null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {string} value
 * @returns {boolean} whether the value was kept
 */
export function storageSet(key, value) {
  try {
    const s = getLocalStorage();
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch (_) {
    return false;
  }
}
