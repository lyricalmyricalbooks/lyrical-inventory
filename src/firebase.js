import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue, get, push, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, setDoc, getDoc, getDocs, getDocFromServer, collection, onSnapshot, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ALL_PARTS, LIST_PARTS, assembleParts, emptyPart, splitState, stitchState, mergePart } from './lib/merge-state.js';

const firebaseConfig = {
  apiKey:"AIzaSyB0BTOjfUFZKCVth9eR8iN0mvfkpRIFKSI",
  authDomain:"lyricalmyrical-37c46.firebaseapp.com",
  databaseURL:"https://lyricalmyrical-37c46-default-rtdb.firebaseio.com",
  projectId:"lyricalmyrical-37c46",
  storageBucket:"lyricalmyrical-37c46.firebasestorage.app",
  messagingSenderId:"448719824639",
  appId:"1:448719824639:web:2aa79291b13bf6716ececa"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const storage = getStorage(app);
// Enable IndexedDB-backed offline persistence so Firestore reads/writes keep
// working without a connection and sync when it returns — essential for the POS
// at markets on flaky signal. Multi-tab manager keeps several open tabs in sync
// and avoids the single-tab persistence lock error. Falls back to the default
// in-memory cache if IndexedDB is unavailable (e.g. private browsing).
let fs;
try {
  fs = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (e) {
  console.warn('[FB] Firestore persistent cache unavailable, using memory cache', e);
  fs = initializeFirestore(app, {});
}
const googleProvider = new GoogleAuthProvider();

window._fbAuth = auth;
window._fbStorage = storage;
window._firestore = fs;

// ─────────────────────────────────────────────
// MODE FLAGS
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// MODE FLAGS — stored in Firestore so ALL devices stay in sync.
// localStorage is used as a fast local cache only.
// ─────────────────────────────────────────────
let _modeFlags = {}; // in-memory cache after _fbLoadModeFlags() resolves

window._fbLoadModeFlags = async () => {
  try {
    const snap = await getDoc(doc(fs, 'settings', 'modeFlags'));
    if (snap.exists()) {
      _modeFlags = snap.data() || {};
      // Write back to localStorage so the cache is warm for next startup
      Object.keys(_modeFlags).forEach(k => localStorage.setItem(k, String(_modeFlags[k])));
    } else {
      // First ever load — seed from whatever localStorage has (migration path)
      const keys = Object.keys(localStorage).filter(k => k.startsWith('fs_mode_'));
      keys.forEach(k => { _modeFlags[k] = localStorage.getItem(k) === 'true'; });
      if (keys.length > 0) {
        // Persist the local state to Firestore so other devices pick it up
        await setDoc(doc(fs, 'settings', 'modeFlags'), _modeFlags);
      }
    }
  } catch (e) {
    console.warn('[FB] Could not load mode flags from Firestore, using localStorage cache', e);
    // Fall back gracefully to localStorage
    const keys = Object.keys(localStorage).filter(k => k.startsWith('fs_mode_'));
    keys.forEach(k => { _modeFlags[k] = localStorage.getItem(k) === 'true'; });
  }
};

window._fbSaveModeFlags = async () => {
  try {
    await setDoc(doc(fs, 'settings', 'modeFlags'), _modeFlags);
  } catch (e) { console.error('[FB] Failed to save mode flags', e); }
};

window._useFirestoreForBook = (bookId) => {
  return _modeFlags['fs_mode_' + bookId] === true;
};

window._useFirestoreGlobal = () => {
  return _modeFlags['fs_mode_global'] === true;
};

window._enableFirestoreGlobal = () => {
  _modeFlags['fs_mode_global'] = true;
  localStorage.setItem('fs_mode_global', 'true');
  window._fbSaveModeFlags();
};

window._disableFirestoreGlobal = () => {
  _modeFlags['fs_mode_global'] = false;
  localStorage.setItem('fs_mode_global', 'false');
  window._fbSaveModeFlags();
};

window._setBookFirestoreMode = (bookId, enabled) => {
  _modeFlags['fs_mode_' + bookId] = enabled;
  localStorage.setItem('fs_mode_' + bookId, String(enabled));
  window._fbSaveModeFlags();
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const safeParse = (str) => {
  if (!str || typeof str !== 'string') return null;
  try { return JSON.parse(str); } catch (e) { return null; }
};

// ─────────────────────────────────────────────
// FILE STORAGE (Receipts)
// ─────────────────────────────────────────────
window._fbUploadReceipt = async (file, path) => {
  const storageRef = sRef(storage, `receipts/${path}`);
  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file);
    uploadTask.on('state_changed',
      null,
      (err) => reject(err),
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(url);
      }
    );
  });
};

