// The Test Profile: a whole second copy of the app that cannot touch the real one.
//
// It used to be a book called "Test" inside the real catalogue. Its sales were
// saved to the real cloud next to the real books, and every feature that sends
// something out (the Google Sheet, emails, Stripe, labels, Big Cartel, the
// Tax Centre) had to remember to skip it — some forty separate checks, each one
// a place a test sale could leak into real figures the day someone forgot.
//
// Now the isolation sits underneath all of that, at the three ways data can
// leave a page:
//   1. Saved data. Every cloud read and write (the `window._fb*` functions
//      firebase.js defines) is swapped for a copy kept on this device only, so
//      the real catalogue is never read and nothing is ever written to it.
//   2. Device storage. localStorage is swapped for a namespaced copy, so the
//      real offline queue, the saved Sheet / email addresses and every cached
//      setting stay out of reach, and nothing written here lands on top of them.
//   3. The network. fetch, XMLHttpRequest and sendBeacon refuse every address
//      that is not the app itself, sign-in, fonts/libraries or public exchange
//      rates. A refused call fails the way a dropped connection does, which
//      every integration already handles.
//
// The profile is entered and left with a reload, so no real data is ever in
// memory at the same time as test data. The flag lives in sessionStorage:
// closing the tab (or the phone app) always comes back to the real books.

export const TEST_PROFILE_FLAG = 'lm-test-profile';
export const TEST_STORAGE_PREFIX = 'lm-test:';
const SEEDED_KEY = 'lm-test-seeded';

// Device preferences the test copy may read from the real device storage, so
// opening it doesn't flip night mode back to day. Read-only: a change made in
// the test copy stays in the test copy.
const READ_THROUGH_KEYS = new Set(['lm-theme']);

function realSession(target = globalThis) {
  try { return target.sessionStorage || null; } catch (_) { return null; }
}

export function isTestProfileActive(session = realSession()) {
  try { return !!session && session.getItem(TEST_PROFILE_FLAG) === '1'; } catch (_) { return false; }
}

// ─────────────────────────────────────────────
// Device storage
// ─────────────────────────────────────────────

/**
 * A Storage look-alike that keeps every key under `prefix` in `real`.
 * Supports the Storage methods the app uses; `Object.keys()` on it lists the
 * test copy's own keys.
 */
export function createNamespacedStorage(real, prefix = TEST_STORAGE_PREFIX, readThrough = READ_THROUGH_KEYS) {
  const ownKeys = () => {
    const out = [];
    for (let i = 0; i < real.length; i++) {
      const k = real.key(i);
      if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length));
    }
    return out;
  };
  const api = {
    getItem(key) {
      const k = String(key);
      const v = real.getItem(prefix + k);
      if (v === null && readThrough.has(k)) return real.getItem(k);
      return v;
    },
    setItem(key, value) { real.setItem(prefix + String(key), String(value)); },
    removeItem(key) { real.removeItem(prefix + String(key)); },
    clear() { ownKeys().forEach(k => real.removeItem(prefix + k)); },
    key(i) { return ownKeys()[i] ?? null; },
    get length() { return ownKeys().length; },
  };
  return new Proxy(api, {
    get(t, p) { return p in t ? t[p] : (typeof p === 'string' ? (t.getItem(p) ?? undefined) : undefined); },
    set(t, p, v) { if (p in t) return false; t.setItem(p, v); return true; },
    has(t, p) { return p in t || (typeof p === 'string' && t.getItem(p) !== null); },
    deleteProperty(t, p) { t.removeItem(p); return true; },
    ownKeys() { return ownKeys(); },
    getOwnPropertyDescriptor(t, p) {
      if (typeof p !== 'string' || p in t) return undefined;
      const v = real.getItem(prefix + p);
      return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true };
    },
  });
}

/** Wipe everything the test copy has saved on this device. */
export function clearTestStorage(real, prefix = TEST_STORAGE_PREFIX) {
  const doomed = [];
  for (let i = 0; i < real.length; i++) {
    const k = real.key(i);
    if (k && k.startsWith(prefix)) doomed.push(k);
  }
  doomed.forEach(k => real.removeItem(k));
}

// ─────────────────────────────────────────────
// Network
// ─────────────────────────────────────────────

// Everything the test copy may reach. The app's own files, Google sign-in,
// code and fonts it loads, and two public exchange-rate feeds. Nothing on this
// list stores, sends or charges anything.
const ALLOWED_HOSTS = new Set([
  'www.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net',
  'fonts.googleapis.com', 'fonts.gstatic.com',
  'identitytoolkit.googleapis.com', 'securetoken.googleapis.com',
  'apis.google.com', 'accounts.google.com', 'lyricalmyrical-37c46.firebaseapp.com',
  'open.er-api.com', 'api.frankfurter.dev',
  'api.github.com',
]);

