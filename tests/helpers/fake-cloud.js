/**
 * The in-memory stand-in for Firebase that both the test harness
 * (tests/helpers/load-app.js, under jsdom) and the phone screenshot rig
 * (scripts/phone-shots/, in a real browser) boot the app against. One copy so
 * the two can't drift: a screen that renders in the rig renders the same way
 * the suite sees it.
 *
 * No vitest imports here — this file also runs in a plain browser page.
 */

// The app merges these built-in titles into any catalog that doesn't list
// them as deleted. Deleting them keeps each run's catalog to its own books.
export const DEFAULT_BOOK_IDS = ['altrove', 'hound', 'archaeology', 'sistema', 'nobody', 'collective'];

export const PUBLISHER_EMAIL = 'lyricalmyricalbooks@gmail.com';

/**
 * @param {object[]} books          catalog entries
 * @param {object}   initialStates  per-book state written as the cloud copy
 * @returns the `cloud` object documented in load-app.js
 */
export function createFakeCloud(books, initialStates = {}) {
  const catalog = { _deletedDefaults: DEFAULT_BOOK_IDS.slice() };
  for (const b of books) catalog[b.id] = b;

  const cloud = {
    catalog,
    books: {},
    settings: {},
    /** Every _fbSave call, in order: { bookId, json, state }. */
    saves: [],
    /** Every fault the app reported through reportClientError. */
    errorReports: [],
    /** How _fbSave answers. Default: accept the write verbatim. */
    saveImpl: null,
    savesFor(bookId) { return cloud.saves.filter(s => s.bookId === bookId); },
    lastSave(bookId) { const list = cloud.savesFor(bookId); return list[list.length - 1]; },
  };
  cloud.defaultSaveImpl = (bookId, json) => { cloud.books[bookId] = json; return { ok: true }; };
  cloud.saveImpl = cloud.defaultSaveImpl;
  for (const [id, st] of Object.entries(initialStates)) cloud.books[id] = JSON.stringify(st);
  return cloud;
}

/**
 * Point every window._fb* function src/firebase.js defined at `cloud`.
 * Call after src/main.js has been imported and before signing in.
 */
export function installFakeFirebase(win, cloud) {
  // Replace every Firebase-backed global with a harmless async no-op first, so
  // an unanticipated call can't reach the SDK stubs and throw; then give the
  // ones whose results matter a real in-memory implementation.
  for (const key of Object.keys(win)) {
    if (key.startsWith('_fb') && typeof win[key] === 'function') {
      win[key] = async () => null;
    }
  }
  const unsub = () => {};
  Object.assign(win, {
    _fbLoadModeFlags: async () => {},
    _useFirestoreForBook: () => true,
    _useFirestoreGlobal: () => true,
    _fbLoadCatalog: async () => JSON.parse(JSON.stringify(cloud.catalog)),
    _fbSaveCatalog: async (cat) => { cloud.catalog = JSON.parse(JSON.stringify(cat)); },
    _fbLoadSettings: async (key) => cloud.settings[key] ?? null,
    _fbSaveSettings: async (key, data) => { cloud.settings[key] = data; },
    _fbLoad: async (bookId) => cloud.books[bookId] ?? null,
    _fbWatch: () => unsub,
    _fbWatchSubmissions: () => unsub,
    _fbWatchEmailInbox: () => unsub,
    _fbOnAuthStateChanged: () => unsub,
    _fbLogClientError: async (entry) => { cloud.errorReports.push(entry); },
    _fbSave: async (bookId, json) => {
      cloud.saves.push({ bookId, json, state: JSON.parse(json) });
      return cloud.saveImpl(bookId, json);
    },
  });
}

/** Run the app's real startup by answering its auth subscription as the publisher. */
export async function signInAsPublisher() {
  await signInAs({ email: PUBLISHER_EMAIL, uid: 'publisher', emailVerified: true });
}

/** Run the app's real startup signed in as `user` (an artist's account, say). */
export async function signInAs(user) {
  const authCallbacks = globalThis.__firebaseStub?.authCallbacks || [];
  if (!authCallbacks.length) throw new Error('fake-cloud: main.js never subscribed to auth state');
  await authCallbacks[authCallbacks.length - 1](user);
}
