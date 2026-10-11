import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase, ref, set, onValue, get, push, remove } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { getAuth, signInWithPopup, reauthenticateWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, setDoc, getDoc, getDocs, getDocFromServer, collection, onSnapshot, deleteDoc, writeBatch, runTransaction, query, where } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { receiptDuplicate } from './lib/receipt-finder.js';
import { ALL_PARTS, LIST_PARTS, assembleParts, emptyPart, splitState, stitchState, mergePart, mergeSettingDoc } from './lib/merge-state.js';
import { planWebsitePublish } from './lib/website-link.js';

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
    const { getStorage: gStorage, ref: gRef, deleteObject } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js");
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
// The signed-in user's ID token, for the Apps Script webhook (see lib/gas-auth.js).
window._fbGetIdToken = async () => (auth.currentUser ? auth.currentUser.getIdToken() : '');

// Gmail permission is incremental, separate from normal app sign-in.
//
// `prompt: 'consent'` used to be forced here, which made Google re-run the full
// consent screen on every single connect — the reason the publisher had to
// grant Gmail access again every time they opened the finder. Google only
// prompts when a scope has not been granted yet, so dropping it turns a repeat
// connect into a popup that opens and closes on its own.
//
// Returns the expiry alongside the token so the caller can reuse a live token
// and reconnect exactly once it has actually lapsed, rather than guessing.
window._fbConnectReceiptGmail = async () => {
  if (!auth.currentUser || !window.IS_PUBLISHER) throw new Error('Sign in as publisher first');
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
  provider.setCustomParameters({ login_hint: auth.currentUser.email });
  const result = await reauthenticateWithPopup(auth.currentUser, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) throw new Error('Google did not grant Gmail access');
  // Google's tokens last an hour. Expire ours a few minutes early so a scan
  // never starts on a token that dies halfway through it.
  const seconds = Number(result?._tokenResponse?.oauthExpireIn);
  const lifetime = Number.isFinite(seconds) && seconds > 0 ? seconds : 3600;
  return { token: credential.accessToken, expiresAt: Date.now() + Math.max(60, lifetime - 300) * 1000 };
};

// Append against the latest global ledger, atomically. The finder outbox
// handles offline retry; an imported receipt is acknowledged only after commit.
window._fbCommitFoundReceipt = async (expense, draft) => {
  if (!auth.currentUser || !window.IS_PUBLISHER) throw new Error('Publisher access required');
  if (!window._useFirestoreGlobal()) throw new Error('Enable global Firestore storage before importing receipts');
  return runTransaction(fs, async transaction => {
    const target = doc(fs, 'settings', 'taxCenter');
    const snapshot = await transaction.get(target);
    if (!snapshot.exists()) throw new Error('Save Tax Centre settings to Firestore before importing receipts');
    const current = JSON.parse(snapshot.data().data);
    const expenses = current.businessExpenses || [];
    const duplicate = receiptDuplicate(draft, expenses);
    if (!duplicate) {
      current.businessExpenses = [expense, ...expenses];
      transaction.set(target, { data: JSON.stringify(current), ts: Date.now() });
    }
    return { expense: duplicate || expense, duplicate: !!duplicate };
  });
};

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
// A copy of the merge base for a book, so a change queued offline can carry it.
window._fbBaseFor = (bookId) => ({ ...((window._fsHashes || {})[bookId] || {}) });

