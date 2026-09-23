/**
 * Boot the REAL app (src/main.js + src/firebase.js) inside a test, with an
 * in-memory fake cloud standing in for Firebase.
 *
 * Why this exists: most suites used to read main.js as text and grep it,
 * because main.js couldn't be imported. It can now, so a test can press the
 * same buttons the screen does and check the resulting numbers.
 *
 * ── How it works ─────────────────────────────────────────────────────────
 *  1. vite.config.js's `test.alias` swaps every Firebase SDK module on the
 *     gstatic CDN (any version) and `virtual:pwa-register` for inert stubs in
 *     tests/helpers/stubs/. src/firebase.js still runs for real on top of them.
 *  2. The <body> markup of index.html is put into the document before import,
 *     since main.js looks up its elements by id at import time and at boot.
 *  3. After import, every window._fb* function src/firebase.js defined is
 *     replaced with a fake backed by `cloud` (below) — nothing leaves the
 *     process. `fetch` is stubbed to reject, like a device with no network.
 *  4. The stubbed onAuthStateChanged captured the app's sign-in callback; the
 *     harness calls it with the publisher's account, which runs the real boot
 *     (catalog load → loadAllBooks) against the fake cloud.
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *   // One boot per test file: main.js is a module singleton, so import once
 *   // in beforeAll and reset the book(s) you touch in beforeEach.
 *   let app;
 *   beforeAll(async () => {
 *     app = await loadApp({ books: [makeBook({ id: 'bk', listPrice: 40 })] });
 *   }, 30000);
 *   beforeEach(() => app.resetBook('bk', { hist: [], revenue: 0 }));
 *
 *   it('sells two copies at the register', async () => {
 *     app.window.posSetCurrency('CAD');
 *     app.window.posUpdateQty('bk', 2);        // what the + button calls
 *     app.window.posCheckout();                // "Complete sale"
 *     await app.window.posConfirmSale();       // "Confirm" in the dialog
 *     await app.settle();                      // the save isn't awaited
 *     expect(app.main.states.bk.revenue).toBe(80);
 *     expect(app.cloud.lastSave('bk').state.hist[0].qty).toBe(2);
 *   });
 *
 *   See tests/sale-recording-behaviour.test.js, artist-payout-behaviour and
 *   save-state-behaviour for worked examples. Put the tests for one screen in
 *   one file: each file pays for one import of main.js (a few seconds).
 *
 *   The harness always signs in as the publisher; author-only behaviour
 *   (IS_AUTHOR_MODE) isn't reachable through it yet.
 *
 * What you get back:
 *   main      – the live module namespace of src/main.js (`states`, `BOOKS`,
 *               `saveState`, … as exported). Exported `let` bindings are live.
 *   window    – the app's global handlers (window.saveArtistPayout, …) — the
 *               functions the screen's onclick/oninput attributes call.
 *   cloud     – the fake backend. `cloud.saves` is every _fbSave call as
 *               { bookId, json, state } (state parsed from the JSON sent);
 *               `cloud.savesFor(id)` / `cloud.lastSave(id)` filter it;
 *               `cloud.books[id]` is the JSON _fbLoad will hand back;
 *               `cloud.saveImpl(bookId, json)` decides what _fbSave answers —
 *               reassign it to return { ok:false }, a merge result, or throw.
 *               `cloud.errorReports` collects what reportClientError sent.
 *   await resetBook(id, partialState) – back online, empty offline queue,
 *               default cloud; installs `partialState` over the app's own
 *               defaultState and saves it once as the synced baseline, then
 *               clears the save log. Resets per test; the module stays loaded.
 *   setOnline(bool) – flip navigator.onLine and fire the matching event.
 *   queued()  – the app's persisted offline queue ([{ bookId, state, ts }]).
 *   answerConfirm(ok) – click OK/Cancel on the app's confirm dialog.
 *   toast()   – the text of the last toast the user saw.
 *   logs      – captured console output (see `quiet`).
 *   settle()  – let pending promise chains and zero-delay timers run.
 *
 * Keep test books' ids and titles free of the word "test": the app treats
 * those as sandbox books and leaves them out of several totals.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

export const PUBLISHER_EMAIL = 'lyricalmyricalbooks@gmail.com';

// The app merges these built-in titles into any catalog that doesn't list
// them as deleted. Deleting them keeps each suite's catalog to its own books.
const DEFAULT_BOOK_IDS = ['altrove', 'hound', 'archaeology', 'sistema', 'nobody', 'collective'];

/** A catalog entry with every field the screens read, overridable per test. */
export function makeBook(overrides = {}) {
  const id = overrides.id || 'harbour';
  return {
    id,
    title: 'Harbour Lights',
    author: 'Ada Example',
    isbn: '—',
    maxPrint: 100,
    listPrice: 40,
    currency: 'CA$',
    threshold: 5,
    productionCost: 0,
    accent: '#3a7cc8',
    accentBg: 'rgba(58,124,200,.1)',
    urlParam: id,
    ...overrides,
  };
}

let bodyMarkup = null;
function indexBody() {
  if (bodyMarkup === null) {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const start = html.indexOf('>', html.indexOf('<body')) + 1;
    // Drop the module <script> that would load main.js a second time.
    const end = html.lastIndexOf('<script type="module"');
    bodyMarkup = html.slice(start, end === -1 ? html.lastIndexOf('</body>') : end);
  }
  return bodyMarkup;
}

