// The "Website · Inventory" switcher — the rules both apps share.
//
// The shop's website admin and this inventory app are two separate apps on two
// addresses. The publisher moves between them all day (an order comes in on
// the website, its copies come off the shelf here), so each app carries a
// two-part switcher, and a deep link opens one website order on either side.
// The contract both apps follow is docs/website-link.md › "Switching between
// the apps".
//
// Everything here is pure and tested (tests/app-switch.test.js). The wiring —
// where the switcher sits, the count badge, the toasts — is
// src/features/app-switch.js.
import { escapeHtml } from './html.js';

/** The website's admin. Its pages are hash routes; one order is `#orders/<id>`. */
export const WEBSITE_ADMIN = 'https://lyricalmyrical-web-v2.web.app/admin';

/** Every address the website admin can be opened from (its own domain later). */
export const WEBSITE_ORIGINS = Object.freeze([
  'https://lyricalmyrical-web-v2.web.app',
  'https://lyricalmyrical-web-v2.firebaseapp.com',
  'https://lyricalmyricalbooks.com',
  'https://www.lyricalmyricalbooks.com',
]);

/** This app, as the website links to it. */
export const INVENTORY_ORIGIN = 'https://lyricalmyricalbooks.github.io';
export const INVENTORY_APP_URL = `${INVENTORY_ORIGIN}/lyrical-inventory/`;

/**
 * Tab names. A tab keeps its name for its whole life, so a second click finds
 * the tab the first one opened instead of opening another.
 */
export const WEBSITE_TAB_NAME = 'lm-website-admin';
export const INVENTORY_TAB_NAME = 'lm-inventory-app';

/** The hash a deep link into this app carries: `#website-order=<orderId>`. */
export const WEBSITE_ORDER_HASH_KEY = 'website-order';

/**
 * Website fulfilment states that mean the order has left the shop (or never
 * will): an order in any other state is still "not sent yet".
 */
export const SENT_OR_CLOSED_STATES = Object.freeze(new Set([
  'shipped', 'out_for_delivery', 'delivered', 'collected', 'completed', 'cancelled', 'ready_for_pickup',
]));

const clean = (value) => String(value ?? '').trim();

// A website order id is letters, digits and a few joiners ("ABCD-123456-WXYZ",
// or 24 hex digits for a manual-payment order). Anything else in a link is not
// one of ours, so it opens nothing.
const ORDER_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,199}$/;

/**
 * The website admin's address for a page whose referrer is `referrer`: when
 * this app was opened from the website, the website's own origin (so a tab on
 * the shop's own domain later isn't reloaded through the forward), else the
 * web.app default.
 */
export function websiteAdminFor(referrer) {
  const origin = originOf(referrer);
  return WEBSITE_ORIGINS.includes(origin) ? `${origin}/admin` : WEBSITE_ADMIN;
}

// The address this page sends the publisher to, captured once at load
// (a document's referrer never changes): see useWebsiteFrom.
let _admin = WEBSITE_ADMIN;

/** Capture the website address from this page's referrer. */
export function useWebsiteFrom(referrer) {
  _admin = websiteAdminFor(referrer);
  return _admin;
}

/** The website admin's address for this page. */
export function websiteAdmin() {
  return _admin;
}

/** The website admin opened on one order. */
export function websiteOrderUrl(orderId, base = _admin) {
  const id = clean(orderId);
  if (!id) return base;
  return `${base}#orders/${encodeURIComponent(id)}`;
}

/**
 * The query string without a leftover `mode=admin` (the old public/admin/ page
 * forwards to `../?mode=admin`; nothing reads it any more). Returns the new
 * search string ("" or "?…"), or null when there was nothing to remove, so a
 * deep link from the website stays a plain #fragment change, never a reload.
 */
export function searchWithoutAdminMode(search) {
  let params;
  try { params = new URLSearchParams(String(search || '')); } catch (_) { return null; }
  if (!params.getAll('mode').includes('admin')) return null;
  const kept = params.getAll('mode').filter((m) => m !== 'admin');
  params.delete('mode');
  kept.forEach((m) => params.append('mode', m));
  const q = params.toString();
  return q ? `?${q}` : '';
}