window._fbDeleteReceipt = async (url) => {
  if (!url || !url.includes('firebasestorage')) return;
  try {
    const { getStorage: gStorage, ref: gRef, deleteObject } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js");
    const st = gStorage();
    const fileRef = gRef(st, url);
    await deleteObject(fileRef);
  } catch (e) {
    console.error("Firebase deletion failed", e);
    if (typeof window.showToast === 'function') {
      window.showToast('⚠ Could not delete cloud file — it may still exist in storage', 'warn', 4000);
    }
  }
};

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
window._fbSignInWithGoogle = () => signInWithPopup(auth, googleProvider);
window._fbSignOut = () => signOut(auth);
window._fbOnAuthStateChanged = (cb) => onAuthStateChanged(auth, cb);

// ─────────────────────────────────────────────
// PER-BOOK DATA
// ─────────────────────────────────────────────
// Saves a book's state, merging rather than clobbering when another device got
// there first.
//
// window._fsHashes[bookId][part] holds the last per-part JSON this device knows
// the server had (set by _fbLoad, refreshed by the _fbWatch snapshots and after
// each write). That makes it the merge base. Before overwriting a dirty part
// this now reads the server copy: if it still matches the base, nothing else
// has touched it and the write is a plain overwrite exactly as before. If it
// has moved on, the two versions are three-way merged against the base instead
// of one silently replacing the other.
//
// Returns { ok, merged, state, conflicts }. `state` is the stitched result and
// is only meaningful when `merged` is true — saveState() writes it back into
// the local state so the UI shows the reconciled data rather than the version
// it tried to save. ok:false means the server copy could not be read, so
// nothing was written and the caller should queue and retry rather than risk
// overwriting a change it cannot see.
window._fbSave = async (bookId, json) => {
  try {
    if (window._useFirestoreForBook(bookId)) {
      const parts = splitState(JSON.parse(json));

      if (!window._fsHashes) window._fsHashes = {};
      if (!window._fsHashes[bookId]) window._fsHashes[bookId] = {};
      const hashes = window._fsHashes[bookId];

      const partNames = Object.keys(parts);
      const dirty = partNames.filter(p => hashes[p] !== JSON.stringify(parts[p]));
      if (!dirty.length) return { ok: true, merged: false };

      // Read the server's current copy of every part we're about to change.
      // getDocFromServer (not getDoc) on purpose: with persistent local cache
      // enabled, getDoc can answer from cache, which would compare our base
      // against our own stale copy and defeat the whole check.
      let snaps;
      try {
        snaps = await Promise.all(dirty.map(p => getDocFromServer(doc(fs, 'books', bookId, 'data', p))));
      } catch (readErr) {
        // Can't see the server, so we can't know what we'd be overwriting.
        // Leave the write unmade; saveState queues it and retries with backoff.
        console.warn('[FB] pre-write read failed, not overwriting', readErr);
        return { ok: false, merged: false, reason: 'read-failed' };
      }

      const emptyFor = emptyPart;
      const merged = { ...parts };
      const conflicts = [];
      let didMerge = false;

      dirty.forEach((p, i) => {
        const snap = snaps[i];
        const remoteJson = snap.exists() ? snap.data().data : null;
        const baseJson = Object.prototype.hasOwnProperty.call(hashes, p) ? hashes[p] : null;
        if (remoteJson === baseJson) return; // nobody else touched it

        // Diverged. A null base (this device never read the part — a fresh tab
        // that wrote before loading) is treated as empty, which makes the merge
        // a union: it may keep a row the other device deleted, but it will
        // never drop one, and dropping is the failure that loses money.
        didMerge = true;
        const remoteVal = remoteJson != null ? (safeParse(remoteJson) ?? emptyFor(p)) : emptyFor(p);
        const baseVal = baseJson != null ? (safeParse(baseJson) ?? emptyFor(p)) : emptyFor(p);
        const res = mergePart(p, baseVal, remoteVal, parts[p]);
        merged[p] = res.value;
        res.conflicts.forEach(c => conflicts.push(c));
      });

      let stitched = stitchState(merged);

      // Let the app recompute the values derived from the merged rows (stock,
      // revenue, per-entry running balance) before any of it is persisted, so
      // the stored blob is self-consistent in a single write.
      if (didMerge && typeof window._normalizeMergedState === 'function') {
        try { stitched = window._normalizeMergedState(bookId, stitched) || stitched; }
        catch (e) { console.error('[FB] merge normalize failed', e); }
      }

      const finalParts = splitState(stitched);
      const pending = [];
      Object.keys(finalParts).forEach(p => {
        const partJson = JSON.stringify(finalParts[p]);
        if (hashes[p] !== partJson) pending.push({ part: p, partJson });
      });

      // One atomic batch rather than a setDoc per part. These parts are not
      // independent — a sale writes a `hist` row AND the `metadata` stock count
      // derived from it — so the previous Promise.all could half-succeed and
      // leave the book internally inconsistent: stock decremented with no sale
      // recorded, or a ledger row whose running balance never moved. A batch
      // either lands entirely or not at all, and the not-at-all case is already
      // handled (the caller queues and retries).
      //
      // Bounded by ALL_PARTS (8 documents), so Firestore's 500-write batch
      // limit is not reachable here.
      if (pending.length) {
        const batch = writeBatch(fs);
        const ts = Date.now();
        pending.forEach(({ part, partJson }) => {
          batch.set(doc(fs, 'books', bookId, 'data', part), { data: partJson, ts });
        });
        await batch.commit();
      }

      // Advance the base only once the server has actually taken the write.
      // Updating it alongside the setDoc call (as this did before) meant a
      // failed write still marked the part clean, so the next save skipped it
      // and the change was never retried — it just stopped existing anywhere
      // but this tab.
      pending.forEach(({ part, partJson }) => { hashes[part] = partJson; });

      return { ok: true, merged: didMerge, state: didMerge ? stitched : null, conflicts };
    }
    await set(ref(db, `lyrical/books/${bookId}`), { data: json, ts: Date.now() });
    return { ok: true, merged: false };
  } catch (e) {
    console.error("fbSave failed", e);
    if (typeof window.showToast === 'function') {
      window.showToast('⚠ Save to cloud failed — check connection', 'err', 4000);
    }
    return { ok: false, merged: false, reason: 'write-failed' };
  }
};