const settle = async (rounds = 5) => {
  for (let i = 0; i < rounds; i++) await new Promise(r => setTimeout(r, 0));
};

/**
 * @param {object} opts
 * @param {object[]} opts.books   catalog entries (see makeBook)
 * @param {object}  [opts.states] initial cloud state per book id (partial;
 *                                the app fills the rest from defaultState)
 * @param {boolean} [opts.quiet]  capture the app's console output into
 *                                `app.logs` instead of printing it (default)
 */
export async function loadApp({ books = [makeBook()], states: initialStates = {}, quiet = true } = {}) {
  // The app narrates freely to the console (failed FX lookups with no network,
  // retries, …). That's expected under test and buries a real failure, so by
  // default it is captured into `app.logs` instead of printed.
  const logs = [];
  if (quiet) {
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
      vi.spyOn(console, level).mockImplementation((...args) => { logs.push({ level, args }); });
    }
  }
  document.body.innerHTML = indexBody();
  try {
    localStorage.clear();
    // Opening the app once a day downloads a JSON backup; mark today's as
    // done so boot doesn't try to save a file.
    localStorage.setItem('lm-last-backup-ts', String(Date.now()));
  } catch { /* storage unavailable */ }

  // A device with no network: anything the app fetches (FX rates, Big Cartel,
  // Sheets, …) fails the way it would offline, and nothing escapes the test.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network disabled in tests'))));
  // jsdom has no layout; a couple of code paths scroll or open a window.
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('open', vi.fn(() => null));
  URL.createObjectURL = () => 'blob:stub';
  URL.revokeObjectURL = () => {};
  if (typeof window.matchMedia !== 'function') {
    vi.stubGlobal('matchMedia', (query) => ({
      matches: false, media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
      dispatchEvent: () => false,
    }));
  }

  let online = true;
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });

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
  const defaultSaveImpl = (bookId, json) => { cloud.books[bookId] = json; return { ok: true }; };
  cloud.saveImpl = defaultSaveImpl;
  for (const [id, st] of Object.entries(initialStates)) cloud.books[id] = JSON.stringify(st);

  const main = await import('../../src/main.js');

  // Replace every Firebase-backed global with a harmless async no-op first, so
  // an unanticipated call can't reach the SDK stubs and throw; then give the
  // ones whose results matter a real in-memory implementation.
  for (const key of Object.keys(window)) {
    if (key.startsWith('_fb') && typeof window[key] === 'function') {
      window[key] = async () => null;
    }
  }
  const unsub = () => {};
  Object.assign(window, {
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

  // Sign in as the publisher: runs the real startup path against the fakes.
  const authCallbacks = globalThis.__firebaseStub.authCallbacks;
  if (!authCallbacks.length) throw new Error('load-app: main.js never subscribed to auth state');
  await authCallbacks[authCallbacks.length - 1]({ email: PUBLISHER_EMAIL, uid: 'publisher' });
  await vi.waitFor(() => {
    for (const b of books) if (!main.states[b.id]) throw new Error(`book ${b.id} not loaded yet`);
  }, { timeout: 10000, interval: 10 });
  await settle(10);
  // Boot writes nothing a suite should have to account for.
  cloud.saves.length = 0;

  const app = {
    main,
    window,
    cloud,
    logs,
    settle,
    setOnline(value) {
      online = !!value;
      window.dispatchEvent(new Event(online ? 'online' : 'offline'));
    },
    /**
     * Answer the app's styled confirm dialog the way a person would, by
     * clicking its button. Start the action first, then call this:
     *   const done = window.deleteArtistPayout('bk', id);
     *   await app.answerConfirm(true); await done;
     */
    async answerConfirm(ok = true) {
      await vi.waitFor(() => {
        const overlay = document.getElementById('m-confirm');
        if (!overlay || overlay.style.display !== 'flex') throw new Error('confirm dialog not open');
      }, { timeout: 2000, interval: 5 });
      document.getElementById(ok ? 'm-confirm-ok' : 'm-confirm-cancel').click();
      await settle();
    },
    /** The text of the app's toast, i.e. what the user was just told. */
    toast() {
      return document.getElementById('toast')?.textContent || '';
    },
    /** The app's persisted offline queue (what survives a reload). */
    queued() {
      try { return JSON.parse(localStorage.getItem('lm-sync-queue') || '[]'); } catch { return []; }
    },
    /**
     * Start a test from a known ledger: back online, the default cloud, an
     * empty offline queue, and `partial` (merged over the app's defaultState)
     * installed as the book's state and saved once as the synced baseline —
     * so the save log is empty and "nothing changed" really means nothing.
     * Returns the installed state object.
     */
    async resetBook(bookId, partial = {}) {
      const book = main.BOOKS[bookId];
      if (!book) throw new Error(`load-app: no book ${bookId}`);
      cloud.saveImpl = defaultSaveImpl;
      if (!online || app.queued().length) app.setOnline(true);
      await settle();
      if (app.queued().length) throw new Error('load-app: offline queue did not drain between tests');
      const s = { ...main.defaultState(book), ...JSON.parse(JSON.stringify(partial)) };
      main.states[bookId] = s;
      await main.saveState(bookId);
      cloud.saves.length = 0;
      // A toast left over from the previous test must not satisfy this one.
      const toast = document.getElementById('toast');
      if (toast) toast.textContent = '';
      return s;
    },
  };
  return app;
}