/** This app opened on one website order (what the website's links point at). */
export function inventoryOrderUrl(orderId) {
  const id = clean(orderId);
  if (!id) return INVENTORY_APP_URL;
  return `${INVENTORY_APP_URL}#${WEBSITE_ORDER_HASH_KEY}=${encodeURIComponent(id)}`;
}

/**
 * The website order a hash names, or null. Accepts the hash with or without
 * its leading "#"; anything that isn't exactly `website-order=<id>` is null,
 * so the app's other links and an empty hash are left alone.
 */
export function parseWebsiteOrderHash(hash) {
  const raw = clean(hash).replace(/^#/, '');
  const prefix = `${WEBSITE_ORDER_HASH_KEY}=`;
  if (!raw.startsWith(prefix)) return null;
  let id;
  try { id = decodeURIComponent(raw.slice(prefix.length)); } catch (_) { return null; }
  id = clean(id);
  if (!ORDER_ID.test(id) || id === '.' || id === '..') return null;
  return id;
}

/** The origin of an address ('' when it has none, like an Android app referrer). */
export function originOf(url) {
  try {
    const origin = new URL(String(url || '')).origin;
    return origin && origin !== 'null' ? origin : '';
  } catch (_) { return ''; }
}

/**
 * True when this page runs as an installed app rather than a browser tab: a
 * home-screen app (display-mode standalone, or iPhone's navigator.standalone)
 * or the Android app (a Trusted Web Activity, which opens the page with an
 * android-app:// referrer). `twaSeen` is a remembered earlier sighting, since
 * the referrer is only there on the page the Android app first opened.
 *
 * An installed app must not open the other app with window.open: a plain link
 * lets Android hand it to the other installed app (or a browser) and lets an
 * iPhone show it over the app with a Done button.
 */
export function isStandalone({ matchMedia = null, navigator = null, referrer = '', twaSeen = false } = {}) {
  if (twaSeen) return true;
  if (String(referrer || '').startsWith('android-app://')) return true;
  if (navigator && navigator.standalone === true) return true;
  if (typeof matchMedia === 'function') {
    try {
      if (matchMedia('(display-mode: standalone)').matches) return true;
      if (matchMedia('(display-mode: fullscreen)').matches) return true;
    } catch (_) { /* old browser: a tab */ }
  }
  return false;
}

/** The tab this page opened, kept for the page's life (see openOtherApp). */
const _memory = { win: null };

function usable(w) {
  try { return !!w && !w.closed; } catch (_) { return false; }
}

function goTo(w, url, deep) {
  // A deep link changes only the #fragment, so the other app keeps its place
  // and reacts to the hash; a plain switch leaves it where it is.
  if (deep) w.location.href = url;
  try { w.focus(); } catch (_) { /* the browser decides */ }
}

/**
 * Open the other app from inside a click handler, reusing its tab.
 *
 * Returns how it was done:
 *  - 'remembered' a tab this page opened before is still open: it is brought
 *                 forward (and sent to the deep link) — no new tab.
 *  - 'named'      the other app is already open in its named tab — including
 *                 the tab that opened this one, since each app names its own
 *                 tab: same.
 *  - 'opened'     a new tab was opened on `url`.
 *  - 'link'       nothing was done here; let the link open by itself (an
 *                 installed app, or a blocked pop-up). The caller must NOT
 *                 cancel the click then.
 *
 * Never window.opener.focus(): browsers ignore a page raising its opener, so a
 * deep link would change a hidden tab's address and nothing would seem to
 * happen. The opener link is always kept (never noopener): it keeps both tabs
 * in the same browser group, which is where the name lookup searches.
 */
export function openOtherApp({
  url,
  deep = false,
  win = globalThis.window,
  name = WEBSITE_TAB_NAME,
  standalone = false,
  memory = _memory,
} = {}) {
  if (!url || !win || standalone) return 'link';

  // 1. A tab this page opened earlier.
  if (usable(memory.win)) {
    try {
      goTo(memory.win, url, deep);
      return 'remembered';
    } catch (_) { memory.win = null; }
  }

  // 2. The other app's named tab (which finds the tab that opened us too), or a new one.
  let w = null;
  try { w = win.open('', name); } catch (_) { w = null; }
  if (!w) return 'link';
  let fresh = false;
  let readable = false;
  try {
    const href = String(w.location.href);
    readable = true;
    fresh = href === 'about:blank' || href === '';
  } catch (_) { /* another origin: the other app is already open there */ }
  try {
    if (fresh) w.location.replace(url);
    else if (deep || readable) w.location.href = url;
  } catch (_) { /* the browser refused: the tab still comes forward */ }
  try { w.focus(); } catch (_) { /* the browser decides */ }
  memory.win = w;
  return fresh ? 'opened' : 'named';
}

/** For tests: forget the remembered tab. */
export function forgetOtherApp(memory = _memory) {
  memory.win = null;
}

function stateOfDoc(d) {
  const web = d && d.web && typeof d.web === 'object' ? d.web : null;
  if (!web) return null;
  const ff = web.fulfillment && typeof web.fulfillment === 'object' ? web.fulfillment : {};
  return {
    test: web.test === true,
    pay: clean(web.paymentStatus),
    status: clean(ff.status),
  };
}

function stateOfRow(r) {
  // A row brought in before the website sent its fulfilment state says
  // nothing either way, so it isn't counted (never a made-up figure).
  if (!r || !clean(r.webOrderId) || !('webFulfillmentStatus' in r) || !('webPaymentStatus' in r)) return null;
  return { test: false, pay: clean(r.webPaymentStatus), status: clean(r.webFulfillmentStatus), at: clean(r.webSourceUpdatedAt) };
}

/**
 * How many website orders are paid and not sent yet.
 *
 * `docs` are the websiteOrders documents the app is watching (the ones still
 * waiting for it, `{ id, web }`); `rows` are the sale rows website orders
 * became (`webOrderId` set) — an order the app already brought in is no longer
 * watched, so its rows carry the website's latest state. A watched document is
 * newer than any row, so it wins; between rows, the newest push wins.
 *
 * Counted: paid, not a rehearsal, and in no state in SENT_OR_CLOSED_STATES.
 */
export function countWebsiteOrdersNotSent({ docs = [], rows = [] } = {}) {
  const byOrder = new Map();
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    const s = stateOfRow(r);
    if (!s) return;
    const id = clean(r.webOrderId);
    const had = byOrder.get(id);
    if (!had || (s.at && s.at > (had.at || ''))) byOrder.set(id, s);
  });
  (Array.isArray(docs) ? docs : []).forEach((d) => {
    const s = stateOfDoc(d);
    const id = clean((d && d.id) || (d && d.web && d.web.orderId));
    if (s && id) byOrder.set(id, s);
  });
  let n = 0;
  byOrder.forEach((s) => {
    if (!s.test && s.pay === 'paid' && !SENT_OR_CLOSED_STATES.has(s.status)) n++;
  });
  return n;
}

/** What the badge and the link say for a count (null = no badge). */
export function notSentWords(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return null;
  const whole = Math.floor(n);
  return {
    badge: whole > 99 ? '99+' : String(whole),
    words: `${whole} website order${whole === 1 ? '' : 's'} not sent yet`,
  };
}

/**
 * The quiet "Open on the website ↗" link for one website order. The click is
 * handled by the app (src/features/app-switch.js) so it reuses the website's
 * tab; the href keeps long-press and middle-click working.
 */
export function openOnWebsiteHtml(orderId, { label = 'Open on the website' } = {}) {
  const id = clean(orderId);
  if (!id) return '';
  return `<a class="open-on-website" href="${escapeHtml(websiteOrderUrl(id))}" target="${WEBSITE_TAB_NAME}" data-open-website="${escapeHtml(id)}">${escapeHtml(label)} <span aria-hidden="true">↗</span></a>`;
}