window._fbLoad = async (bookId) => {
  try {
    if (window._useFirestoreForBook(bookId)) {
      // One collection read instead of a getDoc per part. Every part is needed
      // on every load, so this bills the same number of document reads but
      // costs one round trip instead of eight — and loadAllBooks() fires this
      // for every book at once, so the saving multiplies by the catalog size.
      const snaps = await getDocs(collection(fs, 'books', bookId, 'data'));

      const raw = {};
      snaps.forEach(d => { raw[d.id] = (d.data() || {}).data; });

      const { parts, present } = assembleParts(raw);
      const hasData = present.length > 0;

      if (!window._fsHashes) window._fsHashes = {};
      if (!window._fsHashes[bookId]) window._fsHashes[bookId] = {};

      // Seed the merge base for every part, including the ones with no stored
      // document: those are known-empty rather than unknown, which is what lets
      // the next _fbSave tell "nothing there yet" apart from "never read it".
      ALL_PARTS.forEach(name => {
        window._fsHashes[bookId][name] = present.includes(name)
          ? raw[name]
          : JSON.stringify(parts[name]);
      });

      if (!hasData) {
        // Transparent fallback: this book is flagged for Firestore but NONE of
        // its per-part docs exist there — almost always because it was never
        // migrated and its data still lives in the Realtime Database. Returning
        // null here would surface as an empty book (lost sales, payouts, ledger)
        // and could overwrite the real data on the next save. So read the RTDB
        // copy instead — mirroring the settings/catalog fallback.
        console.warn(`[FB] book ${bookId} has no Firestore data, reading from RTDB`);
        const rt = await get(ref(db, `lyrical/books/${bookId}`));
        if (!rt.exists()) return null; // genuinely empty book — let caller seed defaults
        const rtData = rt.val().data;
        // Self-heal: copy the RTDB state into Firestore NOW. Without this the
        // live watcher (_fbWatch) attached right after load would read the still
        // -empty Firestore docs, stitch an empty state, and immediately clobber
        // the data we just recovered. _fbSave slices + writes the parts (this
        // book is flagged Firestore, so it targets Firestore) and refreshes the
        // part hashes, so the watcher's first snapshot carries real data.
        try { await window._fbSave(bookId, rtData); }
        catch (e) { console.error(`[FB] RTDB→Firestore self-heal failed for ${bookId}`, e); }
        return rtData;
      }

      return JSON.stringify(stitchState(parts));
    }
    const s = await get(ref(db, `lyrical/books/${bookId}`));
    return s.exists() ? s.val().data : null;
  } catch (e) { console.error("fbLoad failed", e); return null; }
};

