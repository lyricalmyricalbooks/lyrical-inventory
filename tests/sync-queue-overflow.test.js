// When localStorage is full, a sale waiting to upload must still survive the
// app being closed: the queue goes to IndexedDB instead, and comes back from
// there on the next start.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createFakeIndexedDB } from './helpers/fake-idb.js';
import { createSyncOverflowStore } from '../src/lib/sync-queue-overflow.js';
import { SYNC_TAB_PREFIX } from '../src/lib/sync-queue-store.js';

describe('createSyncOverflowStore', () => {
  it('stores, lists and removes queues', async () => {
    const store = createSyncOverflowStore(createFakeIndexedDB(), 'db');
    expect(await store.put('lm-sync-queue:a', [{ bookId: 'x', state: {} }])).toBe(true);
    expect(await store.readAll()).toEqual([{ key: 'lm-sync-queue:a', queue: [{ bookId: 'x', state: {} }] }]);
    expect(await store.remove('lm-sync-queue:a')).toBe(true);
    expect(await store.readAll()).toEqual([]);
  });

  it('says false instead of throwing when the disk is full or there is no IndexedDB', async () => {
    const idb = createFakeIndexedDB();
    idb.failWrites = true;
    expect(await createSyncOverflowStore(idb, 'db').put('k', [])).toBe(false);
    expect(await createSyncOverflowStore(null, 'db').put('k', [])).toBe(false);
    expect(await createSyncOverflowStore(null, 'db').readAll()).toEqual([]);
  });
});

const A = 'harbour';
const SALE = { num: 'S-1', chan: 'Website', qty: 1, price: 40, date: '2026-03-01', cur: 'CAD' };
const idb = createFakeIndexedDB();
const overflow = () => idb.dbs.get('lm-sync-overflow')?.get('queues') || new Map();
let app;
let realSetItem;

beforeAll(async () => {
  globalThis.indexedDB = idb;
  const { loadApp, makeBook } = await import('./helpers/load-app.js');
  app = await loadApp({ books: [makeBook({ id: A })] });
  realSetItem = Storage.prototype.setItem;
}, 30000);

beforeEach(async () => { await app.resetBook(A, {}); });
afterEach(() => { Storage.prototype.setItem = realSetItem; });

function fillLocalStorage() {
  Storage.prototype.setItem = function (key, value) {
    if (String(key).startsWith('lm-sync-queue')) {
      const err = new Error('full');
      err.name = 'QuotaExceededError';
      throw err;
    }
    return realSetItem.call(this, key, value);
  };
}

describe('a full phone', () => {
  it('keeps an offline sale in IndexedDB, without the "could be lost" warning, and clears it once uploaded', async () => {
    fillLocalStorage();
    app.setOnline(false);
    app.main.states[A].hist.unshift({ ...SALE });
    await app.main.saveState(A);
    await vi.waitFor(() => expect(overflow().size).toBe(1));
    const [queue] = [...overflow().values()];
    expect(queue[0].state.hist[0].num).toBe('S-1');
    expect(app.toast()).not.toMatch(/could be lost/);
    expect(app.main._syncQueueHeldInMemory).toBe(false);

    Storage.prototype.setItem = realSetItem;
    app.setOnline(true);
    await vi.waitFor(() => expect(app.cloud.savesFor(A).length).toBeGreaterThan(0));
    await vi.waitFor(() => expect(overflow().size).toBe(0));
    expect(app.cloud.lastSave(A).state.hist[0].num).toBe('S-1');
  });

  it('keeps an online save that failed on a full phone, then clears it once it goes through', async () => {
    fillLocalStorage();
    const ok = app.cloud.saveImpl;
    let calls = 0;
    app.cloud.saveImpl = (...args) => (++calls === 1 ? { ok: false } : ok(...args));
    app.main.states[A].hist.unshift({ ...SALE, num: 'S-ONLINE' });
    await app.main.saveState(A);
    await vi.waitFor(() => expect(overflow().size).toBe(1));
    expect(app.toast()).not.toMatch(/could be lost/);

    Storage.prototype.setItem = realSetItem;
    app.setOnline(false);
    app.setOnline(true);
    await vi.waitFor(() => expect(overflow().size).toBe(0));
    expect(app.cloud.lastSave(A).state.hist[0].num).toBe('S-ONLINE');
    app.cloud.saveImpl = ok;
  });

  it('uploads, once, a sale a closed tab left in IndexedDB', async () => {
    const leftover = { bookId: A, ts: 1, base: {}, qid: 'gone-1', state: { ...app.main.states[A], hist: [{ ...SALE, num: 'FROM-FULL-PHONE' }] } };
    overflow().set('lm-sync-queue:gone', [leftover]);
    localStorage.setItem(SYNC_TAB_PREFIX + 'gone', String(Date.now() - 10 * 60_000));
    await app.main.adoptOverflowSyncChanges();
    await vi.waitFor(() => expect(app.queued()).toHaveLength(0));
    expect(overflow().has('lm-sync-queue:gone')).toBe(false);
    expect(app.cloud.savesFor(A).map(s => s.state.hist[0].num)).toEqual(['FROM-FULL-PHONE']);
    await app.main.adoptOverflowSyncChanges();
    await app.settle(10);
    expect(app.cloud.savesFor(A)).toHaveLength(1);
  });

  it('leaves a live tab\'s IndexedDB queue to that tab', async () => {
    overflow().set('lm-sync-queue:alive', [{ bookId: A, ts: 1, base: {}, qid: 'alive-1', state: app.main.states[A] }]);
    localStorage.setItem(SYNC_TAB_PREFIX + 'alive', String(Date.now()));
    await app.main.adoptOverflowSyncChanges();
    await app.settle(10);
    expect(overflow().has('lm-sync-queue:alive')).toBe(true);
    expect(app.cloud.savesFor(A)).toHaveLength(0);
    overflow().delete('lm-sync-queue:alive');
    localStorage.removeItem(SYNC_TAB_PREFIX + 'alive');
  });

  it('still warns when IndexedDB is full too', async () => {
    fillLocalStorage();
    idb.failWrites = true;
    app.setOnline(false);
    app.main.states[A].hist.unshift({ ...SALE, num: 'S-2' });
    await app.main.saveState(A);
    await vi.waitFor(() => expect(app.toast()).toMatch(/could be lost/));
    expect(app.main._syncQueueHeldInMemory).toBe(true);
    idb.failWrites = false;
    Storage.prototype.setItem = realSetItem;
    app.setOnline(true);
    await vi.waitFor(() => expect(app.cloud.savesFor(A).length).toBeGreaterThan(0));
  });
});
