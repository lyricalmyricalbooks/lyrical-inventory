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