let _fsWatchUnsubs = {};

// Surface live-sync listener failures to the user instead of dying silently in
// the console. A failed watcher means edits from other devices stop arriving
// while the UI keeps looking healthy — the user should know. Rate-limited so
// the eight per-part listeners failing at once produce one toast, not eight.
let _lastWatchErrToast = 0;
function _reportWatchError(scope, err) {
  console.error(`${scope} failed`, err);
  const now = Date.now();
  if (now - _lastWatchErrToast < 30000) return;
  _lastWatchErrToast = now;
  if (typeof window.showToast === 'function') {
    const denied = err && (err.code === 'permission-denied' || err.code === 'PERMISSION_DENIED');
    window.showToast(denied
      ? '⚠ Live sync stopped: no permission for this book — changes from other devices won\'t appear'
      : '⚠ Live sync interrupted — changes from other devices may not appear until you reload', 'err', 6000);
  }
}

window._fbWatch = (bookId, cb) => {
  try {
    if (window._useFirestoreForBook(bookId)) {
      if (_fsWatchUnsubs[bookId]) {
        _fsWatchUnsubs[bookId].forEach(u => u());
      }
      _fsWatchUnsubs[bookId] = [];

      if (!window._fsHashes) window._fsHashes = {};
      if (!window._fsHashes[bookId]) window._fsHashes[bookId] = {};

      // A single collection listener replaces the eight per-document ones this
      // used to open. With every book watched at startup that was 8×N live
      // listeners for data that always has to be applied together anyway.
      //
      // It also removes the "wait until all eight have reported once" dance:
      // a collection snapshot is already a complete, consistent view, so the
      // first one can be handed straight to the callback. Deleted parts simply
      // stop appearing in the snapshot and assembleParts restores their empty
      // default, which is what the old per-document !exists() branch did.
      const collRef = collection(fs, 'books', bookId, 'data');
      const unsub = onSnapshot(collRef, (snap) => {
        try {
          const raw = {};
          snap.forEach(d => { raw[d.id] = (d.data() || {}).data; });

          const { parts, present } = assembleParts(raw);

          // Only advance the merge base for parts that actually have a stored
          // document — same as before. A part with no document keeps whatever
          // base it already had rather than being marked clean-and-empty.
          present.forEach(name => { window._fsHashes[bookId][name] = raw[name]; });

          // stitchState keeps a fixed key order so JSON.stringify is stable —
          // prevents false-positive hash mismatches vs _fbLoad output.
          cb(JSON.stringify(stitchState(parts)));
        } catch (err) {
          // One unparseable document used to break only its own listener and
          // leave the other seven live. Now they share a callback, so an
          // uncaught throw here would kill live sync for the whole book —
          // report it the same way a listener failure is reported instead.
          _reportWatchError('Watch book data', err);
        }
      }, err => _reportWatchError('Watch book data', err));
      _fsWatchUnsubs[bookId].push(unsub);
      return;
    }
    onValue(ref(db, `lyrical/books/${bookId}`), s => { if (s.exists()) cb(s.val().data); },
      err => _reportWatchError('RTDB watch', err));
  } catch (e) { console.error("fbWatch setup failed", e); }
};

