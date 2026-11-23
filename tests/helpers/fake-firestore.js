/**
 * An in-memory Firestore behind the SDK stubs (tests/helpers/stubs/firebase-sdk.js),
 * for suites that need src/firebase.js's REAL read/merge/write code rather
 * than the whole-function fakes in fake-cloud.js.
 *
 *   const store = createFakeFirestore();
 *   store.install();              // the stubs now answer from `store`
 *   store.setOffline(true);       // server reads fail; setDoc waits, like the SDK
 *   store.setOffline(false);      // ...and the waiting writes are delivered
 *
 * Paths are the stub handles' text: doc(fs, 'books', 'bk', 'data', 'hist')
 * is 'books/bk/data/hist'. A batch commit tells collection listeners at once,
 * before it resolves, the way the real SDK reports a local write.
 */
export function createFakeFirestore() {
  const docs = new Map();
  const listeners = [];
  const waiting = [];
  let offline = false;
  let silent = false;
  let transactionRetries = 0;
  const hooks = { beforeCommit: null };

  const pathOf = ref => String((ref && ref.__stub) || '').replace(/^(doc|col):/, '');
  const docSnap = path => {
    const d = docs.get(path);
    return { id: path.split('/').pop(), ref: { __stub: 'doc:' + path }, exists: () => d !== undefined, data: () => d };
  };
  const colSnap = col => {
    const list = [...docs.keys()]
      .filter(k => k.startsWith(col + '/') && !k.slice(col.length + 1).includes('/'))
      .map(docSnap);
    return { docs: list, size: list.length, empty: !list.length, forEach: f => list.forEach(f) };
  };
  const notify = paths => {
    if (silent) return;
    listeners.forEach(l => { if (paths.some(p => p.startsWith(l.col + '/'))) l.cb(colSnap(l.col)); });
  };
  const write = (path, data) => { docs.set(path, data); notify([path]); };
  const unavailable = () => Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' });

  const api = {
    getDocs: async ref => colSnap(pathOf(ref)),
    getDoc: async ref => docSnap(pathOf(ref)),
    getDocFromServer: async ref => { if (offline) throw unavailable(); return docSnap(pathOf(ref)); },
    // The SDK keeps an offline write and resolves it once the server has it.
    setDoc: (ref, data) => {
      const path = pathOf(ref);
      if (!offline) { write(path, data); return Promise.resolve(); }
      return new Promise(resolve => waiting.push(() => { write(path, data); resolve(); }));
    },
    writeBatch: () => {
      const ops = [];
      return {
        set(ref, data) { ops.push({ path: pathOf(ref), data }); },
        update() {},
        delete(ref) { ops.push({ path: pathOf(ref), data: undefined }); },
        async commit() {
          if (hooks.beforeCommit) { const h = hooks.beforeCommit; hooks.beforeCommit = null; await h(); }
          if (offline) throw unavailable();
          ops.forEach(o => { if (o.data === undefined) docs.delete(o.path); else docs.set(o.path, o.data); });
          notify(ops.map(o => o.path));
        },
      };
    },
    // Optimistic, like the real SDK: reads go to the server, and the commit
    // is refused and the whole function re-run if any document it read has
    // changed since. `beforeCommit` lets a test land another device's write
    // in that gap.
    runTransaction: async (_fs, fn) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        if (offline) throw unavailable();
        const seen = new Map();
        const sets = [];
        const tx = {
          get: async ref => { const p = pathOf(ref); seen.set(p, docs.get(p)); return docSnap(p); },
          set: (ref, data) => { sets.push({ path: pathOf(ref), data }); return tx; },
          update: () => tx,
          delete: ref => { sets.push({ path: pathOf(ref), data: undefined }); return tx; },
        };
        const out = await fn(tx);
        if (hooks.beforeCommit) { const h = hooks.beforeCommit; hooks.beforeCommit = null; await h(); }
        if (offline) throw unavailable();
        if ([...seen].some(([p, d]) => docs.get(p) !== d)) { transactionRetries++; continue; }
        sets.forEach(o => { if (o.data === undefined) docs.delete(o.path); else docs.set(o.path, o.data); });
        notify(sets.map(o => o.path));
        return out;
      }
      throw Object.assign(new Error('Transaction failed: too much contention'), { code: 'aborted' });
    },
    onSnapshot: (ref, ...rest) => {
      const cb = rest.find(a => typeof a === 'function');
      const l = { col: pathOf(ref), cb };
      listeners.push(l);
      queueMicrotask(() => { if (listeners.includes(l)) cb(colSnap(l.col)); });
      return () => { const i = listeners.indexOf(l); if (i !== -1) listeners.splice(i, 1); };
    },
  };

  return {
    docs,
    api,
    install() { globalThis.__firebaseStub = globalThis.__firebaseStub || { authCallbacks: [] }; globalThis.__firebaseStub.firestore = api; },
    uninstall() { if (globalThis.__firebaseStub) delete globalThis.__firebaseStub.firestore; },
    setOffline(value) {
      offline = !!value;
      if (!offline) waiting.splice(0).forEach(fn => fn());
    },
    /** While true, writes land without telling the live listeners. */
    setSilent(value) { silent = !!value; },
    /** Run `fn` once, between the next transaction's reads and its commit. */
    beforeNextCommit(fn) { hooks.beforeCommit = fn; },
    get transactionRetries() { return transactionRetries; },
    /** The parsed `data` blob of one document, or null. */
    read(path) { const d = docs.get(path); return d && typeof d.data === 'string' ? JSON.parse(d.data) : null; },
  };
}
