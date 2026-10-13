// Website orders — the shop's website and this app, kept in step.
//
// The website writes each paid order into an inbox in this app's database
// (contract: docs/website-link.md). While the publisher has the app open and
// online, this module:
//
//   1. watches that inbox for orders marked `pending`,
//   2. turns each one into ordinary sale rows through the same ledger writes a
//      sale typed in by hand uses (writeOrderToLedger, the void helpers,
//      recomputeAfters, the Google Sheet sync) — so stock, earnings, Stock
//      After and the merge all treat it like any other sale,
//   3. links an order the owner already entered by hand instead of counting it
//      twice, and lists anything unclear under "Needs you",
//   4. after the books are saved, runs ONE transaction (src/firebase.js) that
//      re-reads the saved books, marks the orders done, publishes the stock
//      number the website follows, and sends back any label bought here.
//
// The rules themselves are pure and tested in src/lib/website-link.js; this
// file is the wiring and the "From your website" card on the Orders tab.
//
// Nothing here runs at import time (see tests/features-boundary.test.js).
import '../styles/website-link.css';
import { escapeHtml } from '../lib/html.js';
import { promptDialog } from '../lib/modal.js';
import { fmt, fmtD, getSym, normalizeCurrencyCode } from '../lib/money.js';
import { datedRateKey } from '../lib/sale-fx.js';
import { localDay } from '../lib/calendar-day.js';
import { bookCurrencyCode } from '../lib/currency-migration.js';
import { compareCopies, restoreRecords } from '../lib/storage-mode.js';
import { deriveOnHand } from '../lib/inventory.js';
import { confirmDialog } from '../lib/modal.js';
import {
  STRIPE_CHARGE_PI_KEY,
  WEBSITE_IMPORT_BATCH,
  appShipmentFor,
  describeWebShipment,
  hasAppTracking,
  linkedPostageFor,
  planWebsiteOrder,
  rowKey,
} from '../lib/website-link.js';
import {
  $,
  BOOKS,
  TAX_CENTER,
  _fxRateCache,
  fetchHistoricalRate,
  recomputeAfters,
  saveState,
  scheduleRender,
  showToast,
  states,
  syncHistRowToSheets,
  unvoidHistEntry,
  voidHistEntry,
  writeOrderToLedger,
} from '../main.js';

const SENT_KEY = 'lm-website-shipments-sent';
const SEEN_KEY = 'lm-website-link-seen';
const UNLINKED_KEY = 'lm-website-unlinked';
const DEVICE_KEY = 'lm-website-link-device';
const PUBLISH_DEBOUNCE_MS = 4000;
const RETRY_MS = 30000;
const RATE_LOOKUPS_PER_RUN = 10;

let _started = false;
let _wired = false;
let _docs = new Map();          // orderId → pending websiteOrders doc
let _ordersSeen = false;
let _docsFromCache = false;     // the last snapshot came from this device's cache
let _link = { website: null, app: null };
let _linkKnown = false;
let _watchError = '';
let _publishError = '';
let _running = false;
let _again = false;
let _importTimer = null;
let _publishTimer = null;
let _publishChain = null;
let _publishBooks = new Set();
let _publishAll = false;
let _decisions = {};            // orderId → { bookId: { choice, key } }
let _later = new Set();         // orderIds set aside this session
let _storage = null;            // the last storage check: { at, books: [...] }
let _storageRunning = false;
let _todoSig = '';              // what the To-do list was last told
let _review = [];               // plans that need a person
let _tests = [];                // rehearsal orders (dry run)
let _blockedBooks = new Set();
let _moreWaiting = 0;
let _waitingOnLoad = 0;
let _lastRun = null;            // { at, added, linked, updated }
let _refusedMarks = 0;          // orders the last publish couldn't mark done yet
let _lastFeedAt = '';
let _lastImportAt = '';
let _sent = null;               // orderId → shipment hash this device sent

// ── Small helpers ──────────────────────────────────────────────────────────

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value === 'object' ? value : fallback;
  } catch (_) { return fallback; }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage blocked: fine */ }
}

function sentMap() {
  if (!_sent) _sent = readJson(SENT_KEY, {});
  return _sent;
}

function online() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function linkAllowed() {
  if (!window.IS_PUBLISHER) return false;
  if (typeof window._fbWatchWebsiteOrders !== 'function') return false;
  return typeof window._useFirestoreGlobal !== 'function' || window._useFirestoreGlobal();
}

function build() {
  return typeof __GIT_COMMIT_DATE__ === 'string' ? __GIT_COMMIT_DATE__ : '';
}

function deviceLabel() {
  let id = '';
  try {
    id = localStorage.getItem(DEVICE_KEY) || '';
    if (!id) { id = Math.random().toString(36).slice(2, 8); localStorage.setItem(DEVICE_KEY, id); }
  } catch (_) { /* private mode */ }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const kind = /iPhone|iPad|Android|Mobile/i.test(ua) ? 'Phone' : /Mac/i.test(ua) ? 'Mac' : /Windows/i.test(ua) ? 'Windows' : 'Computer';
  return `${kind}${id ? ' ' + id : ''}`;
}

function titleOf(bookId) {
  return (BOOKS[bookId] && BOOKS[bookId].title) || bookId;
}

function copies(n) {
  return `${n} ${n === 1 ? 'copy' : 'copies'}`;
}

/** Milliseconds for an ISO string, a Firestore Timestamp or a number; NaN when none. */
function timeOf(value) {
  if (!value) return NaN;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return Date.parse(String(value));
}