// ─────────────────────────────────────────────
// CLIENT ERROR REPORTING
// ─────────────────────────────────────────────
// Append-only sink for the window.onerror / unhandledrejection handlers in
// main.js. Any signed-in user can create a row (an author's broken screen is
// exactly as worth knowing about as the publisher's) but only the publisher can
// read or clear them — see the clientErrors rule in firestore.rules.
//
// Never throws and never toasts: this runs on the failure path, so a reporting
// problem must stay invisible rather than becoming a second visible fault.
// Fire-and-forget on purpose; the caller does not await a diagnostic write.
window._fbLogClientError = async (entry) => {
  try {
    if (!entry || !window._useFirestoreGlobal()) return;
    await setDoc(doc(collection(fs, 'clientErrors')), {
      ...entry,
      email: (auth.currentUser && auth.currentUser.email) || '',
      ts: entry.ts || Date.now(),
    });
  } catch (e) {
    // Swallowed deliberately — see above. console only, no re-report.
    console.warn('[FB] client error report failed', e);
  }
};

// ─────────────────────────────────────────────
// AUTHOR SUBMISSIONS
// ─────────────────────────────────────────────
window._fbSubmitActivity = async (bookId, type, data) => {
  try {
    if (window._useFirestoreForBook(bookId)) {
      const collRef = collection(fs, 'submissions', bookId, type);
      await setDoc(doc(collRef), { data: JSON.stringify(data), ts: Date.now() });
      return;
    }
    const newRef = push(ref(db, `lyrical/submissions/${bookId}/${type}`));
    await set(newRef, { data: JSON.stringify(data), ts: Date.now() });
  } catch (e) { console.error("fbSubmit failed", e); }
};

let _fsSubUnsubs = {};
window._fbWatchSubmissions = (bookId, cb) => {
  try {
    if (window._useFirestoreForBook(bookId)) {
      if (_fsSubUnsubs[bookId]) _fsSubUnsubs[bookId].forEach(unsub => unsub());
      _fsSubUnsubs[bookId] = [];
      let combinedData = {};
      // Track which sub-collections have delivered at least one snapshot so we
      // don't call notify() with half-populated data on slow mobile connections.
      const initializedTypes = new Set();
      const TYPES = ['expenses', 'sales'];
      const notify = () => cb((combinedData.expenses || combinedData.sales) ? combinedData : null);
      TYPES.forEach(type => {
        const collRef = collection(fs, 'submissions', bookId, type);
        const unsub = onSnapshot(collRef, (snapshot) => {
          if (!combinedData[type]) combinedData[type] = {};
          snapshot.docChanges().forEach(change => {
            if (change.type === 'removed') delete combinedData[type][change.doc.id];
            else combinedData[type][change.doc.id] = change.doc.data();
          });
          if (Object.keys(combinedData[type]).length === 0) delete combinedData[type];
          initializedTypes.add(type);
          // Only notify once both sub-collections have had their first snapshot
          if (initializedTypes.size === TYPES.length) notify();
        }, (err) => _reportWatchError('Sub watch', err));
        _fsSubUnsubs[bookId].push(unsub);
      });
      return;
    }
    onValue(ref(db, `lyrical/submissions/${bookId}`), s => cb(s.exists() ? s.val() : null),
      err => _reportWatchError('RTDB sub watch', err));
  } catch (e) { console.error("fbWatchSub failed", e); }
};

