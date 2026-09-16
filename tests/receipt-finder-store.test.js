import { it, expect, vi } from 'vitest';
import { createReceiptFinderStore } from '../src/lib/receipt-finder-store.js';

it('acknowledges a save only when the IndexedDB transaction commits', async () => {
  let tx;
  const put = vi.fn(() => ({ result: 'publisher' }));
  const get = vi.fn(() => {
    const req = { result: undefined };
    queueMicrotask(() => req.onsuccess()); return req;
  });
  const db = { close: vi.fn(), transaction: () => (tx = { objectStore: () => ({ put, get }) }) };
  const indexedDB = { open: () => {
    const req = { result: db };
    queueMicrotask(() => req.onsuccess()); return req;
  } };
  let complete = false;
  const store = createReceiptFinderStore(indexedDB);
  const pending = store.save('publisher', { drafts: [] }).then(() => { complete = true; });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(complete).toBe(false);
  expect(put).toHaveBeenCalledWith({ drafts: [] }, 'publisher');
  tx.oncomplete(); await pending;
  expect(complete).toBe(true); expect(db.close).toHaveBeenCalledOnce();
});

it('reports storage failures instead of claiming drafts are saved', async () => {
  const indexedDB = { open: () => {
    const req = { error: new Error('Quota exceeded') };
    queueMicrotask(() => req.onerror()); return req;
  } };
  await expect(createReceiptFinderStore(indexedDB).save('publisher', {})).rejects.toThrow('Quota exceeded');
  await expect(createReceiptFinderStore(indexedDB).load('')).rejects.toThrow('Sign in');
});

it('keeps the Gmail connection under its own key so signing out drops it alone', async () => {
  // A draft edit must not rewrite the connection record, and signing out must
  // be able to drop the connection without touching saved receipts.
  const writes = [];
  const deletes = [];
  const store = {
    put: (value, key) => { writes.push([key, value]); return { result: key }; },
    get: () => { const req = { result: undefined }; queueMicrotask(() => req.onsuccess()); return req; },
    delete: key => { deletes.push(key); return { result: key }; },
  };
  let tx;
  const db = { close: () => {}, transaction: () => (tx = { objectStore: () => store }) };
  const indexedDB = { open: () => { const req = { result: db }; queueMicrotask(() => req.onsuccess()); return req; } };
  const finder = createReceiptFinderStore(indexedDB);

  const saving = finder.saveToken('publisher', { token: 't', expiresAt: 42, account: 'p@example.com' });
  await new Promise(resolve => setTimeout(resolve, 0)); tx.oncomplete(); await saving;
  expect(writes[0][0]).toBe('publisher::gmail-token');
  expect(writes[0][0]).not.toBe('publisher');

  const clearing = finder.clearToken('publisher');
  await new Promise(resolve => setTimeout(resolve, 0)); tx.oncomplete(); await clearing;
  expect(deletes).toEqual(['publisher::gmail-token']);
});