// What a refused address is, in the words the owner would use.
const FRIENDLY = [
  [/stripe\.com$/, 'Stripe'],
  [/goshippo\.com$/, 'Shippo'],
  [/canadapost/, 'Canada Post'],
  [/chitchats\.com$/, 'Chit Chats'],
  [/bigcartel\.com$/, 'Big Cartel'],
  [/zonos/, 'Zonos'],
  [/script\.google(usercontent)?\.com$/, 'your Google Sheet and emails'],
  [/gmail\.googleapis\.com$|mail\.google\.com$/, 'Gmail'],
  [/generativelanguage\.googleapis\.com$|openrouter\.ai$/, 'the AI assistant'],
  [/firestore\.googleapis\.com$|firebaseio\.com$|firebasestorage/, 'the cloud'],
];

export function friendlyServiceName(host) {
  const h = String(host || '').toLowerCase();
  const hit = FRIENDLY.find(([re]) => re.test(h));
  return hit ? hit[1] : h;
}

/** The host a test-profile request would reach, or '' when it stays on the page. */
export function blockedHost(input, origin) {
  let url;
  try {
    const raw = typeof input === 'string' ? input : (input && (input.url || input.href)) || String(input);
    url = new URL(raw, origin);
  } catch (_) { return ''; }
  if (url.protocol === 'data:' || url.protocol === 'blob:') return '';
  if (url.origin === origin) return '';
  if (ALLOWED_HOSTS.has(url.hostname)) return '';
  return url.hostname || url.protocol;
}

/**
 * Refuse every request the test copy must not make. `onBlocked(host)` is told
 * about each one (the app shows a small note so a "send" that went nowhere
 * isn't a mystery).
 */
export function installNetworkGuard(target = globalThis, onBlocked = () => {}) {
  if (target.__testProfileGuard) return;
  target.__testProfileGuard = true;
  const origin = (target.location && target.location.origin) || 'https://invalid.example';
  const refuse = (host) => {
    try { onBlocked(host); } catch (_) { /* a note is never worth breaking a call over */ }
    return new TypeError(`Test Profile: nothing is sent to ${friendlyServiceName(host)}`);
  };

  if (typeof target.fetch === 'function') {
    const original = target.fetch.bind(target);
    target.fetch = function guardedFetch(input, init) {
      const host = blockedHost(input, origin);
      if (host) return Promise.reject(refuse(host));
      return original(input, init);
    };
  }

  const XHR = target.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const open = XHR.prototype.open;
    const send = XHR.prototype.send;
    XHR.prototype.open = function (method, url, ...rest) {
      this.__testBlockedHost = blockedHost(url, origin);
      return open.call(this, method, this.__testBlockedHost ? 'data:,' : url, ...rest);
    };
    XHR.prototype.send = function (...args) {
      if (this.__testBlockedHost) {
        refuse(this.__testBlockedHost);
        setTimeout(() => {
          try { this.dispatchEvent(new Event('error')); this.dispatchEvent(new Event('loadend')); } catch (_) { /* old engines */ }
        }, 0);
        return undefined;
      }
      return send.apply(this, args);
    };
  }

  const nav = target.navigator;
  if (nav && typeof nav.sendBeacon === 'function') {
    const beacon = nav.sendBeacon.bind(nav);
    try {
      nav.sendBeacon = (url, data) => {
        const host = blockedHost(url, origin);
        if (host) { refuse(host); return false; }
        return beacon(url, data);
      };
    } catch (_) { /* read-only in this browser; fetch and XHR are still guarded */ }
  }
}

// ─────────────────────────────────────────────
// Saved data
// ─────────────────────────────────────────────

export const SAMPLE_BOOK_ID = 'sample-garden';

// Deliberately NOT flagged as a test book (no isTest, no "test" title). Inside
// the Test Profile everything is test data already, so this book should behave
// exactly like a real one — show in the overview, the Tax Centre, invoices —
// which is the whole point of rehearsing here.
export const SAMPLE_BOOK = Object.freeze({
  id: SAMPLE_BOOK_ID,
  title: 'The Paper Garden',
  author: 'Sample Artist',
  isbn: '978-3-16-148410-0',
  maxPrint: 15,
  listPrice: 17,
  currency: '€',
  threshold: 5,
  productionCost: 300,
  paymentLink: 'https://paypal.me/sampleartist',
  authorPaymentLink: 'https://paypal.me/sampleartist',
  accent: '#6B4FE8', /* token-ok: a book's own accent is data, stored with the book */
  accentBg: 'rgba(107,79,232,.1)',
  urlParam: 'paper-garden',
  authorPassword: 'sample-password',
});

