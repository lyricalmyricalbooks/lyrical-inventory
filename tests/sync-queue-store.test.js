import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  SYNC_QUEUE_KEY, SYNC_QUEUE_CORRUPT_KEY,
  loadSyncQueue, persistSyncQueue, isQuotaError, getLocalStorage,
} from '../src/lib/sync-queue-store.js';
import { describeSyncStatus } from '../src/lib/sync-status.js';

/** Minimal Web Storage stand-in with switchable failure modes. */
function makeStorage(initial = {}, { quotaBytes = Infinity, throwOnGet = false, throwOnSet = null } = {}) {
  const data = new Map(Object.entries(initial));
  const used = (except) => [...data].reduce((n, [k, v]) => n + (k === except ? 0 : k.length + v.length), 0);
  return {
    data,
    getItem(k) {
      if (throwOnGet) throw Object.assign(new Error('blocked'), { name: 'SecurityError' });
      return data.has(k) ? data.get(k) : null;
    },
    setItem(k, v) {
      if (throwOnSet) throw throwOnSet;
      const value = String(v);
      if (used(k) + k.length + value.length > quotaBytes) {
        throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError', code: 22 });
      }
      data.set(k, value);
    },
    removeItem(k) { data.delete(k); },
  };
}

const item = (bookId, extra = {}) => ({ bookId, state: { stock: 10, hist: [], ...extra }, ts: 1 });

describe('persistSyncQueue + loadSyncQueue round trip', () => {
  it('writes the queue and reads the same items back', () => {
    const storage = makeStorage();
    const queue = [item('book-a'), item('book-b', { sold: 3 })];
    expect(persistSyncQueue(storage, queue)).toEqual({ ok: true });
    const loaded = loadSyncQueue(storage);
    expect(loaded.queue).toEqual(queue);
    expect(loaded.discarded).toBe(false);
    expect(loaded.unavailable).toBe(false);
  });

  it('returns an empty queue with nothing discarded when the key is missing', () => {
    expect(loadSyncQueue(makeStorage())).toMatchObject({ queue: [], discarded: false, unavailable: false });
  });

  it('removes the key when the queue drains, so an uploaded change cannot replay', () => {
    const storage = makeStorage({ [SYNC_QUEUE_KEY]: JSON.stringify([item('book-a')]) });
    expect(persistSyncQueue(storage, [])).toEqual({ ok: true });
    expect(storage.data.has(SYNC_QUEUE_KEY)).toBe(false);
  });

  it('drains even when every write to storage fails', () => {
    const storage = makeStorage(
      { [SYNC_QUEUE_KEY]: JSON.stringify([item('book-a')]) },
      { throwOnSet: Object.assign(new Error('full'), { name: 'QuotaExceededError' }) },
    );
    expect(persistSyncQueue(storage, []).ok).toBe(true);
    expect(storage.data.has(SYNC_QUEUE_KEY)).toBe(false);
  });
});

