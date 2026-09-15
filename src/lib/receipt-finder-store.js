import { mergeFinderSnapshot } from './receipt-finder.js';

// Dedicated, account-scoped outbox: the existing book queue cannot store global
// expenses or attachment bytes. Commit transaction completion before saying saved.
export function createReceiptFinderStore(indexedDB = globalThis.indexedDB) {
  async function transaction(uid, mode, action) {
    if (!uid) throw new Error('Sign in to access saved receipts');
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('lyrical-receipt-finder', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('mailboxes');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise((resolve, reject) => {
      const tx = db.transaction('mailboxes', mode);
      const req = action(tx.objectStore('mailboxes'), uid);
      tx.oncomplete = () => { db.close(); resolve(req.result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('Receipt storage failed')); };
    });
  }
  return {
    load: uid => transaction(uid, 'readonly', (store, key) => store.get(key)),
    save: (uid, value) => transaction(uid, 'readwrite', (store, key) => {
      const request = store.get(key);
      request.onsuccess = () => store.put(mergeFinderSnapshot(request.result, value), key);
      return request;
    }),
    clear: uid => transaction(uid, 'readwrite', (store, key) => store.delete(key)),
  };
}