export function sampleCatalog() {
  return { [SAMPLE_BOOK_ID]: { ...SAMPLE_BOOK } };
}

const parse = (s) => { if (s == null) return null; try { return JSON.parse(s); } catch (_) { return null; } };

// Kept: signing in is real, so the test copy opens for the same account.
const AUTH_FUNCTIONS = new Set(['_fbSignInWithGoogle', '_fbSignOut', '_fbOnAuthStateChanged', '_fbGetIdToken']);

/**
 * The replacements for firebase.js's cloud functions, backed by `store`
 * (the namespaced device storage). Same return shapes as the real ones.
 */
export function createSandboxBackend(store) {
  const read = (k) => parse(store.getItem(k));
  const write = (k, v) => store.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  const bookKey = (id) => 'sbx:book:' + id;
  const settingKey = (k) => 'sbx:settings:' + k;
  const loadCatalog = async () => {
    let c = read('sbx:catalog');
    if (!c) { c = sampleCatalog(); write('sbx:catalog', c); }
    return c;
  };
  return {
    _fbLoadModeFlags: async () => {},
    _fbSaveModeFlags: async () => {},
    _useFirestoreForBook: () => true,
    _useFirestoreGlobal: () => true,
    _enableFirestoreGlobal: () => {},
    _disableFirestoreGlobal: () => {},
    _setBookFirestoreMode: () => {},
    _fbAdoptBook: async () => ({ decision: 'skip' }),
    _fbBaseFor: () => ({}),
    _fbLoadCatalog: loadCatalog,
    _fbPeekCachedCatalog: loadCatalog,
    _fbSaveCatalog: async (catalog) => { write('sbx:catalog', catalog); return true; },
    _fbSaveBookOwners: async () => {},
    _fbLoad: async (id) => store.getItem(bookKey(id)),
    _fbPeekCachedBook: async (id) => read(bookKey(id)),
    _fbSave: async (id, json) => { write(bookKey(id), json); return { ok: true, merged: false }; },
    _fbDeleteBook: async (id) => { store.removeItem(bookKey(id)); },
    _fbLoadSettings: async (key) => read(settingKey(key)),
    _fbPeekCachedSetting: async (key) => read(settingKey(key)),
    _fbSaveSettings: async (key, data) => { write(settingKey(key), data); return true; },
    _fbSaveBackupSnapshot: async (id, snap) => { write('sbx:backup:' + id, snap); },
    _fbLoadBackupSnapshot: async (id) => read('sbx:backup:' + id),
    _fbDeleteBackupSnapshot: async (id) => { store.removeItem('sbx:backup:' + id); },
    // A receipt picked in the Test Profile stays in this tab as a temporary
    // link, so attaching (and opening) several receipts can be tried without
    // anything reaching the real cloud. It is gone after a reload.
    _fbUploadReceipt: async (file) => {
      const URLs = globalThis.URL;
      if (!file || !URLs || typeof URLs.createObjectURL !== 'function') {
        throw new Error('Receipts are not uploaded from the Test Profile');
      }
      return URLs.createObjectURL(file);
    },
    _fbConnectReceiptGmail: async () => { throw new Error('Gmail is not connected in the Test Profile'); },
    _fbPublishWebsiteLink: async () => { throw new Error('The website is not updated from the Test Profile'); },
  };
}

/**
 * Swap every cloud function on `target` for its sandbox copy. Any `_fb*`
 * function this file doesn't know about yet is replaced with a harmless
 * stand-in rather than left pointing at the real cloud, so a new cloud call
 * added later is isolated by default instead of leaking by default.
 */
export function installSandboxBackend(target, store) {
  const backend = createSandboxBackend(store);
  Object.keys(target).forEach(name => {
    if (!name.startsWith('_fb') || AUTH_FUNCTIONS.has(name) || typeof target[name] !== 'function') return;
    if (backend[name]) return;
    target[name] = /^_fbWatch/.test(name) ? () => () => {} : async () => null;
  });
  Object.assign(target, backend);
  target._testProfileBackend = true;
}

export function isSampleDataSeeded(store) {
  try { return store.getItem(SEEDED_KEY) === '1'; } catch (_) { return false; }
}

export function markSampleDataSeeded(store) {
  try { store.setItem(SEEDED_KEY, '1'); } catch (_) { /* reseeds next time; harmless */ }
}
