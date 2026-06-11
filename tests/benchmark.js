import { performance } from 'perf_hooks';

// Setup Mock data mirroring mass migration shape
const BOOKS = {
  book1: true, book2: true, book3: true, book4: true, book5: true,
  book6: true, book7: true, book8: true, book9: true, book10: true
};

const get = async (ref) => {
  // simulate network latency for Firebase read
  await new Promise(resolve => setTimeout(resolve, 50));
  return {
    exists: () => true,
    val: () => ({ data: '{"ledger":[], "expenses":[]}', ts: Date.now() })
  };
};

const ref = (db, path) => path;
const setDoc = async (ref, data) => {
  await new Promise(resolve => setTimeout(resolve, 10)); // simulated write delay
};
const doc = (fs, ...paths) => paths.join('/');
const db = {};
const fs = {};

const safeParse = (str) => {
  try { return JSON.parse(str); } catch (e) { return null; }
};

// ==========================================
// SEQUENTIAL IMPLEMENTATION (Pre-Optimization Baseline)
// ==========================================
const migrateSequential = async () => {
  const promises = [];

  for (const bookId of Object.keys(BOOKS)) {
    const snap = await get(ref(db, `lyrical/books/${bookId}`));
    if (snap.exists()) {
      const bookObj = snap.val();
      if (bookObj && bookObj.data) {
        const stateJson = safeParse(bookObj.data);
        if (stateJson) {
          const s = { ...stateJson };
          const parts = {};
          ['ledger', 'expenses', 'hist', 'stores', 'artistTransfers', 'artistPayouts', 'doneIds'].forEach(k => {
            parts[k] = s[k] || [];
            delete s[k];
          });
          parts.metadata = s;

          Object.keys(parts).forEach(partName => {
            const dRef = doc(fs, 'books', bookId, 'data', partName);
            promises.push(setDoc(dRef, { data: JSON.stringify(parts[partName]), ts: Date.now() }));
          });
        }
      }
    }
  }

  for (const bookId of Object.keys(BOOKS)) {
    for (const type of ['expenses', 'sales']) {
      const typeSnap = await get(ref(db, `lyrical/submissions/${bookId}/${type}`));
      if (typeSnap.exists()) {
        const subData = typeSnap.val();
        Object.keys(subData).forEach(subId => {
           const subObj = subData[subId];
           const dRef = doc(fs, 'submissions', bookId, type, subId);
           promises.push(setDoc(dRef, { data: subObj.data, ts: subObj.ts || Date.now() }));
        });
      }
    }
  }

  const settingsKeys = ['catalog', 'taxCenter', 'productionCosts', 'paymentLinks', 'systemBackups'];
  for (const key of settingsKeys) {
    const setSnap = await get(ref(db, `lyrical/settings/${key}`));
    if (setSnap.exists()) {
       const settingObj = setSnap.val();
       const dRef = doc(fs, 'settings', key);
       promises.push(setDoc(dRef, { data: settingObj.data, ts: settingObj.ts || Date.now() }));
    }
  }

  await Promise.all(promises);
};

// ==========================================
// CONCURRENT IMPLEMENTATION (Our changes)
// ==========================================
const migrateConcurrent = async () => {
  const promises = [];

  const bookFetches = Object.keys(BOOKS).map(async (bookId) => {
    const snap = await get(ref(db, `lyrical/books/${bookId}`));
    if (snap.exists()) {
      const bookObj = snap.val();
      if (bookObj && bookObj.data) {
        const stateJson = safeParse(bookObj.data);
        if (stateJson) {
          const s = { ...stateJson };
          const parts = {};
          ['ledger', 'expenses', 'hist', 'stores', 'artistTransfers', 'artistPayouts', 'doneIds'].forEach(k => {
            parts[k] = s[k] || [];
            delete s[k];
          });
          parts.metadata = s;

          Object.keys(parts).forEach(partName => {
            const dRef = doc(fs, 'books', bookId, 'data', partName);
            promises.push(setDoc(dRef, { data: JSON.stringify(parts[partName]), ts: Date.now() }));
          });
        }
      }
    }
  });

  const subFetches = Object.keys(BOOKS).flatMap(bookId => {
    return ['expenses', 'sales'].map(async (type) => {
      const typeSnap = await get(ref(db, `lyrical/submissions/${bookId}/${type}`));
      if (typeSnap.exists()) {
        const subData = typeSnap.val();
        Object.keys(subData).forEach(subId => {
           const subObj = subData[subId];
           const dRef = doc(fs, 'submissions', bookId, type, subId);
           promises.push(setDoc(dRef, { data: subObj.data, ts: subObj.ts || Date.now() }));
        });
      }
    });
  });

  const settingsKeys = ['catalog', 'taxCenter', 'productionCosts', 'paymentLinks', 'systemBackups'];
  const settingFetches = settingsKeys.map(async (key) => {
    const setSnap = await get(ref(db, `lyrical/settings/${key}`));
    if (setSnap.exists()) {
       const settingObj = setSnap.val();
       const dRef = doc(fs, 'settings', key);
       promises.push(setDoc(dRef, { data: settingObj.data, ts: settingObj.ts || Date.now() }));
    }
  });

  await Promise.all([...bookFetches, ...subFetches, ...settingFetches]);
  await Promise.all(promises);
};

async function runBenchmark() {
  console.log("Starting Benchmark...");

  const t0 = performance.now();
  await migrateSequential();
  const t1 = performance.now();
  const seqTime = t1 - t0;
  console.log(`Sequential (Baseline): ${seqTime.toFixed(2)} ms`);

  const t2 = performance.now();
  await migrateConcurrent();
  const t3 = performance.now();
  const conTime = t3 - t2;
  console.log(`Concurrent (Optimized): ${conTime.toFixed(2)} ms`);

  const speedup = seqTime / conTime;
  console.log(`Improvement: ${speedup.toFixed(2)}x faster!`);
}

runBenchmark();
