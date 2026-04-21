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
// Per-book flag: localStorage 'fs_mode_{bookId}' = 'true'
// Global flag:   localStorage 'fs_mode_global' = 'true'  (covers settings + catalog)
// ─────────────────────────────────────────────
window._useFirestoreForBook = (bookId) => {
  return localStorage.getItem('fs_mode_' + bookId) === 'true';
};

window._useFirestoreGlobal = () => {
  return localStorage.getItem('fs_mode_global') === 'true';
};

// Call this when migrating to enable global settings in Firestore too
window._enableFirestoreGlobal = () => {
  localStorage.setItem('fs_mode_global', 'true');
};

window._disableFirestoreGlobal = () => {
  localStorage.setItem('fs_mode_global', 'false');
};

// ─────────────────────────────────────────────
// FILE STORAGE (Receipts) — unchanged, Storage is not being migrated
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
    const { getStorage, ref: sRef, deleteObject } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js");
    const storage = getStorage();
    const fileRef = sRef(storage, url);
    await deleteObject(fileRef);
  } catch (e) {
    console.error("Firebase deletion failed", e);
  }
};

// ─────────────────────────────────────────────
// AUTH — unchanged
// ─────────────────────────────────────────────
window._fbSignInWithGoogle = async () => {
  return signInWithPopup(auth, googleProvider);
};

window._fbSignOut = async () => {
  return signOut(auth);
};

window._fbOnAuthStateChanged = (cb) => {
  onAuthStateChanged(auth, cb);
};

// ─────────────────────────────────────────────
// PER-BOOK DATA
// ─────────────────────────────────────────────
window._fbSave = async (bookId, json) => {
  if (window._useFirestoreForBook(bookId)) {
    await setDoc(doc(fs, 'books', bookId), { data: json, ts: Date.now() });
    return;
  }
  await set(ref(db, `lyrical/books/${bookId}`), { data: json, ts: Date.now() });
};

window._fbLoad = async (bookId) => {
  if (window._useFirestoreForBook(bookId)) {
    const s = await getDoc(doc(fs, 'books', bookId));
    return s.exists() ? s.data().data : null;
  }
  const s = await get(ref(db, `lyrical/books/${bookId}`));
  return s.exists() ? s.val().data : null;
};

let _fsWatchUnsubs = {};
window._fbWatch = (bookId, cb) => {
  if (window._useFirestoreForBook(bookId)) {
    if (_fsWatchUnsubs[bookId]) _fsWatchUnsubs[bookId]();
    _fsWatchUnsubs[bookId] = onSnapshot(doc(fs, 'books', bookId), (s) => {
      if (s.exists()) cb(s.data().data);
    });
    return;
  }
  onValue(ref(db, `lyrical/books/${bookId}`), s => { if (s.exists()) cb(s.val().data); });
};

// ─────────────────────────────────────────────
// AUTHOR SUBMISSIONS (per-book)
// ─────────────────────────────────────────────
window._fbSubmitActivity = async (bookId, type, data) => {
  if (window._useFirestoreForBook(bookId)) {
    const collRef = collection(fs, 'submissions', bookId, type);
    const newDocRef = doc(collRef);
    await setDoc(newDocRef, { data: JSON.stringify(data), ts: Date.now() });
    return;
  }
  const newRef = push(ref(db, `lyrical/submissions/${bookId}/${type}`));
  await set(newRef, { data: JSON.stringify(data), ts: Date.now() });
};

let _fsSubUnsubs = {};
window._fbWatchSubmissions = (bookId, cb) => {
  if (window._useFirestoreForBook(bookId)) {
    if (_fsSubUnsubs[bookId]) {
      _fsSubUnsubs[bookId].forEach(unsub => unsub());
    }
    _fsSubUnsubs[bookId] = [];

    let combinedData = {};
    // Always deliver a stable structure, even when empty
    const notify = () => cb(
      (combinedData.expenses || combinedData.sales) ? combinedData : null
    );

    ['expenses', 'sales'].forEach(type => {
      const collRef = collection(fs, 'submissions', bookId, type);
      const unsub = onSnapshot(collRef, (snapshot) => {
        if (!combinedData[type]) combinedData[type] = {};
        snapshot.docChanges().forEach(change => {
          if (change.type === 'removed') {
            delete combinedData[type][change.doc.id];
          } else {
            combinedData[type][change.doc.id] = change.doc.data();
          }
        });
        if (Object.keys(combinedData[type]).length === 0) delete combinedData[type];
        notify();
      });
      _fsSubUnsubs[bookId].push(unsub);
    });
    return;
  }
  onValue(ref(db, `lyrical/submissions/${bookId}`), s => {
    cb(s.exists() ? s.val() : null);
  });
};

window._fbDeleteSubmission = async (bookId, type, subId) => {
  if (window._useFirestoreForBook(bookId)) {
    await deleteDoc(doc(fs, 'submissions', bookId, type, subId));
    return;
  }
  await remove(ref(db, `lyrical/submissions/${bookId}/${type}/${subId}`));
};

// ─────────────────────────────────────────────
// GLOBAL SETTINGS (taxCenter, productionCosts, paymentLinks, systemBackups)
// Uses the global Firestore flag — not per-book
// ─────────────────────────────────────────────
window._fbSaveSettings = async (key, data) => {
  if (window._useFirestoreGlobal()) {
    await setDoc(doc(fs, 'settings', key), { data: JSON.stringify(data), ts: Date.now() });
    return;
  }
  await set(ref(db, `lyrical/settings/${key}`), { data: JSON.stringify(data), ts: Date.now() });
};

window._fbLoadSettings = async (key) => {
  if (window._useFirestoreGlobal()) {
    const s = await getDoc(doc(fs, 'settings', key));
    return s.exists() ? JSON.parse(s.data().data) : null;
  }
  const s = await get(ref(db, `lyrical/settings/${key}`));
  return s.exists() ? JSON.parse(s.val().data) : null;
};

// ─────────────────────────────────────────────
// CATALOG (the BOOKS registry — which books exist, their config)
// ─────────────────────────────────────────────
window._fbSaveCatalog = async (catalog) => {
  if (window._useFirestoreGlobal()) {
    await setDoc(doc(fs, 'settings', 'catalog'), { data: JSON.stringify(catalog), ts: Date.now() });
    return;
  }
  await set(ref(db, `lyrical/settings/catalog`), { data: JSON.stringify(catalog), ts: Date.now() });
};

window._fbLoadCatalog = async () => {
  if (window._useFirestoreGlobal()) {
    const s = await getDoc(doc(fs, 'settings', 'catalog'));
    return s.exists() ? JSON.parse(s.data().data) : null;
  }
  const s = await get(ref(db, `lyrical/settings/catalog`));
  return s.exists() ? JSON.parse(s.val().data) : null;
};

window._fbReady = true;
document.dispatchEvent(new Event('firebase-ready'));