// Permanently delete every Firebase artifact for a book: per-book state
// (Firestore parts + RTDB), submissions, and any live watchers. Called from
// deleteBook() so removed books don't reappear when their data is re-watched.
window._fbDeleteBook = async (bookId) => {
  try {
    // Tear down active watchers so onSnapshot callbacks can't reinstate state.
    if (_fsWatchUnsubs[bookId]) {
      _fsWatchUnsubs[bookId].forEach(u => { try { u(); } catch (_) {} });
      delete _fsWatchUnsubs[bookId];
    }
    if (_fsSubUnsubs[bookId]) {
      _fsSubUnsubs[bookId].forEach(u => { try { u(); } catch (_) {} });
      delete _fsSubUnsubs[bookId];
    }
    if (window._fsHashes && window._fsHashes[bookId]) delete window._fsHashes[bookId];

    const subTypes = ['expenses', 'sales'];

    if (window._useFirestoreForBook(bookId)) {
      // Atomic, so a deleted book can't come back half-alive: the old
      // per-document deletes could drop `hist` and leave `metadata` behind,
      // which is enough for the book to reappear with its stock counts intact
      // and no sales to explain them. Deleting a missing document is a no-op in
      // Firestore, so parts that were never written don't need tolerating.
      const batch = writeBatch(fs);
      ALL_PARTS.forEach(name => batch.delete(doc(fs, 'books', bookId, 'data', name)));
      await batch.commit().catch(e => console.error('fbDeleteBook parts failed', e));
      for (const type of subTypes) {
        const snap = await get(ref(db, `lyrical/submissions/${bookId}/${type}`)).catch(() => null);
        if (snap && snap.exists()) {
          await Promise.all(Object.keys(snap.val()).map(id =>
            deleteDoc(doc(fs, 'submissions', bookId, type, id)).catch(() => {})
          ));
        }
      }
    }
    // Always wipe RTDB copies too — books may have lived there before migration.
    await remove(ref(db, `lyrical/books/${bookId}`)).catch(() => {});
    await remove(ref(db, `lyrical/submissions/${bookId}`)).catch(() => {});
  } catch (e) {
    console.error('fbDeleteBook failed', e);
  }
};

window._fbDeleteSubmission = async (bookId, type, subId) => {
  try {
    if (window._useFirestoreForBook(bookId)) {
      await deleteDoc(doc(fs, 'submissions', bookId, type, subId));
      return;
    }
    await remove(ref(db, `lyrical/submissions/${bookId}/${type}/${subId}`));
  } catch (e) { console.error("fbDeleteSub failed", e); }
};

// ─────────────────────────────────────────────
// GLOBAL SETTINGS
// ─────────────────────────────────────────────
window._fbSaveSettings = async (key, data) => {
  try {
    if (window._useFirestoreGlobal()) {
      await setDoc(doc(fs, 'settings', key), { data: JSON.stringify(data), ts: Date.now() });
      return;
    }
    await set(ref(db, `lyrical/settings/${key}`), { data: JSON.stringify(data), ts: Date.now() });
  } catch (e) { console.error("fbSaveSettings failed", e); }
};

window._fbLoadSettings = async (key) => {
  try {
    if (window._useFirestoreGlobal()) {
      const s = await getDoc(doc(fs, 'settings', key));
      if (s.exists()) return safeParse(s.data().data);
      // Transparent fallback: Firestore doc missing — read from RTDB
      console.warn(`[FB] settings/${key} not in Firestore, reading from RTDB`);
      const rtSnap = await get(ref(db, `lyrical/settings/${key}`));
      return rtSnap.exists() ? safeParse(rtSnap.val().data) : null;
    }
    const s = await get(ref(db, `lyrical/settings/${key}`));
    return s.exists() ? safeParse(s.val().data) : null;
  } catch (e) { console.error("fbLoadSettings failed", e); return null; }
};