describe('persistSyncQueue on a full or broken device', () => {
  it('reports a quota failure instead of throwing, and leaves the old copy intact', () => {
    const old = JSON.stringify([item('book-a')]);
    const storage = makeStorage({ [SYNC_QUEUE_KEY]: old }, { quotaBytes: 200 });
    const big = [item('book-a', { note: 'x'.repeat(500) })];
    let res;
    expect(() => { res = persistSyncQueue(storage, big); }).not.toThrow();
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('quota');
    expect(storage.data.get(SYNC_QUEUE_KEY)).toBe(old);
  });

  it('recognises the Firefox quota error name too', () => {
    const storage = makeStorage({}, { throwOnSet: Object.assign(new Error('full'), { name: 'NS_ERROR_DOM_QUOTA_REACHED' }) });
    expect(persistSyncQueue(storage, [item('b')])).toMatchObject({ ok: false, reason: 'quota' });
  });

  it('reports a non-quota failure as a generic error', () => {
    const storage = makeStorage({}, { throwOnSet: new TypeError('nope') });
    expect(persistSyncQueue(storage, [item('b')])).toMatchObject({ ok: false, reason: 'error' });
  });

  it('reports unavailable storage rather than throwing', () => {
    expect(persistSyncQueue(null, [item('b')])).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('refuses a non-array rather than wiping the stored queue', () => {
    const old = JSON.stringify([item('book-a')]);
    const storage = makeStorage({ [SYNC_QUEUE_KEY]: old });
    expect(persistSyncQueue(storage, undefined).ok).toBe(false);
    expect(storage.data.get(SYNC_QUEUE_KEY)).toBe(old);
  });

  it('succeeds again once space frees up', () => {
    const storage = makeStorage({ filler: 'y'.repeat(300) }, { quotaBytes: 400 });
    const queue = [item('book-a', { note: 'z'.repeat(150) })];
    expect(persistSyncQueue(storage, queue).ok).toBe(false);
    storage.removeItem('filler');
    expect(persistSyncQueue(storage, queue).ok).toBe(true);
    expect(loadSyncQueue(storage).queue).toEqual(queue);
  });
});

describe('loadSyncQueue with damaged storage', () => {
  it('survives corrupt JSON, flags it, and copies the raw value aside', () => {
    const raw = '[{"bookId":"book-a","state":{"sto';
    const storage = makeStorage({ [SYNC_QUEUE_KEY]: raw });
    let loaded;
    expect(() => { loaded = loadSyncQueue(storage); }).not.toThrow();
    expect(loaded.queue).toEqual([]);
    expect(loaded.discarded).toBe(true);
    expect(loaded.backedUp).toBe(true);
    expect(storage.data.get(SYNC_QUEUE_CORRUPT_KEY)).toBe(raw);
    // Main key is cleared so the next launch doesn't re-report the same damage.
    expect(storage.data.has(SYNC_QUEUE_KEY)).toBe(false);
    expect(loadSyncQueue(storage).discarded).toBe(false);
  });

  it('treats valid JSON that is not an array as discarded', () => {
    for (const raw of ['{"bookId":"a"}', '42', '"text"', 'null', 'true']) {
      const storage = makeStorage({ [SYNC_QUEUE_KEY]: raw });
      const loaded = loadSyncQueue(storage);
      expect(loaded.queue).toEqual([]);
      expect(loaded.discarded).toBe(true);
      expect(storage.data.get(SYNC_QUEUE_CORRUPT_KEY)).toBe(raw);
    }
  });

  it('keeps the usable entries of an array and drops the ones that cannot upload', () => {
    const good = item('book-a');
    const raw = JSON.stringify([good, null, 'junk', { bookId: 'book-b' }, { bookId: '', state: {} }, { state: {} }]);
    const storage = makeStorage({ [SYNC_QUEUE_KEY]: raw });
    const loaded = loadSyncQueue(storage);
    expect(loaded.queue).toEqual([good]);
    expect(loaded.discarded).toBe(true);
    expect(loaded.droppedCount).toBe(5);
    expect(storage.data.get(SYNC_QUEUE_CORRUPT_KEY)).toBe(raw);
    expect(JSON.parse(storage.data.get(SYNC_QUEUE_KEY))).toEqual([good]);
  });

  it('leaves the original in place when there is no room to copy it aside', () => {
    const raw = 'not json at all';
    const storage = makeStorage(
      { [SYNC_QUEUE_KEY]: raw },
      { throwOnSet: Object.assign(new Error('full'), { name: 'QuotaExceededError' }) },
    );
    const loaded = loadSyncQueue(storage);
    expect(loaded).toMatchObject({ queue: [], discarded: true, backedUp: false });
    expect(storage.data.get(SYNC_QUEUE_KEY)).toBe(raw);
  });

  it('returns an empty queue when storage throws on access', () => {
    const loaded = loadSyncQueue(makeStorage({}, { throwOnGet: true }));
    expect(loaded).toMatchObject({ queue: [], discarded: false, unavailable: true });
  });

  it('returns an empty queue when there is no storage at all', () => {
    expect(loadSyncQueue(null)).toMatchObject({ queue: [], unavailable: true });
    expect(loadSyncQueue(undefined)).toMatchObject({ queue: [], unavailable: true });
  });
});

describe('isQuotaError', () => {
  it('matches the browser quota error shapes and nothing else', () => {
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError({ code: 1014 })).toBe(true);
    expect(isQuotaError(new TypeError('x'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(isQuotaError('QuotaExceededError')).toBe(false);
  });
});

describe('getLocalStorage', () => {
  it('returns null instead of throwing when the property access itself throws', () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('SecurityError'); },
    });
    try {
      expect(getLocalStorage()).toBeNull();
    } finally {
      if (desc) Object.defineProperty(globalThis, 'localStorage', desc);
      else delete globalThis.localStorage;
    }
  });
});

describe('sync chip wording when the queue is only held in memory', () => {
  it('tells the publisher to keep the app open instead of promising it is saved', () => {
    for (const input of [
      { online: false, pending: 2 },
      { online: true, pending: 2, retrying: true },
      { online: true, pending: 2 },
    ]) {
      const safe = describeSyncStatus({ ...input, heldInMemory: false });
      const risky = describeSyncStatus({ ...input, heldInMemory: true });
      expect(risky.visible).toBe(true);
      expect(risky.detail).toMatch(/keep it open until they upload/);
      expect(risky.detail).not.toMatch(/saved on this device/);
      expect(risky.srText).toContain(risky.detail);
      expect(safe.detail).not.toMatch(/keep it open/);
    }
  });

  it('says nothing extra once the queue is empty', () => {
    expect(describeSyncStatus({ online: true, pending: 0, heldInMemory: true }).visible).toBe(false);
    expect(describeSyncStatus({ online: false, pending: 0, heldInMemory: true }).detail).not.toMatch(/keep it open/);
  });
});

describe('main.js wiring', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const mainJs = readFileSync(join(root, 'src/main.js'), 'utf8');

  it('no longer parses or writes the queue key unguarded', () => {
    expect(mainJs).not.toMatch(/JSON\.parse\(localStorage\.getItem\('lm-sync-queue'/);
    expect(mainJs).not.toMatch(/localStorage\.setItem\('lm-sync-queue'/);
    expect(mainJs).toMatch(/loadSyncQueue\(getLocalStorage\(\)\)/);
  });

  it('queueSync still kicks off the upload after a failed device write', () => {
    const start = mainJs.indexOf('function queueSync(');
    const body = mainJs.slice(start, mainJs.indexOf('\n}\n', start));
    const persistAt = body.indexOf('saveSyncQueueToDevice()');
    expect(persistAt).toBeGreaterThan(-1);
    expect(body.indexOf('updatePendingIndicator()')).toBeGreaterThan(persistAt);
    expect(body.indexOf('processSyncQueue()')).toBeGreaterThan(persistAt);
  });

  it('feeds the memory-only state to the sync chip', () => {
    expect(mainJs).toMatch(/heldInMemory:\s*_syncQueueHeldInMemory/);
  });
});
