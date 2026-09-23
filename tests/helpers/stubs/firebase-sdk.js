// Inert stand-in for every https://www.gstatic.com/firebasejs/<version>/*.js
// module the app imports. vite.config.js's `test.alias` points all of them
// here with a version-agnostic regex, so a Firebase SDK bump never breaks it.
//
// Nothing in here talks to a network. src/firebase.js runs against these at
// import time (initializeApp, getAuth, initializeFirestore, ...) and defines
// its window._fb* functions on top of them; tests/helpers/load-app.js then
// replaces the ones a test cares about (_fbSave, _fbLoad, _fbLoadCatalog...)
// with in-memory fakes.
//
// Named exports are listed out rather than generated because ESM needs static
// names. A name the app imports that is missing here reads as `undefined`
// under vitest's module transform instead of failing to link, so add it when
// a newly imported SDK function is actually called during a test.

globalThis.__firebaseStub = globalThis.__firebaseStub || { authCallbacks: [] };

const noop = () => {};
const handle = (kind) => ({ __stub: kind });
const emptySnap = () => ({
  exists: () => false, data: () => undefined, val: () => null,
  docs: [], forEach: noop, size: 0, empty: true,
});

// firebase-app
export const initializeApp = () => handle('app');

// firebase-auth
export const getAuth = () => handle('auth');
export class GoogleAuthProvider { addScope() {} setCustomParameters() {} }
export const signInWithPopup = async () => ({ user: null });
export const reauthenticateWithPopup = async () => ({ user: null });
export const signOut = async () => {};
// The app's startup waits on this. The harness decides who (if anyone) is
// signed in by calling the captured callback itself — see load-app.js.
export const onAuthStateChanged = (_auth, cb) => {
  globalThis.__firebaseStub.authCallbacks.push(cb);
  return noop;
};

// firebase-database (Realtime Database)
export const getDatabase = () => handle('rtdb');
export const ref = (_db, path) => handle('ref:' + (path || ''));
export const set = async () => {};
export const get = async () => emptySnap();
export const push = () => handle('push');
export const remove = async () => {};
export const onValue = () => noop;

// firebase-storage
export const getStorage = () => handle('storage');
export const uploadBytesResumable = () => ({ on: noop, snapshot: {} });
export const getDownloadURL = async () => '';
export const deleteObject = async () => {};

// firebase-firestore
export const initializeFirestore = () => handle('firestore');
export const getFirestore = () => handle('firestore');
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const memoryLocalCache = () => ({});
export const doc = (...parts) => handle('doc:' + parts.slice(1).join('/'));
export const collection = (...parts) => handle('col:' + parts.slice(1).join('/'));
export const setDoc = async () => {};
export const getDoc = async () => emptySnap();
export const getDocs = async () => emptySnap();
export const getDocFromServer = async () => emptySnap();
export const deleteDoc = async () => {};
export const onSnapshot = () => noop;
export const writeBatch = () => ({ set: noop, update: noop, delete: noop, commit: async () => {} });
export const runTransaction = async (_fs, fn) =>
  fn({ get: async () => emptySnap(), set: noop, update: noop, delete: noop });