// ─────────────────────────────────────────────
// EMAIL RECEIPT INBOX  (Gmail add-on → app)
// The Gmail add-on writes draft expenses here as { data: JSON, ts, source }.
// The app watches the collection live and surfaces them in the existing
// "Import Receipts from Email" review screen.
// ─────────────────────────────────────────────
let _inboxUnsub = null;
window._fbWatchEmailInbox = (cb) => {
  try {
    if (_inboxUnsub) { try { _inboxUnsub(); } catch (_) {} _inboxUnsub = null; }
    const collRef = collection(fs, 'emailReceiptInbox');
    _inboxUnsub = onSnapshot(collRef, (snap) => {
      const items = [];
      snap.forEach(d => {
        const raw = d.data() || {};
        const draft = safeParse(raw.data) || {};
        items.push({ ...draft, _inboxId: d.id, _ts: raw.ts || 0 });
      });
      items.sort((a, b) => (b._ts || 0) - (a._ts || 0));
      cb(items);
    }, (err) => console.error('inbox watch failed', err));
  } catch (e) { console.error('fbWatchEmailInbox failed', e); }
};

window._fbDeleteInboxItem = async (id) => {
  try { await deleteDoc(doc(fs, 'emailReceiptInbox', id)); }
  catch (e) { console.error('fbDeleteInboxItem failed', e); }
};

window._fbSaveCatalog = async (catalog) => {
  try {
    if (window._useFirestoreGlobal()) {
      await setDoc(doc(fs, 'settings', 'catalog'), { data: JSON.stringify(catalog), ts: Date.now() });
      return;
    }
    await set(ref(db, `lyrical/settings/catalog`), { data: JSON.stringify(catalog), ts: Date.now() });
  } catch (e) { console.error("fbSaveCatalog failed", e); }
};

// Rules-readable ownership map: { bookId: authorEmailLower }. Stored as PLAIN
// fields (not the usual { data: <stringified JSON> } blob) so the security
// rules — which cannot parse JSON strings — can verify an author only writes
// their own book. Written to BOTH backends so ownership resolves whichever
// store a book lives in. Publisher-only; the rules reject author settings writes.
window._fbSaveBookOwners = async (owners) => {
  const clean = {};
  Object.keys(owners || {}).forEach(id => {
    const email = String(owners[id] || '').toLowerCase().trim();
    if (email) clean[id] = email;
  });
  try { await set(ref(db, 'lyrical/settings/bookOwners'), clean); }
  catch (e) { console.error('fbSaveBookOwners (RTDB) failed', e); }
  try { await setDoc(doc(fs, 'settings', 'bookOwners'), clean); }
  catch (e) { console.error('fbSaveBookOwners (Firestore) failed', e); }
};

// ─────────────────────────────────────────────
// SYSTEM BACKUP SNAPSHOTS
// Each snapshot lives in its OWN doc/node instead of being inlined into the
// settings manifest, so a growing catalog can't push the manifest past
// Firestore's 1 MiB per-document limit. Mirrors the global Firestore/RTDB mode
// used for settings. The SAVE intentionally THROWS on failure so callers can
// surface a toast instead of losing the backup silently.
// ─────────────────────────────────────────────
window._fbSaveBackupSnapshot = async (id, snapshot) => {
  const payload = { data: JSON.stringify(snapshot), ts: Date.now() };
  if (window._useFirestoreGlobal()) {
    await setDoc(doc(fs, 'backups', id), payload);
  } else {
    await set(ref(db, `lyrical/backups/${id}`), payload);
  }
};