window._fbSave = async (bookId, json, opts = {}) => {
  try {
    if (window._useFirestoreForBook(bookId)) {
      const parts = splitState(JSON.parse(json));

      if (!window._fsHashes) window._fsHashes = {};
      if (!window._fsHashes[bookId]) window._fsHashes[bookId] = {};
      const hashes = window._fsHashes[bookId];

      const partNames = Object.keys(parts);
      const dirty = partNames.filter(p => hashes[p] !== JSON.stringify(parts[p]));
      if (!dirty.length) return { ok: true, merged: false };
      // The merge base is what this edit was made on top of, fixed NOW, before
      // the server read below. The live listener moves `hashes` to the newest
      // server copy, so reading it after the await (or, for a change queued
      // offline, at flush time) made another device's edit look like our own
      // starting point and the write overwrote it. A queued change carries the
      // base it was made on in `opts.base`.
      const base = opts.base || { ...hashes };

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
        const baseJson = Object.prototype.hasOwnProperty.call(base, p) ? base[p] : null;
        if (remoteJson === baseJson) return; // nobody else touched it

        // Diverged. A null base (this device never read the part — a fresh tab
        // that wrote before loading, or a change queued by an older build) is
        // treated as empty and flagged as unknown, which makes the merge a
        // union: it may keep a row the other device deleted, but it will never
        // drop one (dropping loses money) or count a sale both sides already
        // hold twice (doubling invents it).
        didMerge = true;
        const remoteVal = remoteJson != null ? (safeParse(remoteJson) ?? emptyFor(p)) : emptyFor(p);
        const baseVal = baseJson != null ? (safeParse(baseJson) ?? emptyFor(p)) : emptyFor(p);
        const res = mergePart(p, baseVal, remoteVal, parts[p], { baseKnown: baseJson != null });
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
      // Bounded by ALL_PARTS (9 documents), so Firestore's 500-write batch
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
  } catch (e) {
    // Rethrow: a failed read is not an empty book. Returning null made callers
    // seed defaults over the real ledger on the next save.
    console.error("fbLoad failed", e); throw e;
  }
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
// Throws on failure — deliberately, and this is the whole point.
//
// This used to swallow the error and return normally. Both callers in main.js
// wrap it in a try/catch that inspects the error and shows "⚠ Failed to submit
// order" or a permission-denied message, and none of that could ever run: the
// author saw "✓ Order submitted for approval", the log recorded a success, an
// email went to the publisher announcing the submission, and the sale did not
// exist anywhere. Author submissions do not go through the offline sync queue,
// so nothing else was going to notice either.
window._fbSubmitActivity = async (bookId, type, data) => {
  try {
    if (window._useFirestoreForBook(bookId)) {
      const collRef = collection(fs, 'submissions', bookId, type);
      await setDoc(doc(collRef), { data: JSON.stringify(data), ts: Date.now() });
      return;
    }
    const newRef = push(ref(db, `lyrical/submissions/${bookId}/${type}`));
    await set(newRef, { data: JSON.stringify(data), ts: Date.now() });
  } catch (e) {
    console.error("fbSubmit failed", e);
    throw e;
  }
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
        // A Firestore book's submissions live in Firestore, so list them there.
        const snap = await getDocs(collection(fs, 'submissions', bookId, type)).catch(() => null);
        if (snap && !snap.empty) {
          await Promise.all(snap.docs.map(d => deleteDoc(d.ref).catch(() => {})));
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
      return true;
    }
    await remove(ref(db, `lyrical/submissions/${bookId}/${type}/${subId}`));
    return true;
  } catch (e) { console.error("fbDeleteSub failed", e); return false; }
};

// ─────────────────────────────────────────────
// GLOBAL SETTINGS
// ─────────────────────────────────────────────
// Returns true when the write landed, false when it didn't, and toasts on
// failure — the same contract _fbSave has had all along.
//
// This is where production costs, payment links, the mailing list, campaigns,
// open calls, customer suppression and the notify endpoint are persisted. A
// failure used to be a console line nobody reads: the edit stayed on screen
// looking saved and was gone on the next load. Several callers wrap this in
// `try { … } catch (_) {}`, which was always dead code — it never threw — so
// there was nowhere else for the failure to surface either.
// Shared settings that are edited on more than one device and were written
// back whole: merge them against the copy this device last loaded instead (see
// mergeSettingDoc). `_settingsBase[key]` is that copy, as stored JSON.
const MERGED_SETTINGS = new Set(['catalog', 'taxCenter']);
const _settingsBase = {};
function noteSettingsBase(key, json) {
  if (MERGED_SETTINGS.has(key) && typeof json === 'string') _settingsBase[key] = json;
}

async function writeMergedSetting(key, data) {
  const target = doc(fs, 'settings', key);
  const localJson = JSON.stringify(data);
  let value = data;
  if (Object.prototype.hasOwnProperty.call(_settingsBase, key)) {
    try {
      const snap = await getDocFromServer(target);
      const res = mergeSettingDoc(_settingsBase[key], snap.exists() ? snap.data().data : null, data);
      if (res.merged) {
        value = res.value;
        if (res.conflicts.length) console.warn(`[FB] settings/${key}: changed on two devices, this device's version kept`, res.conflicts);
      }
    } catch (e) {
      // Offline or unreadable: write what we have, as before, rather than not at all.
      console.warn(`[FB] settings/${key}: could not read the cloud copy to merge`, e);
    }
  }
  await setDoc(target, { data: JSON.stringify(value), ts: Date.now() });
  // The base is this device's copy, not the merged result: the screen still shows
  // this copy, so the next save must treat whatever the other device added as
  // theirs to keep, not as something this device deleted.
  _settingsBase[key] = localJson;
  return value;
}

window._fbSaveSettings = async (key, data) => {
  try {
    if (window._useFirestoreGlobal()) {
      if (MERGED_SETTINGS.has(key)) {
        await writeMergedSetting(key, data);
        return true;
      }
      await setDoc(doc(fs, 'settings', key), { data: JSON.stringify(data), ts: Date.now() });
      return true;
    }
    await set(ref(db, `lyrical/settings/${key}`), { data: JSON.stringify(data), ts: Date.now() });
    return true;
  } catch (e) {
    console.error("fbSaveSettings failed", e);
    if (typeof window.showToast === 'function') {
      window.showToast(`⚠ Could not save ${key} to the cloud — your change may be lost on reload`, 'err', 5000);
    }
    return false;
  }
};

window._fbLoadSettings = async (key) => {
  try {
    if (window._useFirestoreGlobal()) {
      const s = await getDoc(doc(fs, 'settings', key));
      if (s.exists()) { noteSettingsBase(key, s.data().data); return safeParse(s.data().data); }
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

// ─────────────────────────────────────────────
// WEBSITE LINK  (website ↔ inventory app — docs/website-link.md)
// The website's Cloud Functions write each paid order into websiteOrders/{id}
// and set `pending`. This app turns it into ledger rows through its normal
// save path, then — in ONE transaction that re-reads the server's copy of the
// books — publishes the stock feed, marks the orders it brought in, and sends
// back any label bought here. Nothing outside writes into a book's own data.
// ─────────────────────────────────────────────
let _webOrdersUnsub = null;
window._fbWatchWebsiteOrders = (cb, onErr) => {
  try {
    if (_webOrdersUnsub) { try { _webOrdersUnsub(); } catch (_) {} _webOrdersUnsub = null; }
    const pendingOrders = query(collection(fs, 'websiteOrders'), where('pending', '==', true));
    _webOrdersUnsub = onSnapshot(pendingOrders, (snap) => {
      const docs = [];
      snap.forEach(d => docs.push({ id: d.id, ...(d.data() || {}) }));
      cb(docs, { fromCache: !!(snap.metadata && snap.metadata.fromCache) });
    }, (err) => {
      console.error('website orders watch failed', err);
      if (typeof onErr === 'function') onErr(err);
    });
    return () => { if (_webOrdersUnsub) { try { _webOrdersUnsub(); } catch (_) {} _webOrdersUnsub = null; } };
  } catch (e) {
    console.error('fbWatchWebsiteOrders failed', e);
    if (typeof onErr === 'function') onErr(e);
    return null;
  }
};

// websiteLink/website is the website's heartbeat; websiteLink/app is ours.
let _webLinkUnsub = null;
window._fbWatchWebsiteLinkStatus = (cb, onErr) => {
  try {
    if (_webLinkUnsub) { try { _webLinkUnsub(); } catch (_) {} _webLinkUnsub = null; }
    _webLinkUnsub = onSnapshot(collection(fs, 'websiteLink'), (snap) => {
      const out = { website: null, app: null };
      snap.forEach(d => { if (d.id === 'website' || d.id === 'app') out[d.id] = d.data() || {}; });
      cb(out);
    }, (err) => {
      console.error('website link status watch failed', err);
      if (typeof onErr === 'function') onErr(err);
    });
    return () => { if (_webLinkUnsub) { try { _webLinkUnsub(); } catch (_) {} _webLinkUnsub = null; } };
  } catch (e) {
    console.error('fbWatchWebsiteLinkStatus failed', e);
    if (typeof onErr === 'function') onErr(e);
    return null;
  }
};

// Throws on failure: the one caller is the first-run "bring them in" button,
// which must not proceed as if the owner's go-ahead had been recorded.
window._fbSaveWebsiteLinkApp = async (data) => {
  if (!auth.currentUser || !window.IS_PUBLISHER) throw new Error('Publisher access required');
  const allowed = ['importConsentAt', 'lastImportAt', 'lastFeedAt', 'build'];
  const clean = {};
  allowed.forEach(k => { if (data && typeof data[k] === 'string') clean[k] = data[k]; });
  await setDoc(doc(fs, 'websiteLink', 'app'), clean, { merge: true });
};

const WEB_LINK_PARTS = ['hist', 'ledger', 'metadata'];

// One transaction:
//   reads   settings/catalog, the involved websiteOrders docs, and the hist /
//           ledger / metadata parts of every book involved — all from the
//           SERVER, so a device holding a stale copy can't send the stock feed
//           backwards or mark an order it never actually saved
//   decides with planWebsitePublish (src/lib/website-link.js, unit-tested)
//   writes  websiteStockFeed/{book}, websiteOrders/{id} (imported, pending,
//           app.* only) and websiteLink/app
// Books still in the Realtime Database can't be read inside a Firestore
// transaction; they come back in `blocked` and nothing is published for them.
window._fbPublishWebsiteLink = async ({ bookIds = [], marks = [], shipments = [], testShipments = [], heldOrders = [], build = '', device = '' } = {}) => {
  if (!auth.currentUser || !window.IS_PUBLISHER) throw new Error('Publisher access required');
  const empty = { feeds: 0, accepted: [], refused: [], sent: [], current: [], blocked: [], unavailable: [] };
  if (!window._useFirestoreGlobal()) return { ok: false, reason: 'old-storage', ...empty };
  const orderIds = [...new Set([
    ...marks.map(m => m && m.orderId),
    ...shipments.map(s => s && s.orderId),
    ...testShipments.map(t => t && t.orderId),
  ].filter(Boolean).map(String))];
  const requested = [...new Set((bookIds || []).filter(Boolean).map(String))];

  return runTransaction(fs, async (tx) => {
    const now = new Date().toISOString();
    const orderSnaps = await Promise.all(orderIds.map(id => tx.get(doc(fs, 'websiteOrders', id))));
    const orderDocs = {};
    orderIds.forEach((id, i) => { orderDocs[id] = orderSnaps[i].exists() ? orderSnaps[i].data() : null; });

    const involved = new Set(requested);
    marks.forEach(m => Object.keys((m && m.effect) || {}).forEach(id => involved.add(id)));
    Object.values(orderDocs).forEach(d => {
      if (d && d.web && d.web.books && typeof d.web.books === 'object') Object.keys(d.web.books).forEach(id => involved.add(id));
    });
    const blocked = [...involved].filter(id => !window._useFirestoreForBook(id));
    const readable = [...involved].filter(id => window._useFirestoreForBook(id));

    const catalogSnap = await tx.get(doc(fs, 'settings', 'catalog'));
    const partSnaps = await Promise.all(readable.flatMap(id => WEB_LINK_PARTS.map(p => tx.get(doc(fs, 'books', id, 'data', p)))));
    const books = {};
    readable.forEach((id, i) => {
      const snaps = partSnaps.slice(i * WEB_LINK_PARTS.length, (i + 1) * WEB_LINK_PARTS.length);
      // No documents at all: this book's data still lives in the old storage
      // (see _fbLoad's fallback), so the server has nothing trustworthy yet.
      if (!snaps.some(s => s.exists())) return;
      const parts = {};
      let ok = true;
      WEB_LINK_PARTS.forEach((p, j) => {
        const s = snaps[j];
        if (!s.exists()) { parts[p] = emptyPart(p); return; }
        const value = safeParse((s.data() || {}).data);
        if (value == null) ok = false; else parts[p] = value;
      });
      if (ok) books[id] = parts;
    });
    const catalog = catalogSnap.exists() ? (safeParse((catalogSnap.data() || {}).data) || {}) : {};

    const plan = planWebsitePublish({ bookIds: requested, books, catalog, orderDocs, marks, shipments, testShipments, heldOrders, now, build, device });
    plan.feeds.forEach(f => tx.set(doc(fs, 'websiteStockFeed', f.bookId), f.doc));
    plan.orderUpdates.forEach(u => tx.update(doc(fs, 'websiteOrders', u.orderId), u.data));
    const app = { build: String(build || '') };
    if (plan.feeds.length) app.lastFeedAt = now;
    if (plan.accepted.length) app.lastImportAt = now;
    tx.set(doc(fs, 'websiteLink', 'app'), app, { merge: true });
    return {
      ok: true,
      at: now,
      feeds: plan.feeds.length,
      accepted: plan.accepted,
      refused: plan.refused,
      sent: plan.sent,
      current: plan.current,
      blocked,
      unavailable: readable.filter(id => !books[id]),
    };
  });
};

// Same contract as _fbSaveSettings. A dropped catalog write loses a book's
// title, price, print run or artist split, so it must not fail quietly either.
window._fbSaveCatalog = async (catalog) => {
  try {
    if (window._useFirestoreGlobal()) {
      await writeMergedSetting('catalog', catalog);
      return true;
    }
    await set(ref(db, `lyrical/settings/catalog`), { data: JSON.stringify(catalog), ts: Date.now() });
    return true;
  } catch (e) {
    console.error("fbSaveCatalog failed", e);
    if (typeof window.showToast === 'function') {
      window.showToast('⚠ Could not save the catalog to the cloud — your change may be lost on reload', 'err', 5000);
    }
    return false;
  }
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
  // authorEmails: { <email, dots as commas>: true } — lets the settings read
  // rules ask "is the caller an author of ANY book?" (RTDB keys can't hold '.').
  const authorEmails = {};
  Object.keys(clean).forEach(id => { authorEmails[clean[id].replace(/\./g, ',')] = true; });
  if (Object.keys(authorEmails).length) clean.authorEmails = authorEmails;
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
      if (s.exists()) { noteSettingsBase('catalog', s.data().data); return safeParse(s.data().data); }
      // Transparent fallback: Firestore doc missing — read from RTDB
      console.warn('[FB] catalog not in Firestore, reading from RTDB');
      const rtSnap = await get(ref(db, `lyrical/settings/catalog`));
      return rtSnap.exists() ? safeParse(rtSnap.val().data) : null;
    }
    const s = await get(ref(db, `lyrical/settings/catalog`));
    return s.exists() ? safeParse(s.val().data) : null;
  } catch (e) {
    // Rethrow: null means "no catalog exists"; a failed read must stay distinct
    // so the caller never writes the default books over the real catalog.
    console.error("fbLoadCatalog failed", e); throw e;
  }
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
