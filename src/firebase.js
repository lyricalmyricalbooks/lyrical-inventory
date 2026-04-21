import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue, get, push, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
const fs = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

window._fbAuth = auth;
window._fbStorage = storage;
window._firestore = fs;

// ─────────────────────────────────────────────
// MODE FLAGS
// ─────────────────────────────────────────────
window._useFirestoreForBook = (bookId) => {
  return localStorage.getItem('fs_mode_' + bookId) === 'true';
};

window._useFirestoreGlobal = () => {
  return localStorage.getItem('fs_mode_global') === 'true';
};

window._enableFirestoreGlobal = () => localStorage.setItem('fs_mode_global', 'true');
window._disableFirestoreGlobal = () => localStorage.setItem('fs_mode_global', 'false');

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
  const uploadTask = uploadBytesResumable(storageRef, file);
  return new Promise((resolve, reject) => {
    uploadTask.on('state_changed', null, reject, async () => {
      const url = await getDownloadURL(uploadTask.snapshot.ref);
      resolve(url);
    });
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
window._fbSave = async (bookId, json) => {
  try {
    if (window._useFirestoreForBook(bookId)) {
      const state = JSON.parse(json);
      const s = { ...state };
      const parts = {};
      ['ledger', 'expenses', 'hist', 'stores', 'artistTransfers', 'doneIds'].forEach(k => {
        parts[k] = s[k] || [];
        delete s[k];
      });
      parts.metadata = s;

      if (!window._fsHashes) window._fsHashes = {};
      if (!window._fsHashes[bookId]) window._fsHashes[bookId] = {};
        
      const promises = [];
      Object.keys(parts).forEach(partName => {
        const partJson = JSON.stringify(parts[partName]);
        if (window._fsHashes[bookId][partName] !== partJson) {
          const dRef = doc(fs, 'books', bookId, 'data', partName);
          promises.push(setDoc(dRef, { data: partJson, ts: Date.now() }));
          window._fsHashes[bookId][partName] = partJson;
        }
      });
      await Promise.all(promises);
      return;
    }
    await set(ref(db, `lyrical/books/${bookId}`), { data: json, ts: Date.now() });
  } catch (e) { console.error("fbSave failed", e); }
};

window._fbLoad = async (bookId) => {
  try {
    if (window._useFirestoreForBook(bookId)) {
      const docNames = ['metadata', 'ledger', 'expenses', 'hist', 'stores', 'artistTransfers', 'doneIds'];
      const promises = docNames.map(name => getDoc(doc(fs, 'books', bookId, 'data', name)));
      const snaps = await Promise.all(promises);
      
      const parts = {};
      let hasData = false;
      
      if (!window._fsHashes) window._fsHashes = {};
      if (!window._fsHashes[bookId]) window._fsHashes[bookId] = {};
      
      snaps.forEach((snap, i) => {
         const name = docNames[i];
         if (snap.exists()) {
           hasData = true;
           parts[name] = JSON.parse(snap.data().data);
           window._fsHashes[bookId][name] = snap.data().data;
         } else {
           parts[name] = (name === 'metadata') ? {} : [];
           window._fsHashes[bookId][name] = JSON.stringify(parts[name]);
         }
      });
      
      if (!hasData) return null;
      
      const stitched = {
        ...parts.metadata,
        ledger: parts.ledger,
        expenses: parts.expenses,
        hist: parts.hist,
        stores: parts.stores,
        artistTransfers: parts.artistTransfers,
        doneIds: parts.doneIds
      };
      return JSON.stringify(stitched);
    }
    const s = await get(ref(db, `lyrical/books/${bookId}`));
    return s.exists() ? s.val().data : null;
  } catch (e) { console.error("fbLoad failed", e); return null; }
};

let _fsWatchUnsubs = {};
window._fbWatch = (bookId, cb) => {
  try {
    if (window._useFirestoreForBook(bookId)) {
      if (_fsWatchUnsubs[bookId]) {
        _fsWatchUnsubs[bookId].forEach(u => u());
      }
      _fsWatchUnsubs[bookId] = [];
      
      const docNames = ['metadata', 'ledger', 'expenses', 'hist', 'stores', 'artistTransfers', 'doneIds'];
      let localState = {};
      const loadedDocs = new Set();
      
      if (!window._fsHashes) window._fsHashes = {};
      if (!window._fsHashes[bookId]) window._fsHashes[bookId] = {};

      docNames.forEach(name => {
        const dRef = doc(fs, 'books', bookId, 'data', name);
        const unsub = onSnapshot(dRef, (snap) => {
          if (snap.exists()) {
            localState[name] = JSON.parse(snap.data().data);
            window._fsHashes[bookId][name] = snap.data().data;
          } else {
            localState[name] = (name === 'metadata') ? {} : [];
          }
          loadedDocs.add(name);
          
          if (loadedDocs.size === docNames.length) {
            const stitched = {
              ...localState.metadata,
              ledger: localState.ledger,
              expenses: localState.expenses,
              hist: localState.hist,
              stores: localState.stores,
              artistTransfers: localState.artistTransfers,
              doneIds: localState.doneIds
            };
            cb(JSON.stringify(stitched));
          }
        }, err => console.error("Watch failed", name, err));
        _fsWatchUnsubs[bookId].push(unsub);
      });
      return;
    }
    onValue(ref(db, `lyrical/books/${bookId}`), s => { if (s.exists()) cb(s.val().data); });
  } catch (e) { console.error("fbWatch setup failed", e); }
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
      const notify = () => cb((combinedData.expenses || combinedData.sales) ? combinedData : null);
      ['expenses', 'sales'].forEach(type => {
        const collRef = collection(fs, 'submissions', bookId, type);
        const unsub = onSnapshot(collRef, (snapshot) => {
          if (!combinedData[type]) combinedData[type] = {};
          snapshot.docChanges().forEach(change => {
            if (change.type === 'removed') delete combinedData[type][change.doc.id];
            else combinedData[type][change.doc.id] = change.doc.data();
          });
          if (Object.keys(combinedData[type]).length === 0) delete combinedData[type];
          notify();
        }, (err) => console.error("Sub watch failed", err));
        _fsSubUnsubs[bookId].push(unsub);
      });
      return;
    }
    onValue(ref(db, `lyrical/submissions/${bookId}`), s => cb(s.exists() ? s.val() : null));
  } catch (e) { console.error("fbWatchSub failed", e); }
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

window._fbSaveCatalog = async (catalog) => {
  try {
    if (window._useFirestoreGlobal()) {
      await setDoc(doc(fs, 'settings', 'catalog'), { data: JSON.stringify(catalog), ts: Date.now() });
      return;
    }
    await set(ref(db, `lyrical/settings/catalog`), { data: JSON.stringify(catalog), ts: Date.now() });
  } catch (e) { console.error("fbSaveCatalog failed", e); }
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

window._fbReady = true;
document.dispatchEvent(new Event('firebase-ready'));
