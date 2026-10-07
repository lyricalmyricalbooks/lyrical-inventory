import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  SYNC_QUEUE_KEY, SYNC_QUEUE_CORRUPT_KEY,
  loadSyncQueue, persistSyncQueue, isQuotaError, getLocalStorage,
} from '../src/lib/sync-queue-store.js';
import { describeSyncStatus } from '../src/lib/sync-status.js';
import {
  queueKeyFor, getSyncTabId, markTabAlive, markTabGone, findOrphanQueueKeys, readOrphanQueues,
  releaseOrphanKeys, pickNextSyncItem, SYNC_TAB_PREFIX, SYNC_TAB_SESSION_KEY, SYNC_TAB_STALE_MS,
} from '../src/lib/sync-queue-store.js';

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
    expect(mainJs).toMatch(/loadSyncQueue\(getLocalStorage\(\), SYNC_QUEUE_STORAGE_KEY\)/);
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

// Web Storage with key()/length, which the orphan scan needs.
function makeListStorage(initial = {}) {
  const s = makeStorage(initial);
  return Object.assign(s, {
    get length() { return s.data.size; },
    key(i) { return [...s.data.keys()][i] ?? null; },
  });
}

describe('one queue per tab', () => {
  const NOW = 1_000_000;

  it('keeps a tab\'s id across reloads of that tab', () => {
    const session = makeStorage({ [SYNC_TAB_SESSION_KEY]: 't1' });
    expect(getSyncTabId(session, makeListStorage(), { now: NOW })).toBe('t1');
  });

  it('mints a new id when the stored one belongs to a live (duplicated) tab', () => {
    const session = makeStorage({ [SYNC_TAB_SESSION_KEY]: 't1' });
    const local = makeListStorage({ [SYNC_TAB_PREFIX + 't1']: String(NOW - 1000) });
    const id = getSyncTabId(session, local, { now: NOW, random: () => 't2' });
    expect(id).toBe('t2');
    expect(session.getItem(SYNC_TAB_SESSION_KEY)).toBe('t2');
  });

  it('treats the legacy shared key and silent tabs as orphans, live tabs and itself as not', () => {
    const local = makeListStorage({
      'lm-sync-queue': '[]',
      [queueKeyFor('me')]: '[]',
      [queueKeyFor('live')]: '[]',
      [queueKeyFor('stale')]: '[]',
      [queueKeyFor('never-beat')]: '[]',
      'lm-sync-queue-corrupt': 'x',
    });
    markTabAlive(local, 'live', NOW - 1000);
    markTabAlive(local, 'stale', NOW - SYNC_TAB_STALE_MS - 1);
    expect(findOrphanQueueKeys(local, 'me', NOW).sort())
      .toEqual(['lm-sync-queue', queueKeyFor('never-beat'), queueKeyFor('stale')].sort());
  });

  it('reads orphans as adopted, with ids, and only removes them when asked', () => {
    const local = makeListStorage({ [queueKeyFor('gone')]: JSON.stringify([item('book-a')]) });
    const { items, keys } = readOrphanQueues(local, 'me', NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ bookId: 'book-a', adopted: true });
    expect(items[0].qid).toBeTruthy();
    expect(local.data.has(queueKeyFor('gone'))).toBe(true);
    releaseOrphanKeys(local, keys);
    expect(local.data.has(queueKeyFor('gone'))).toBe(false);
  });

  it('a closing tab can be adopted at once', () => {
    const local = makeListStorage({ [queueKeyFor('closing')]: '[]' });
    markTabAlive(local, 'closing', NOW);
    expect(findOrphanQueueKeys(local, 'me', NOW)).toEqual([]);
    markTabGone(local, 'closing');
    expect(findOrphanQueueKeys(local, 'me', NOW)).toEqual([queueKeyFor('closing')]);
  });
});

describe('pickNextSyncItem', () => {
  const q = (bookId, extra = {}) => ({ bookId, state: {}, ...extra });

  it('takes changes in order', () => {
    const a = q('a'); const b = q('b');
    expect(pickNextSyncItem([a, b], 0)).toBe(a);
  });

  it('skips a book backing off, without letting a later change to it jump ahead', () => {
    const a1 = q('a', { retryAt: 100 }); const a2 = q('a'); const b = q('b');
    expect(pickNextSyncItem([a1, a2, b], 50)).toBe(b);
    expect(pickNextSyncItem([a1, a2, b], 150)).toBe(a1);
  });

  it('holds a change made on top of one still waiting', () => {
    const first = q('a', { qid: 'x', retryAt: 100 });
    const next = q('a', { after: 'x' });
    expect(pickNextSyncItem([first, next], 50)).toBeNull();
    expect(pickNextSyncItem([next], 50)).toBe(next);
  });
});
