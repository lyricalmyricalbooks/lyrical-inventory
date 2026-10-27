/**
 * A small in-memory stand-in for IndexedDB: open / one object store per
 * database / put, delete, getAll, getAllKeys, with callbacks fired
 * asynchronously the way the browser does. Just enough for the app's own
 * key-value stores; `dbs` exposes the contents, and `failWrites` makes every
 * readwrite transaction abort (a full disk).
 */
export function createFakeIndexedDB() {
  const dbs = new Map(); // name -> Map(storeName -> Map(key -> value))
  const fake = {
    dbs,
    failWrites: false,
    open(name) {
      const req = {};
      queueMicrotask(() => {
        const isNew = !dbs.has(name);
        if (isNew) dbs.set(name, new Map());
        const stores = dbs.get(name);
        const db = {
          createObjectStore(store) { if (!stores.has(store)) stores.set(store, new Map()); },
          close() {},
          transaction(store, mode) {
            const data = stores.get(store);
            const tx = {};
            const ops = [];
            const request = (fn) => { const r = {}; ops.push(() => { r.result = fn(); }); return r; };
            tx.objectStore = () => ({
              put: (value, key) => request(() => { data.set(key, structuredClone(value)); return key; }),
              delete: key => request(() => { data.delete(key); }),
              get: key => request(() => structuredClone(data.get(key))),
              getAll: () => request(() => [...data.values()].map(v => structuredClone(v))),
              getAllKeys: () => request(() => [...data.keys()]),
            });
            setTimeout(() => {
              if (mode === 'readwrite' && fake.failWrites) { tx.onabort?.(); return; }
              ops.forEach(op => op());
              tx.oncomplete?.();
            }, 0);
            return tx;
          },
        };
        req.result = db;
        if (isNew) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
  return fake;
}