/** "just now", "4 min ago", "3 hours ago", "2 days ago". */
function ago(when) {
  const t = timeOf(when);
  if (!Number.isFinite(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}

function canWriteBook(bookId) {
  return typeof window._useFirestoreForBook !== 'function' || window._useFirestoreForBook(bookId);
}

function bookLoaded(bookId) {
  return !!states[bookId] && !states[bookId]._loadFailed;
}

/** The website link has been seen working on this device (it then stays on). */
function websiteLinkActive() {
  try { return !!localStorage.getItem(SEEN_KEY); } catch (_) { return false; }
}

function noteLinkSeen() {
  try { if (!localStorage.getItem(SEEN_KEY)) localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch (_) { /* fine */ }
}

/**
 * Stripe charge → PaymentIntent, from this session's Stripe pull and the
 * device's memory, read once per planning pass rather than once per row.
 */
function chargeIntentLookup() {
  const map = { ...readJson(STRIPE_CHARGE_PI_KEY, {}) };
  (window._reconPayments || []).forEach(p => { if (p && p.id && p.piId) map[p.id] = p.piId; });
  return (chargeId) => map[chargeId] || '';
}

function cadRateFor(cur, day) {
  const rate = Number(_fxRateCache[datedRateKey(normalizeCurrencyCode(cur, ''), 'CAD', day)]);
  return rate > 0 ? rate : null;
}

function planContext() {
  const histByBook = {};
  Object.keys(BOOKS).forEach(id => { histByBook[id] = (states[id] && states[id].hist) || []; });
  return {
    histByBook,
    knowsBook: id => !!BOOKS[id],
    canWrite: canWriteBook,
    // The same code writeOrderToLedger stamps on the row, so a re-run never
    // "corrects" a currency it just wrote.
    bookCurrencyOf: id => bookCurrencyCode(BOOKS[id]),
    cadRateFor,
    piOfCharge: chargeIntentLookup(),
    consentAt: (_link.app && _link.app.importConsentAt) || '',
  };
}

/** Every website row in every book, grouped by order. Always read fresh. */
function websiteRowsByOrder() {
  const out = new Map();
  Object.entries(states).forEach(([bookId, s]) => (s && s.hist || []).forEach(h => {
    if (!h || !h.webOrderId) return;
    if (!out.has(h.webOrderId)) out.set(h.webOrderId, []);
    out.get(h.webOrderId).push({ ...h, _bookId: bookId });
  }));
  return out;
}

/** The rows of one website order, across every book. */
function rowsOfOrder(orderId) {
  const out = [];
  Object.values(states).forEach(s => (s && s.hist || []).forEach(h => { if (h && h.webOrderId === orderId) out.push(h); }));
  return out;
}

// ── Start, watch ───────────────────────────────────────────────────────────

/** Publisher only, once every book has loaded. Safe to call more than once. */
function startWebsiteLink() {
  if (_started || !linkAllowed()) return;
  _started = true;
  wireCard();
  try {
    window._fbWatchWebsiteOrders(onOrders, onWatchError);
  } catch (e) { onWatchError(e); }
  try {
    if (typeof window._fbWatchWebsiteLinkStatus === 'function') window._fbWatchWebsiteLinkStatus(onLinkStatus, onWatchError);
  } catch (e) { onWatchError(e); }
  window.addEventListener('online', () => { scheduleImport(0); scheduleWebsiteFeedPublish('all'); });
  scheduleWebsiteFeedPublish('all');
  renderWebsiteLinkCard();
  runStorageCheck();
}

function onWatchError(err) {
  const denied = err && (err.code === 'permission-denied' || err.code === 'PERMISSION_DENIED');
  _watchError = denied
    ? 'This app isn’t allowed to read the website’s orders yet. Publish the new database rules (see the setup steps), then reload.'
    : 'The connection to the website’s orders dropped. Reload the app once you’re back online.';
  renderWebsiteLinkCard();
}

function onOrders(docs, meta = {}) {
  _watchError = '';
  _ordersSeen = true;
  // A snapshot from this device's cache can be older than the books it has
  // since saved (a refund already brought in, say). It is shown, never applied:
  // the server's own snapshot follows and is the one imported.
  _docsFromCache = !!(meta && meta.fromCache);
  _docs = new Map((docs || []).filter(d => d && d.id).map(d => [d.id, d]));
  if (_docs.size) noteLinkSeen();
  noteUnlinked(docs || []);
  scheduleImport(0);
}

function onLinkStatus(status) {
  _link = { website: (status && status.website) || null, app: (status && status.app) || null };
  _linkKnown = true;
  if (_link.website) noteLinkSeen();
  scheduleImport(0);
  renderWebsiteLinkCard();
}

/** Copies the website sold of editions not linked to a book here, per order. */
function noteUnlinked(docs) {
  const map = readJson(UNLINKED_KEY, {});
  docs.forEach(d => {
    if (d.web && d.web.test === true) return; // a rehearsal sells nothing
    const list = Array.isArray(d.web && d.web.unlinked) ? d.web.unlinked : [];
    const qty = list.reduce((n, u) => n + (Math.floor(Number(u && u.qty)) || 0), 0);
    if (qty > 0) map[d.id] = { qty, titles: list.map(u => String((u && u.title) || '')).filter(Boolean).slice(0, 3) };
    else delete map[d.id];
  });
  writeJson(UNLINKED_KEY, map);
}

function scheduleImport(delay = 300) {
  if (!_started) return;
  clearTimeout(_importTimer);
  _importTimer = setTimeout(() => { runWebsiteImport(); }, delay);
}

// ── Import ─────────────────────────────────────────────────────────────────

async function runWebsiteImport() {
  if (!_started) return;
  if (_running) { _again = true; return; }
  if (!online() || !Object.keys(BOOKS).every(id => states[id])) { renderWebsiteLinkCard(); return; }
  _running = true;
  renderWebsiteLinkCard();
  try {
    do {
      _again = false;
      await importOnce();
    } while (_again && online());
  } catch (e) {
    console.error('[website link] import failed', e);
    _publishError = 'Something went wrong bringing in website orders. It tries again by itself; reload if it keeps happening.';
  } finally {
    _running = false;
    renderWebsiteLinkCard();
  }
}

async function prefetchRates(docs) {
  const wanted = new Map();
  docs.forEach(d => {
    const web = d.web || {};
    const day = String(web.paidDay || '').slice(0, 10);
    Object.keys(web.books || {}).forEach(id => {
      if (!BOOKS[id]) return;
      const cur = bookCurrencyCode(BOOKS[id]);
      if (cur !== 'CAD' && day && !cadRateFor(cur, day)) wanted.set(`${cur}@${day}`, { cur, day });
    });
  });
  for (const { cur, day } of [...wanted.values()].slice(0, RATE_LOOKUPS_PER_RUN)) {
    try { await fetchHistoricalRate(cur, 'CAD', day); } catch (_) { /* reported as "needs a rate" */ }
  }
}

function byPaidAt(a, b) {
  const x = String((a.web && (a.web.paidAt || a.web.paidDay)) || '');
  const y = String((b.web && (b.web.paidAt || b.web.paidDay)) || '');
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Real (not rehearsal) pending orders not yet brought in at their current version, with their books. */
function heldOrders() {
  return [..._docs.values()]
    .filter(d => d && d.web && d.web.test !== true)
    .filter(d => !(d.imported && d.imported.hash && d.imported.hash === d.web.hash))
    .map(d => ({ orderId: d.id, books: Object.keys(d.web.books || {}) }));
}

async function importOnce() {
  // Website orders come in by themselves. The first time, record when the link
  // was switched on: rowPatch keeps tracking already on a hand-entered sale from
  // before that day as the sale's own, never sent to the website as a label.
  if (_linkKnown && !(_link.app && _link.app.importConsentAt)) await markLinkSwitchedOn();
  const all = [..._docs.values()].filter(d => d && d.web);
  const ctx0 = planContext();
  _tests = all.filter(d => d.web.test === true).map(doc => planWebsiteOrder(doc, ctx0));

  const real = all.filter(d => d.web.test !== true).sort(byPaidAt);
  // A book that failed to load is not its real data: leave its orders waiting.
  const waiting = real.filter(d => Object.keys(d.web.books || {}).some(id => BOOKS[id] && !bookLoaded(id)));
  _waitingOnLoad = waiting.length;
  const candidates = real.filter(d => !waiting.includes(d));

  await prefetchRates(candidates);
  // Plan and apply in the same tick from here on: no await may sit between
  // reading the books and writing them. Every pending order is planned, so
  // orders waiting for a decision never hold back new ones; at most
  // WEBSITE_IMPORT_BATCH ready ones are applied per run.
  const ctx = planContext();
  // Choices made before (kept on the order as imported.decisions) still hold
  // when the website pushes the order again — a refund, a dispatch — so the
  // owner is never asked the same question twice.
  const plans = candidates.map(doc => planWebsiteOrder(doc, {
    ...ctx,
    decisions: { ...((doc.imported && doc.imported.decisions) || {}), ...(_decisions[doc.id] || {}) },
  }));
  _review = plans.filter(p => p.status === 'review');
  _blockedBooks = new Set([...plans.filter(p => p.status === 'blocked').flatMap(p => p.blocked)]);
  const ready = plans.filter(p => p.status === 'ready');
  const go = ready.slice(0, WEBSITE_IMPORT_BATCH);
  _moreWaiting = ready.length - go.length;

  noteTodo();
  if (!_linkKnown) return; // wait for the link's own status (it holds the day the link was switched on)
  // A cached snapshot can be behind this device's own saved rows: wait for the server's.
  if (_docsFromCache || !go.length) return;

  const touched = new Set();
  const counts = { added: 0, linked: 0, updated: 0 };
  const marks = [];
  go.forEach(plan => {
    plan.actions.forEach(action => {
      const result = applyAction(action, plan);
      if (result) { touched.add(action.bookId); counts[result]++; }
    });
    marks.push({ orderId: plan.orderId, hash: plan.hash, effect: plan.effect, decisions: plan.decisions || {}, replyAt: plan.replyAt });
  });
  go.forEach(plan => { delete _decisions[plan.orderId]; });

  if (touched.size) {
    scheduleRender();
    await Promise.all([...touched].map(id => saveState(id)));
  }
  const res = await publishWebsiteLinkNow({ marks, books: [...touched] });
  if (counts.added || counts.linked || counts.updated) {
    _lastRun = { at: new Date().toISOString(), ...counts };
    const parts = [];
    if (counts.added) parts.push(`${counts.added} website sale${counts.added === 1 ? '' : 's'} added`);
    if (counts.linked) parts.push(`${counts.linked} you’d already entered now linked`);
    if (counts.updated) parts.push(`${counts.updated} updated from the website`);
    showToast(`🛍 ${parts.join(' · ')}`, 'ok', 4500);
  }
  _refusedMarks = res && Array.isArray(res.refused) ? res.refused.filter(r => r.reason !== 'changed').length : 0;
  if (res && Array.isArray(res.refused) && res.refused.some(r => r.reason === 'not-saved' || r.reason === 'book-unavailable')) {
    scheduleImport(RETRY_MS);
  }
  // The rest come in on the next run: marking these done changes the inbox,
  // and that snapshot starts it.
}

/** Apply one planned change to the books. Returns what it counted as, or ''. */
function applyAction(action, plan) {
  const s = states[action.bookId];
  const book = BOOKS[action.bookId];
  if (!s || !book || !Array.isArray(s.hist)) return '';
  if (action.kind === 'new') {
    // A second device or a re-run must never add the same order twice.
    if (s.hist.some(h => h && (h.uid === action.row.uid || h.webOrderId === plan.orderId))) return '';
    addWebsiteRow(action.bookId, action.row);
    return 'added';
  }
  if (action.kind === 'replace') {
    const h = s.hist.find(r => rowKey(r) === action.key);
    if (!h || h.voided) return '';
    h.webReplacedBy = action.replacedBy;
    voidHistEntry(s, book, h);
    h.voidedReason = 'Same sale as a website order — the website’s copy replaces it';
    return 'linked';
  }
  if (!action.patch) return '';
  const h = action.kind === 'own'
    ? s.hist.find(r => r && (r.uid === action.uid || r.webOrderId === plan.orderId))
    : s.hist.find(r => rowKey(r) === action.key);
  if (!h) return '';
  applyRowPatch(s, book, h, action.patch);
  return action.kind === 'adopt' ? 'linked' : 'updated';
}

function addWebsiteRow(bookId, row) {
  const s = states[bookId];
  const book = BOOKS[bookId];
  if (row.voided) {
    // Refunded with every copy back before it was ever brought in: kept as a
    // record, moves nothing, never sent to the sheet.
    s.hist.unshift({ recordedAt: new Date().toISOString(), enteredBy: 'Website', voidedAt: Date.now(), ...row, voidedReason: 'Refunded on the website' });
    recomputeAfters(s, book);
    return;
  }
  const { num, chan, qty, price, notes, payment, date, sheetsId, ...extra } = row;
  writeOrderToLedger(bookId, { num, chan, qty, price, notes, payment: payment || null, enteredBy: 'Website', date, sheetsId, extra });
  const saved = s.hist.find(h => h && h.uid === row.uid);
  // The order row went to the sheet with the sale; its shipping row too.
  if (saved && (Number(saved.shippingPaid) || 0) > 0) syncHistRowToSheets(saved, book, { order: false });
}

function applyRowPatch(s, book, h, patch) {
  const { voided, ...rest } = patch;
  if (voided === true && !h.voided) {
    // Void with the copies it had, so the reversal matches what was taken off.
    voidHistEntry(s, book, h);
    Object.assign(h, rest, { voidedReason: 'Refunded on the website' });
    recomputeAfters(s, book);
    return;
  }
  if (voided === false && h.voided) {
    // A refund the bank rejected: the sale counts again, at the website's numbers.
    Object.assign(h, rest);
    unvoidHistEntry(s, book, h);
    return;
  }
  if (!h.voided && Object.prototype.hasOwnProperty.call(rest, 'qty')) {
    // Only matters for a book with no print run, whose on-hand is a running count.
    const delta = (Number(rest.qty) || 0) - (Number(h.qty) || 0);
    s.stock = Math.max(0, (Number(s.stock) || 0) - delta);
  }
  Object.assign(h, rest);
  recomputeAfters(s, book);
  if (!h.voided) syncHistRowToSheets(h, book);
}

// ── Publish ────────────────────────────────────────────────────────────────

/**
 * Queue a stock-feed publish for one book ('all' for every book). Debounced:
 * a burst of saves sends one transaction.
 */
function scheduleWebsiteFeedPublish(bookId) {
  if (bookId === 'all') _publishAll = true;
  else if (bookId) _publishBooks.add(String(bookId));
  if (!_started) return;
  clearTimeout(_publishTimer);
  _publishTimer = setTimeout(() => { publishWebsiteLinkNow(); }, PUBLISH_DEBOUNCE_MS);
}

/** Orders whose label (bought or linked here) the website hasn't answered yet. */
function shipmentCandidates() {
  const expenses = (TAX_CENTER && TAX_CENTER.businessExpenses) || [];
  const sent = sentMap();
  const out = [];
  for (const [orderId, rows] of websiteRowsByOrder()) {
    if (!rows.some(r => !r.voided && hasAppTracking(r))) continue;
    const linkedPostage = linkedPostageFor(rows[0].num, expenses);
    const shipment = appShipmentFor(rows, linkedPostage, null);
    if (!shipment) continue;
    if (rows.some(r => r.webShipment && r.webShipment.hash === shipment.hash)) continue;
    if (sent[orderId] === shipment.hash) continue;
    out.push({ orderId, linkedPostage });
    if (out.length >= WEBSITE_IMPORT_BATCH) break;
  }
  return out;
}

function publishWebsiteLinkNow(opts = {}) {
  const run = () => doPublish(opts).catch(e => { console.error('[website link] publish failed', e); return null; });
  _publishChain = _publishChain ? _publishChain.then(run) : run();
  return _publishChain;
}

async function doPublish({ marks = [], books = [], testShipments = [] } = {}) {
  if (!_started || typeof window._fbPublishWebsiteLink !== 'function') return null;
  clearTimeout(_publishTimer);
  const ids = new Set(books);
  if (_publishAll) Object.keys(BOOKS).forEach(id => ids.add(id));
  _publishBooks.forEach(id => ids.add(id));
  if (!online()) return null; // keep the queued books for when the connection is back
  _publishAll = false;
  _publishBooks = new Set();
  const bookIds = [...ids].filter(id => BOOKS[id] && bookLoaded(id));
  const shipments = shipmentCandidates();
  if (!bookIds.length && !marks.length && !shipments.length && !testShipments.length) return null;

  let res;
  try {
    res = await window._fbPublishWebsiteLink({ bookIds, marks, shipments, testShipments, heldOrders: heldOrders(), build: build(), device: deviceLabel() });
  } catch (e) {
    bookIds.forEach(id => _publishBooks.add(id));
    const denied = e && (e.code === 'permission-denied' || e.code === 'PERMISSION_DENIED');
    _publishError = denied
      ? 'The website link isn’t allowed to save yet. Publish the new database rules (see the setup steps).'
      : 'Couldn’t reach the website link just now. It tries again after your next change.';
    renderWebsiteLinkCard();
    return null;
  }
  if (!res || typeof res !== 'object') return null;
  if (res.ok === false) {
    _publishError = 'Your settings still live in the old storage, so the website link can’t run yet.';
    renderWebsiteLinkCard();
    return res;
  }
  _publishError = '';
  const sent = sentMap();
  [...(res.sent || []), ...(res.current || [])].forEach(s => { sent[s.orderId] = s.hash; });
  writeJson(SENT_KEY, sent);
  if (res.feeds) _lastFeedAt = res.at;
  if (res.accepted && res.accepted.length) _lastImportAt = res.at;
  (res.blocked || []).forEach(id => _blockedBooks.add(id));
  if (res.sent && res.sent.length) scheduleRender();
  renderWebsiteLinkCard();
  return res;
}

// ── Review choices ─────────────────────────────────────────────────────────

function decide(orderId, bookId, choice, key = '') {
  if (!orderId || !bookId) return;
  _decisions[orderId] = {
    ...(_decisions[orderId] || {}),
    [bookId]: choice === 'same' ? { choice: 'same', key } : { choice: 'different' },
  };
  _later.delete(orderId);
  scheduleImport(0);
  renderWebsiteLinkCard();
}

/** Record, once, when website orders started coming in (websiteLink/app.importConsentAt). */
// The server keeps the first day recorded: a device whose cached status hasn't
// caught up yet gets that day back instead of overwriting it with today.
async function markLinkSwitchedOn() {
  if (typeof window._fbMarkLinkSwitchedOn !== 'function') return;
  try {
    const at = await window._fbMarkLinkSwitchedOn(new Date().toISOString());
    _link = { ..._link, app: { ...(_link.app || {}), importConsentAt: at } };
  } catch (e) {
    // Not saved: carry on. With no day recorded, tracking already on a
    // hand-entered sale is always treated as the sale's own — the safe side.
    console.warn('[website link] could not record when the link was switched on', e);
  }
}

// ── Storage check ──────────────────────────────────────────────────────────
// Proof, book by book, that what the app uses now (the new storage) holds every
// record the old storage had. Read-only: it never changes either copy. A book
// with records only in the old copy is listed with them, and the owner decides.

function bookTitle(id) {
  return (BOOKS[id] && BOOKS[id].title) || id;
}

function sold(state) {
  return ((state && state.hist) || []).filter(h => h && !h.voided).length;
}

async function runStorageCheck() {
  if (_storageRunning || !online() || typeof window._fbReadOldBookCopy !== 'function' || typeof window._fbReadNewBookCopy !== 'function') return;
  if (!Object.keys(BOOKS).every(id => states[id])) return;
  _storageRunning = true;
  renderWebsiteLinkCard();
  const books = [];
  try {
    for (const id of Object.keys(BOOKS)) {
      const entry = { id, title: bookTitle(id), sales: sold(states[id]), onHand: deriveOnHand(states[id], BOOKS[id]) };
      if (!bookLoaded(id)) { books.push({ ...entry, status: 'not-loaded' }); continue; }
      if (!(typeof window._useFirestoreForBook !== 'function' || window._useFirestoreForBook(id))) {
        books.push({ ...entry, status: 'old-storage' });
        continue;
      }
      let old = null;
      let saved = null;
      try {
        old = await window._fbReadOldBookCopy(id);
        // Compare with what the server holds, not this device's copy: a save
        // still waiting to upload isn't in the new storage yet.
        if (old) saved = await window._fbReadNewBookCopy(id);
      } catch (e) { books.push({ ...entry, status: 'unreadable' }); continue; }
      if (!old) { books.push({ ...entry, status: 'ok' }); continue; }
      const cmp = compareCopies(old, saved);
      books.push({ ...entry, status: cmp.ok ? 'ok' : 'missing', missing: cmp.onlyInOld });
    }
    _storage = { at: new Date().toISOString(), books };
  } finally {
    _storageRunning = false;
    noteTodo();
    renderWebsiteLinkCard();
  }
}

async function copyOldRecords(bookId, button) {
  const entry = _storage && _storage.books.find(b => b.id === bookId);
  if (!entry || !entry.missing || !entry.missing.length) return;
  const n = entry.missing.length;
  const ok = await confirmDialog(
    `Add ${n} record${n === 1 ? '' : 's'} from the old storage to ${entry.title}?\n\nOnly do this if ${n === 1 ? 'it belongs' : 'they belong'} in the book: a record you deleted after the move would come back.`,
    { title: 'Copy records over', okLabel: 'Copy them over' },
  );
  if (!ok) return;
  if (button) button.disabled = true;
  try {
    // Compare again right now, so only what is still missing is added.
    const old = await window._fbReadOldBookCopy(bookId);
    const s = states[bookId];
    const added = old && s ? restoreRecords(s, compareCopies(old, s).onlyInOld) : 0;
    if (added) {
      recomputeAfters(s, BOOKS[bookId]);
      scheduleRender();
      await saveState(bookId);
    }
    showToast(added ? `✓ ${added} record${added === 1 ? '' : 's'} copied into ${entry.title}` : `${entry.title} already has them all`, 'ok', 5000);
  } catch (e) {
    console.error('[storage check] copy failed', e);
    showToast('Couldn’t copy them just now. Once you’re online, press it again.', 'err', 5000);
  }
  await runStorageCheck();
}

/** What the To-do list should show for website orders and the storage check. */
function websiteLinkTodo() {
  const needYou = _review.filter(p => !_later.has(p.orderId)).length;
  const books = (_storage && _storage.books) || [];
  return {
    needYou,
    storageMissing: books.filter(b => b.status === 'missing').map(b => ({ title: b.title, count: b.missing.length })),
  };
}

// Tell the To-do list and the landing rail when what they show has changed.
function noteTodo() {
  const todo = websiteLinkTodo();
  const sig = JSON.stringify(todo);
  if (sig === _todoSig) return;
  _todoSig = sig;
  // main.js listens and redraws the To-do list and landing rail.
  try { window.dispatchEvent(new CustomEvent('website-link-todo')); } catch (_) { /* they refresh on their own later */ }
}

async function rehearsePostage(orderId) {
  const doc = _docs.get(orderId);
  if (!doc || !doc.web || doc.web.test !== true) return;
  const tracking = await promptDialog(
    'Type the tracking number of a test label for this rehearsal order. The website checks whether it would dispatch the order, and never changes a test order or emails anyone.',
    '',
    { title: 'Rehearse the postage', okLabel: 'Send to the website', placeholder: 'Tracking number' },
  );
  const trackingNumber = String(tracking || '').trim();
  if (!trackingNumber) return;
  const res = await publishWebsiteLinkNow({
    testShipments: [{ orderId, shipment: { trackingNumber, labelSource: 'hand', shippedAt: localDay() } }],
  });
  if (res && res.sent && res.sent.length) showToast('Sent to the website — its answer appears here in a few minutes', 'ok', 5000);
  else if (res) showToast('The website already has that tracking number for this order', 'warn', 4000);
  else showToast('Couldn’t send it. Once you’re online, press Rehearse the postage again.', 'err', 5000);
}

/** Take a rehearsal order off the list (the website never counted it either). */
async function clearRehearsal(orderId, button) {
  const doc = _docs.get(orderId);
  if (!doc || !doc.web || doc.web.test !== true) return;
  if (button) button.disabled = true;
  const reply = doc.shipmentReply && typeof doc.shipmentReply === 'object' ? doc.shipmentReply : null;
  const res = await publishWebsiteLinkNow({
    marks: [{ orderId, hash: doc.web.hash, effect: {}, decisions: {}, replyAt: (reply && reply.at) || '', test: true }],
  });
  if (res && Array.isArray(res.accepted) && res.accepted.includes(orderId)) {
    _docs.delete(orderId);
    _tests = _tests.filter(p => p.orderId !== orderId);
    renderWebsiteLinkCard();
    showToast('Rehearsal order cleared', 'ok');
    return;
  }
  if (button) button.disabled = false;
  showToast('Couldn’t clear it just now. Once you’re online, press ✕ again.', 'warn', 5000);
}

function wireCard() {
  if (_wired) return;
  const card = $('web-link-card');
  if (!card) return;
  _wired = true;
  card.addEventListener('click', (event) => {
    const btn = event.target && event.target.closest ? event.target.closest('[data-wl-action]') : null;
    if (!btn || !card.contains(btn)) return;
    const { wlAction: action, order, book, key } = btn.dataset;
    if (action === 'same') decide(order, book, 'same', key);
    else if (action === 'different') decide(order, book, 'different');
    else if (action === 'later') { _later.add(order); renderWebsiteLinkCard(); }
    else if (action === 'unlater') { _later.clear(); renderWebsiteLinkCard(); }
    else if (action === 'retry') { scheduleImport(0); scheduleWebsiteFeedPublish('all'); }
    else if (action === 'storage-check') runStorageCheck();
    else if (action === 'copy-old') copyOldRecords(book, btn);
    else if (action === 'rehearse') rehearsePostage(order);
    else if (action === 'clear-test') clearRehearsal(order, btn);
    else if (action === 'hide-unlinked') { writeJson(UNLINKED_KEY, {}); renderWebsiteLinkCard(); }
  });
}

// ── The card ───────────────────────────────────────────────────────────────

function chip(tone, glyph, word) {
  return `<span class="wl-chip is-${tone}"><span aria-hidden="true">${glyph}</span> ${escapeHtml(word)}</span>`;
}

function rowSummary(row, bookId) {
  if (!row) return '';
  const book = BOOKS[bookId];
  const cur = book ? book.currency : getSym('CAD');
  const qty = Number(row.qty) || 0;
  const bits = [
    fmtD(row.date),
    `${qty} × ${fmt(Number(row.price) || 0, cur)}`,
    row.num ? `order ${row.num}` : '',
    row.shipName || row.shipEmail || '',
    row.voided ? 'voided' : '',
  ].filter(Boolean);
  return bits.join(' · ');
}

const REASON_WORDS = {
  weak: (r) => {
    const c = r.candidates[0] || {};
    const what = c.sameEmail && c.sameAmount ? 'the same customer email and amount'
      : c.sameEmail ? 'the same customer email' : 'the same amount';
    return `${r.candidates.length > 1 ? 'Sales' : 'A sale'} of ${titleOf(r.bookId)} within three days of this order, with the same copies and ${what}, ${r.candidates.length > 1 ? 'are already in your books. Is one of them this order?' : 'is already in your books. Is it this order?'}`;
  },
  qty: (r, plan) => `Your books have this order under ${titleOf(r.bookId)}, but with ${copies(Number(r.candidates[0].row.qty) || 0)}. The website sold ${copies(plannedSold(plan, r.bookId))}.`,
  voided: (r) => `You voided this order’s sale of ${titleOf(r.bookId)} here, but the website says it is still paid for.`,
  several: (r) => `More than one sale of ${titleOf(r.bookId)} has this order number. Pick the one that is this order, or add the website’s as a separate sale.`,
  book: (r, plan) => `This order is also recorded under “${titleOf(r.bookId)}”, which the website didn’t sell on it${plan.unlinked.length ? ' — it may be a copy the website hasn’t linked to a book here yet' : ''}.`,
  rate: (r) => `${titleOf(r.bookId)} is priced in ${r.currency}, and the exchange rate for ${fmtD(r.day)} couldn’t be loaded yet, so its price can’t be worked out. It tries again by itself when you’re online.`,
  'refund-currency': (r) => `The website refunded part of this order in ${r.currency || 'another currency'}, and this app can’t tell what that is in Canadian dollars, so the sale’s money can’t be worked out. Check the refund on the website.`,
  'unknown-book': () => 'The website sold a book that isn’t in your catalogue here any more. Check the book links on the website.',
  version: () => 'This order came from a newer version of the website. Reload this app to update it, and the order comes in by itself.',
  status: () => 'The website sent a payment state this app doesn’t know yet. Reload the app to update it.',
  empty: () => 'The website sent an order with nothing in it.',
};

function plannedSold(plan, bookId) {
  const doc = _docs.get(plan.orderId);
  const b = doc && doc.web && doc.web.books && doc.web.books[bookId];
  return Math.floor(Number(b && b.sold)) || 0;
}

function reasonActions(plan, r) {
  const o = escapeHtml(plan.orderId);
  const b = escapeHtml(r.bookId || '');
  const later = `<button class="btn sm" type="button" data-wl-action="later" data-order="${o}">Decide later</button>`;
  if (['weak', 'qty', 'voided', 'several', 'book'].includes(r.reason)) {
    const same = (r.candidates || []).map((c, i, all) => `<button class="btn sm ink" type="button" data-wl-action="same" data-order="${o}" data-book="${b}" data-key="${escapeHtml(c.key)}">${all.length > 1 ? `Same sale as #${i + 1} — link them` : 'Same sale — link them'}</button>`).join('');
    const different = `<button class="btn sm" type="button" data-wl-action="different" data-order="${o}" data-book="${b}">${r.reason === 'book' ? 'Different sales — keep that one' : 'Different sales — add it'}</button>`;
    return `${same}${different}${later}`;
  }
  if (r.reason === 'rate') return `<button class="btn sm ink" type="button" data-wl-action="retry">Try again</button>${later}`;
  return later;
}

function reviewItemHtml(plan) {
  const reasons = plan.reasons.map(r => {
    const words = (REASON_WORDS[r.reason] || REASON_WORDS.empty)(r, plan);
    const cands = (r.candidates || []).length
      ? `<ol class="wl-candidates">${r.candidates.map(c => `<li>Already in your books: <span class="wl-mono">${escapeHtml(rowSummary(c.row, r.bookId))}</span></li>`).join('')}</ol>`
      : '';
    return `<div class="wl-reason"><p class="wl-why">${escapeHtml(words)}</p>${cands}<div class="wl-actions">${reasonActions(plan, r)}</div></div>`;
  }).join('');
  return `<li class="wl-item is-needs-you">
      <div class="wl-item-head">${chip('needs-you', '!', 'Needs you')}<strong class="wl-num">${escapeHtml(plan.num || plan.orderId)}</strong><span class="wl-sub">${escapeHtml([plan.customer, fmtD(plan.day)].filter(Boolean).join(' · '))}</span></div>
      ${reasons}
    </li>`;
}

function factsHtml() {
  const rowsByOrder = websiteRowsByOrder();
  let orders = 0;
  rowsByOrder.forEach(rows => { if (rows.some(r => !r.voided)) orders++; });
  const lastImport = _lastImportAt || (_link.app && _link.app.lastImportAt) || '';
  const lastFeed = _lastFeedAt || (_link.app && _link.app.lastFeedAt) || '';
  const heartbeat = _link.website && _link.website.at;
  const fact = (label, value, sub = '') => `<div class="wl-fact"><dt>${escapeHtml(label)}</dt><dd class="wl-mono">${escapeHtml(value)}</dd>${sub ? `<dd class="wl-fact-sub">${escapeHtml(sub)}</dd>` : ''}</div>`;
  const run = _lastRun ? [
    _lastRun.added ? `${_lastRun.added} added` : '',
    _lastRun.linked ? `${_lastRun.linked} linked` : '',
    _lastRun.updated ? `${_lastRun.updated} updated` : '',
  ].filter(Boolean).join(' · ') : '';
  return `<dl class="wl-facts">
      ${fact('Last brought in', lastImport ? ago(lastImport) : 'Not yet', run)}
      ${fact('Website orders', String(orders))}
      ${fact('Stock sent to the website', lastFeed ? ago(lastFeed) : 'Not yet')}
      ${fact('Website last checked in', heartbeat ? ago(heartbeat) : 'Not yet', heartbeat ? '' : 'It checks in every few minutes once it’s connected.')}
    </dl>`;
}

function oldRecordLine({ part, row }) {
  const r = row || {};
  if (part === 'hist') {
    return [fmtD(r.date) || r.date, r.chan, r.num, r.qty != null ? `${Math.abs(Number(r.qty) || 0)} cop${Math.abs(Number(r.qty) || 0) === 1 ? 'y' : 'ies'}` : ''].filter(Boolean).join(' · ');
  }
  const label = { ledger: 'Stock record', expenses: 'Expense', stores: 'Store', artistTransfers: 'Artist transfer', artistPayouts: 'Artist payout', artistReceivables: 'Artist receivable' }[part] || part;
  return [label, fmtD(r.date) || r.date, r.type, r.qty != null ? String(r.qty) : '', r.note || r.desc || ''].filter(Boolean).join(' · ');
}

function storageHtml() {
  const head = `<h4 class="wl-subhead">Storage check</h4>`;
  const again = `<button class="btn sm" type="button" data-wl-action="storage-check"${_storageRunning ? ' disabled' : ''}>${_storageRunning ? 'Checking…' : 'Check again'}</button>`;
  if (!_storage) {
    return `<div class="wl-section">${head}<p class="wl-note">${_storageRunning ? 'Checking every book’s records against the old storage…' : 'Not checked yet on this device.'}</p><div class="wl-actions">${again}</div></div>`;
  }
  const books = _storage.books;
  const good = books.filter(b => b.status === 'ok');
  const problems = books.filter(b => b.status !== 'ok');
  const line = b => `${b.title} — ${b.sales} sale${b.sales === 1 ? '' : 's'}, ${b.onHand} on hand`;
  const summary = problems.length
    ? `<p class="wl-note">${chip('active', '!', 'Needs a look')} ${escapeHtml(`${good.length} of ${books.length} books are in the new storage with every record.`)}</p>`
    : `<p class="wl-note">${chip('positive', '✓', 'All good')} ${escapeHtml(`All ${books.length} books are in the new storage, with every record from the old one. Checked ${ago(_storage.at)}.`)}</p>`;
  const problemList = problems.map(b => {
    if (b.status === 'missing') {
      const shown = b.missing.slice(0, 10).map(m => `<li>${escapeHtml(oldRecordLine(m))}</li>`).join('');
      const more = b.missing.length > 10 ? `<li>${escapeHtml(`…and ${b.missing.length - 10} more`)}</li>` : '';
      return `<li class="wl-item"><strong>${escapeHtml(b.title)}</strong>: ${escapeHtml(`${b.missing.length} record${b.missing.length === 1 ? ' is' : 's are'} only in the old storage`)}
          <ul class="wl-points">${shown}${more}</ul>
          <p class="wl-note">These may be records you deleted after the move. Copy them only if they belong in the book.</p>
          <div class="wl-actions"><button class="btn gold sm" type="button" data-wl-action="copy-old" data-book="${escapeHtml(b.id)}">Copy these over</button></div></li>`;
    }
    const why = { 'old-storage': 'still in the old storage — it moves by itself the next time the app opens online', unreadable: 'its old copy couldn’t be read just now — check again once you’re online', 'not-loaded': 'didn’t load — reload the app' }[b.status] || b.status;
    return `<li class="wl-item"><strong>${escapeHtml(b.title)}</strong>: ${escapeHtml(why)}</li>`;
  }).join('');
  const goodList = good.length ? `<details class="wl-details"><summary>${escapeHtml(`Books checked (${good.length})`)}</summary><ul class="wl-points">${good.map(b => `<li>✓ ${escapeHtml(line(b))}</li>`).join('')}</ul></details>` : '';
  return `<div class="wl-section">${head}${summary}${problemList ? `<ul class="wl-list">${problemList}</ul>` : ''}${goodList}<div class="wl-actions">${again}</div></div>`;
}

function reviewHtml() {
  const shown = _review.filter(p => !_later.has(p.orderId));
  const setAside = _review.length - shown.length;
  if (!_review.length) return '';
  const later = setAside
    ? `<p class="wl-note">${escapeHtml(`${setAside} set aside for now — they come back when you reopen the app.`)} <button class="btn sm" type="button" data-wl-action="unlater">Show them again</button></p>`
    : '';
  if (!shown.length) return `<div class="wl-section">${later}</div>`;
  return `<div class="wl-section">
      <h4 class="wl-subhead">Needs you <span class="wl-count wl-mono">${shown.length}</span></h4>
      <p class="wl-note">Nothing is added for these until you choose. Your choice is remembered with the order.</p>
      <ul class="wl-list">${shown.map(reviewItemHtml).join('')}</ul>
      ${later}
    </div>`;
}

function blockedHtml() {
  const ids = [..._blockedBooks].filter(id => BOOKS[id]);
  const waiting = _waitingOnLoad
    ? `<p class="wl-note">${escapeHtml(`${_waitingOnLoad} order${_waitingOnLoad === 1 ? ' is' : 's are'} waiting for a book that didn’t load. Reload once you’re online.`)}</p>`
    : '';
  if (!ids.length) return waiting ? `<div class="wl-section">${waiting}</div>` : '';
  return `<div class="wl-section">
      <h4 class="wl-subhead">Still in the old storage</h4>
      <p class="wl-note">${escapeHtml(`The website can’t follow these books’ stock yet, and their website orders wait: ${ids.map(titleOf).join(', ')}. Books move to the new storage by themselves when the app opens online; one that stays here has a copy in both storages, so it isn’t moved automatically in case the newer copy is lost. Send us its name and we’ll move it for you.`)}</p>
      ${waiting}
    </div>`;
}

function unlinkedHtml() {
  const map = readJson(UNLINKED_KEY, {});
  const entries = Object.values(map);
  const qty = entries.reduce((n, e) => n + (Number(e && e.qty) || 0), 0);
  if (!qty) return '';
  const titles = [...new Set(entries.flatMap(e => (e && e.titles) || []))].slice(0, 3);
  return `<div class="wl-section wl-unlinked">
      <p class="wl-note">${chip('active', '●', 'Not linked')} ${escapeHtml(`${copies(qty)} sold on the website ${qty === 1 ? 'isn’t' : 'aren’t'} linked to a book here${titles.length ? ` (${titles.join(', ')})` : ''}. Link them in the website’s admin under Inventory › Inventory app link.`)}</p>
      <button class="card-x" type="button" data-wl-action="hide-unlinked" aria-label="Close the note about copies that aren’t linked" title="Comes back when another order has copies that aren’t linked">✕</button>
    </div>`;
}

function testsHtml() {
  if (!_tests.length) return '';
  const items = _tests.map(plan => {
    const doc = _docs.get(plan.orderId);
    const preview = (plan.preview || []).filter(p => p.copies > 0)
      .map(p => `${copies(p.copies)} of ${titleOf(p.bookId)}`).join(' and ') || 'nothing (no linked books)';
    const reply = doc && doc.shipmentReply && doc.shipmentReply.result === 'checked'
      ? `<p class="wl-reply">${chip('neutral', '●', 'Website answered')} ${escapeHtml(doc.shipmentReply.reason || '')}</p>`
      : '';
    return `<li class="wl-item">
        <div class="wl-item-head">${chip('neutral', '◌', 'Rehearsal')}<strong class="wl-num">${escapeHtml(plan.num || plan.orderId)}</strong><span class="wl-sub">${escapeHtml(fmtD(plan.day))}</span></div>
        <p class="wl-why">${escapeHtml(`Would take ${preview} off your stock.`)}</p>
        ${reply}
        <div class="wl-actions"><button class="btn sm" type="button" data-wl-action="rehearse" data-order="${escapeHtml(plan.orderId)}">Rehearse the postage</button></div>
        <button class="card-x wl-item-x" type="button" data-wl-action="clear-test" data-order="${escapeHtml(plan.orderId)}" aria-label="Clear rehearsal order ${escapeHtml(plan.num || plan.orderId)}" title="Comes back if the website sends it again">✕</button>
      </li>`;
  }).join('');
  return `<div class="wl-section">
      <h4 class="wl-subhead">Rehearsal orders</h4>
      <p class="wl-note">Test orders from the website. They are shown here and never added to your books.</p>
      <ul class="wl-list">${items}</ul>
    </div>`;
}

function statusLine() {
  if (_watchError) return { tone: 'critical', glyph: '✕', word: 'Not connected', text: _watchError };
  if (_publishError) return { tone: 'critical', glyph: '!', word: 'Needs a look', text: _publishError };
  if (!online()) return { tone: 'neutral', glyph: '◌', word: 'Offline', text: 'Website orders come in when you’re back online.' };
  if (!_ordersSeen) return { tone: 'neutral', glyph: '◌', word: 'Checking', text: 'Looking for orders from your website…' };
  if (_running) return { tone: 'active', glyph: '●', word: 'Working', text: 'Bringing in website orders…' };
  if (_docsFromCache) return { tone: 'neutral', glyph: '◌', word: 'Checking', text: 'Checking the website’s orders with the cloud…' };
  const shown = _review.filter(p => !_later.has(p.orderId)).length;
  if (shown) return { tone: 'needs-you', glyph: '!', word: 'Needs you', text: `${shown} website order${shown === 1 ? ' needs' : 's need'} you below.` };
  // Anything still waiting is said plainly, never "up to date".
  const waiting = [];
  const setAside = _review.length - shown;
  if (setAside) waiting.push(`${setAside} set aside for later`);
  const blocked = [..._blockedBooks].filter(id => BOOKS[id]).length;
  if (blocked) waiting.push(`${blocked} book${blocked === 1 ? '' : 's'} still in the old storage`);
  if (_waitingOnLoad) waiting.push(`${_waitingOnLoad} waiting for a book to load`);
  if (_refusedMarks) waiting.push(`${_refusedMarks} not confirmed by the cloud yet — trying again`);
  if (_moreWaiting) waiting.push(`${_moreWaiting} more coming in`);
  if (waiting.length) return { tone: 'active', glyph: '!', word: 'Needs a look', text: `Website orders: ${waiting.join(' · ')}.` };
  return { tone: 'positive', glyph: '✓', word: 'Up to date', text: 'Every website order is in your books.' };
}

function renderWebsiteLinkCard() {
  const card = $('web-link-card');
  if (!card) return;
  if (!_started) { card.hidden = true; return; }
  card.hidden = false;
  const s = statusLine();
  const chipEl = $('wl-state');
  if (chipEl) {
    chipEl.className = `wl-chip is-${s.tone}`;
    chipEl.innerHTML = `<span aria-hidden="true">${s.glyph}</span> ${escapeHtml(s.word)}`;
  }
  const statusEl = $('wl-status');
  if (statusEl && statusEl.textContent !== s.text) statusEl.textContent = s.text;
  const body = $('wl-body');
  if (body) body.innerHTML = [factsHtml(), reviewHtml(), blockedHtml(), unlinkedHtml(), storageHtml(), testsHtml()].join('');
}

// ── For the order screens ──────────────────────────────────────────────────

/**
 * Where a website order's parcel stands, for the order's shipping line:
 * `{ tone, text, next }` or null for an ordinary order.
 */
function websiteShipmentNote(row) {
  if (!row || !row.webOrderId) return null;
  const found = rowsOfOrder(row.webOrderId);
  const rows = found.length ? found : [row];
  const expenses = (TAX_CENTER && TAX_CENTER.businessExpenses) || [];
  const shipment = appShipmentFor(rows, linkedPostageFor(row.num, expenses), null);
  // The website's answer is kept on the order's first row only.
  const replyRow = rows.find(r => r && r.webShipment);
  const view = replyRow && !row.webShipment ? { ...row, webShipment: replyRow.webShipment } : row;
  return describeWebShipment(view, shipment, { sentHash: sentMap()[row.webOrderId] || '' });
}

export {
  publishWebsiteLinkNow,
  renderWebsiteLinkCard,
  runWebsiteImport,
  scheduleWebsiteFeedPublish,
  startWebsiteLink,
  websiteLinkActive,
  websiteLinkTodo,
  websiteShipmentNote,
};