window._fbLoadBackupSnapshot = async (id) => {
  try {
    if (window._useFirestoreGlobal()) {
      const s = await getDoc(doc(fs, 'backups', id));
      if (s.exists()) return safeParse(s.data().data);
      // Fallback in case the snapshot predates a Firestore mode switch.
      const rt = await get(ref(db, `lyrical/backups/${id}`));
      return rt.exists() ? safeParse(rt.val().data) : null;
    }
    const s = await get(ref(db, `lyrical/backups/${id}`));
    return s.exists() ? safeParse(s.val().data) : null;
  } catch (e) { console.error('fbLoadBackupSnapshot failed', e); return null; }
};

window._fbDeleteBackupSnapshot = async (id) => {
  // Best-effort delete from both stores so a pruned/old snapshot never orphans.
  try { await deleteDoc(doc(fs, 'backups', id)); } catch (e) { /* missing / RTDB-only */ }
  try { await remove(ref(db, `lyrical/backups/${id}`)); } catch (e) { /* ignore */ }
};

window._fbLoadCatalog = async () => {
  try {
    if (window._useFirestoreGlobal()) {
      const s = await getDoc(doc(fs, 'settings', 'catalog'));
      if (s.exists()) return safeParse(s.data().data);
      // Transparent fallback: Firestore doc missing — read from RTDB
      console.warn('[FB] catalog not in Firestore, reading from RTDB');
      const rtSnap = await get(ref(db, `lyrical/settings/catalog`));
      return rtSnap.exists() ? safeParse(rtSnap.val().data) : null;
    }
    const s = await get(ref(db, `lyrical/settings/catalog`));
    return s.exists() ? safeParse(s.val().data) : null;
  } catch (e) { console.error("fbLoadCatalog failed", e); return null; }
};

// ─────────────────────────────────────────────
// MASS MIGRATION UTILITY
// ─────────────────────────────────────────────
window._fbMassMigrate = async (BOOKS) => {
  const promises = [];

  // 1. Migrate Books
  // ⚡ Bolt Optimization: Parallelize Asynchronous I/O
  // Replaced sequential `for...of` loops with `Promise.all` to fetch book data concurrently.
  await Promise.all(Object.keys(BOOKS).map(async bookId => {
    const snap = await get(ref(db, `lyrical/books/${bookId}`));
    if (snap.exists()) {
      const bookObj = snap.val();
      if (bookObj && bookObj.data) {
        const stateJson = safeParse(bookObj.data);
        if (stateJson) {
          const s = { ...stateJson };
          const parts = {};
          LIST_PARTS.forEach(k => {
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
  }));

  // 2. Migrate Submissions
  // ⚡ Bolt Optimization: Parallelize Asynchronous I/O
  // Replaced sequential `for...of` loops with `Promise.all` to fetch submission data concurrently.
  await Promise.all(Object.keys(BOOKS).map(async bookId => {
    await Promise.all(['expenses', 'sales'].map(async type => {
      const typeSnap = await get(ref(db, `lyrical/submissions/${bookId}/${type}`));
      if (typeSnap.exists()) {
        const subData = typeSnap.val();
        Object.keys(subData).forEach(subId => {
           const subObj = subData[subId];
           const dRef = doc(fs, 'submissions', bookId, type, subId);
           promises.push(setDoc(dRef, { data: subObj.data, ts: subObj.ts || Date.now() }));
        });
      }
    }));
  }));

  // 3. Migrate Settings
  // ⚡ Bolt Optimization: Parallelize Asynchronous I/O
  // Replaced sequential `for...of` loops with `Promise.all` to fetch settings concurrently.
  const settingsKeys = ['catalog', 'taxCenter', 'productionCosts', 'paymentLinks', 'systemBackups'];
  await Promise.all(settingsKeys.map(async key => {
    const setSnap = await get(ref(db, `lyrical/settings/${key}`));
    if (setSnap.exists()) {
       const settingObj = setSnap.val();
       const dRef = doc(fs, 'settings', key);
       promises.push(setDoc(dRef, { data: settingObj.data, ts: settingObj.ts || Date.now() }));
    }
  }));

  await Promise.all(promises);
  return true;
};

window._fbReady = true;
document.dispatchEvent(new Event('firebase-ready'));
