import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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
const googleProvider = new GoogleAuthProvider();

window._fbAuth = auth;
window._fbSignInWithGoogle = async () => {
  return signInWithPopup(auth, googleProvider);
};
window._fbSignOut = async () => {
  return signOut(auth);
};
window._fbOnAuthStateChanged = (cb) => {
  onAuthStateChanged(auth, cb);
};

// Per-book save/load
  window._fbSave = async (bookId, json) => {
    await set(ref(db, `lyrical/books/${bookId}`), { data: json, ts: Date.now() });
  };
  window._fbLoad = async (bookId) => {
    const s = await get(ref(db, `lyrical/books/${bookId}`));
    return s.exists() ? s.val().data : null;
  };
  window._fbWatch = (bookId, cb) => {
    onValue(ref(db, `lyrical/books/${bookId}`), s => { if (s.exists()) cb(s.val().data); });
  };
  // Publisher settings (payment links, production costs) — stored once, shared across all devices
  window._fbSaveSettings = async (key, data) => {
    await set(ref(db, `lyrical/settings/${key}`), { data: JSON.stringify(data), ts: Date.now() });
  };
  window._fbLoadSettings = async (key) => {
    const s = await get(ref(db, `lyrical/settings/${key}`));
    return s.exists() ? JSON.parse(s.val().data) : null;
  };
  
  // Catalog management
  window._fbSaveCatalog = async (catalog) => {
    await set(ref(db, `lyrical/settings/catalog`), { data: JSON.stringify(catalog), ts: Date.now() });
  };
  window._fbLoadCatalog = async () => {
    const s = await get(ref(db, `lyrical/settings/catalog`));
    return s.exists() ? JSON.parse(s.val().data) : null;
  };

  window._fbReady = true;
  document.dispatchEvent(new Event('firebase-ready'));