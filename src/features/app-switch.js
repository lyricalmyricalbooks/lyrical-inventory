// The "Website · Inventory" switcher — publisher only.
//
// The publisher runs the shop's website admin and this app side by side. This
// module keeps the switcher in the sidebar, the phone header and the More
// sheet up to date (who may see it, the "not sent yet" count, offline), opens
// the website in its own tab when one is clicked (lib/app-switch.js
// openOtherApp), and answers a deep link from the website,
// `#website-order=<orderId>`, by opening that order's sales here.
//
// The contract both apps follow is docs/website-link.md › "Switching between
// the apps". Nothing here runs at import time (tests/features-boundary.test.js).
import '../styles/app-switch.css';
import {
  INVENTORY_TAB_NAME,
  WEBSITE_TAB_NAME,
  isStandalone,
  notSentWords,
  openOtherApp,
  parseBookHash,
  parseSearchHash,
  parseWebsiteOrderHash,
  searchWithoutAdminMode,
  useWebsiteFrom,
  websiteAdmin,
} from '../lib/app-switch.js';
import { isTestProfileActive } from '../lib/test-profile.js';
import { parseAppRouteHash } from '../lib/website-todo.js';
import {
  isAuthor,
  isPublisherSession,
  isTestBook,
  showHistoryOrder,
  showToast,
  switchBook,
  switchTab,
} from '../main.js';
import { BOOKS, BOOK_LIST, states, activeBook } from '../core/store.js';
import { renderWebsiteLinkCard, websiteNotSentCount, websiteOrderDoc } from './website-link.js';
import { openAppSearch } from './app-search.js';

const TWA_KEY = 'lm-in-android-app';
const OFFLINE_WORDS = 'You’re offline. The website opens once you’re back online.';
// A website order can take a moment to come in after the link is opened (the
// watch starts with the app): look again a few times before saying it isn't here.
const FIND_TRIES = 6;
const FIND_EVERY_MS = 1000;

let _started = false;
let _booksReady = false;
let _pending = null;      // the website order a link asked for, until it is opened
let _route = null;        // 'todo' | 'website-orders': a screen a link from the website asked for
let _book = null;         // the book a `#book=<id>` link asked for
let _search = null;       // the text a `#search=<text>` link asked the search to open with
let _finding = 0;         // a search for a just-arrived order is running

function online() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** The publisher, in their own view (not previewing an artist's). */
function publisherHere() {
  return isPublisherSession() && !isAuthor();
}

/** An installed app (home screen or the Android app) rather than a browser tab. */
function inInstalledApp() {
  let seen = false;
  try { seen = sessionStorage.getItem(TWA_KEY) === '1'; } catch (_) { /* storage blocked */ }
  const referrer = (typeof document !== 'undefined' && document.referrer) || '';
  if (!seen && referrer.startsWith('android-app://')) {
    // The Android app's referrer is only on the page it first opened.
    try { sessionStorage.setItem(TWA_KEY, '1'); } catch (_) { /* fine */ }
    seen = true;
  }
  return isStandalone({
    matchMedia: typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : null,
    navigator: typeof navigator === 'undefined' ? null : navigator,
    referrer,
    twaSeen: seen,
  });
}

function alertsHidden() {
  const sidebar = document.getElementById('pub-sidebar');
  return !!(sidebar && sidebar.classList.contains('nav-alerts-hidden'));
}

/** How a link to the website should open, before any click lands on it. */
function setLinkTarget(a, installed) {
  if (installed) {
    a.target = '_blank';
    a.rel = 'noopener';
  } else {
    a.target = WEBSITE_TAB_NAME;
    a.removeAttribute('rel');
  }
}

/**
 * Repaint every switcher: shown only to the publisher in their own view, the
 * count of website orders not sent yet (none in the Test Profile, none while
 * menu alerts are hidden), and the offline state.
 */
function refreshAppSwitch() {
  if (typeof document === 'undefined') return;
  const show = publisherHere();

  // The tab's name is how the website's switcher finds this tab again.
  try {
    if (isPublisherSession()) { if (window.name !== INVENTORY_TAB_NAME) window.name = INVENTORY_TAB_NAME; }
    else if (window.name === INVENTORY_TAB_NAME) window.name = '';
  } catch (_) { /* some embedded browsers refuse */ }

  // A link from the website meant for the publisher opens nothing for an artist.
  if ((_pending || _route || _book || _search) && !isPublisherSession() && isAuthor()) { _pending = null; _route = null; _book = null; _search = null; tidyHash(); }

  const off = !online();
  let count = null;
  if (show && !isTestProfileActive()) {
    try { count = websiteNotSentCount(); } catch (_) { count = null; }
  }
  const said = notSentWords(count);
  const badgeOn = !!said && !off && !alertsHidden();
  const installed = inInstalledApp();

  document.querySelectorAll('[data-app-switch]').forEach((el) => { el.hidden = !show; });
  document.querySelectorAll('[data-app-switch-link]').forEach((a) => {
    a.hidden = !show;
    if (a.getAttribute('href') !== websiteAdmin()) a.setAttribute('href', websiteAdmin());
    setLinkTarget(a, installed);
    a.classList.toggle('is-offline', off);
    if (off) a.setAttribute('aria-disabled', 'true');
    else a.removeAttribute('aria-disabled');
    const name = off
      ? 'Open the website admin. You’re offline, so it opens once you’re back online.'
      : said ? `Open the website admin. ${said.words}.` : 'Open the website admin';
    if (a.getAttribute('aria-label') !== name) a.setAttribute('aria-label', name);
    a.title = off ? OFFLINE_WORDS : said ? `Open the website admin — ${said.words}` : 'Open the website admin';
    const badge = a.querySelector('.app-switch-badge');
    if (badge) {
      badge.hidden = !badgeOn;
      badge.textContent = badgeOn ? said.badge : '';
      if (badgeOn) { badge.title = said.words; badge.setAttribute('aria-label', said.words); }
      else { badge.removeAttribute('title'); badge.removeAttribute('aria-label'); }
    }
  });
}

function closeSheetIfInside(el) {
  if (el && el.closest && el.closest('#more-sheet') && typeof window.closeMoreSheet === 'function') {
    try { window.closeMoreSheet(); } catch (_) { /* it closes on the next tap */ }
  }
}

/** A click on any link to the website: the switcher, or "Open on the website". */
function onDocumentClick(event) {
  const target = event.target;
  const a = target && target.closest ? target.closest('[data-app-switch-link], [data-open-website]') : null;
  if (!a) return;
  // A new-tab click (middle, Ctrl/⌘, Shift) does what the person asked.
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!online()) {
    event.preventDefault();
    showToast(OFFLINE_WORDS, 'warn', 4000);
    return;
  }
  const installed = inInstalledApp();
  setLinkTarget(a, installed);
  const how = openOtherApp({
    url: a.getAttribute('href'),
    deep: a.hasAttribute('data-open-website'),
    standalone: installed,
  });
  closeSheetIfInside(a);
  if (how === 'link') return; // the link opens by itself
  event.preventDefault();
  // The website was already open in another tab, which a browser may leave in
  // the background: say where it is.
  if (how !== 'opened') showToast('The website admin is open in your other tab.', 'ok', 3200);
}

// ── The Website orders tab, from a link or the To-do list ─────────────────

/** The book whose Website orders tab to open: the one on screen, else the first real one. */
function bookForWebsiteTab() {
  if (activeBook && activeBook !== 'all' && BOOKS[activeBook]) return activeBook;
  const first = BOOK_LIST.find(b => b && b.id && !isTestBook(b));
  return first ? first.id : '';
}

/**
 * Open the Website orders tab (the website link's card lives there), scrolled
 * to the website's books not in this app yet when `shopBooks` is set.
 * Publisher only, in their own view.
 */
function openWebsiteOrdersTab({ shopBooks = false, section = '' } = {}) {
  if (!publisherHere()) return;
  const bookId = bookForWebsiteTab();
  if (bookId) switchBook(bookId);
  switchTab('website');
  renderWebsiteLinkCard();
  const want = section || (shopBooks ? 'wl-shop-books' : '');
  const target = (want && document.getElementById(want)) || document.getElementById('web-link-card');
  if (!target || target.hidden) return;
  try { target.scrollIntoView({ block: 'start' }); } catch (_) { /* old browser */ }
  if (target.id !== 'web-link-card') { try { target.focus({ preventScroll: true }); } catch (_) { /* fine */ } }
}

/** The To-do list's "See them": the website's books not in this app yet. */
function openWebsiteShopBooks() {
  openWebsiteOrdersTab({ shopBooks: true });
}

/** The To-do list's "See them": book details that differ from the website. */
function openWebsiteDetailDiffs() {
  openWebsiteOrdersTab({ section: 'wl-detail-diffs' });
}

// ── Deep link from the website: #website-order=<orderId> ──────────────────

function tidyHash() {
  if (typeof location === 'undefined') return;
  if (!parseWebsiteOrderHash(location.hash) && !parseAppRouteHash(location.hash)
    && !parseBookHash(location.hash) && !parseSearchHash(location.hash)) return;
  try { history.replaceState(history.state, '', `${location.pathname}${location.search}`); } catch (_) { /* old browser */ }
}

/**
 * The old public/admin/ page forwards here with `?mode=admin`, which nothing
 * reads. Dropping it keeps this tab's address what the website's deep links
 * expect, so following one only changes the #fragment and never reloads.
 */
function tidyAdminMode() {
  if (typeof location === 'undefined') return;
  const search = searchWithoutAdminMode(location.search);
  if (search === null) return;
  try { history.replaceState(history.state, '', `${location.pathname}${search}${location.hash}`); } catch (_) { /* old browser */ }
}

function takeHash() {
  const hash = typeof location === 'undefined' ? '' : location.hash;
  const id = parseWebsiteOrderHash(hash);
  if (id) _pending = id;
  // `#todo` and `#website-orders`: the website's alerts open these screens here.
  const route = parseAppRouteHash(hash);
  if (route) _route = route;
  // `#book=<id>` and `#search=<text>`: the website admin's search opens these here.
  const book = parseBookHash(hash);
  if (book) _book = book;
  const search = parseSearchHash(hash);
  if (search) _search = search;
  return id || route || book || search;
}

/** Open the book or the search a `#book=` / `#search=` link asked for, once the books are in. */
function openBookOrSearch() {
  if ((!_book && !_search) || !_booksReady || !isPublisherSession()) return;
  const book = _book;
  const search = _search;
  _book = null;
  _search = null;
  tidyHash();
  if (isAuthor()) return;
  if (book) {
    if (BOOKS[book]) {
      switchBook(book);
      showToast(`Opened ${titleOf(book)}`, 'ok', 2400);
    } else {
      showToast('That book isn’t in this app (it may have been removed). Search for it instead.', 'warn', 5000);
      openAppSearch('');
    }
  }
  if (search) openAppSearch(search);
}

/** Open the screen a `#todo` / `#website-orders` link asked for, once the books are in. */
function openRoute() {
  if (!_route || !_booksReady || !isPublisherSession()) return;
  const route = _route;
  _route = null;
  tidyHash();
  if (isAuthor()) return;
  if (route === 'todo') {
    switchTab('todo');
  } else if (route === 'website-orders') {
    openWebsiteOrdersTab();
  }
}

/** Sale rows a website order became, live ones first. */
function rowsOfOrder(orderId) {
  const hits = [];
  BOOK_LIST.forEach((b) => {
    if (!b || !b.id) return;
    ((states[b.id] && states[b.id].hist) || []).forEach((h) => {
      if (h && h.webOrderId === orderId) hits.push({ bookId: b.id, h });
    });
  });
  return hits.sort((x, y) => (x.h.voided ? 1 : 0) - (y.h.voided ? 1 : 0));
}

function titleOf(bookId) {
  return (BOOKS[bookId] && BOOKS[bookId].title) || 'this book';
}

function orderWords(orderId, num) {
  const n = String(num || '').trim();
  return n ? `Website order ${n}` : `Website order ${orderId}`;
}

/** The book to show a not-yet-recorded order under, or ''. */
function bookForWaitingOrder(doc) {
  const sold = doc && doc.web && doc.web.books && typeof doc.web.books === 'object' ? Object.keys(doc.web.books) : [];
  const linked = sold.find((id) => BOOKS[id]);
  if (linked) return linked;
  if (activeBook && activeBook !== 'all' && BOOKS[activeBook]) return activeBook;
  const first = BOOK_LIST.find((b) => b && b.id && !isTestBook(b));
  return first ? first.id : '';
}

function openFoundOrder(orderId, hits) {
  const first = hits[0];
  const num = first.h.num || orderId;
  showHistoryOrder(first.bookId, num);
  const others = [...new Set(hits.map((x) => x.bookId))].filter((id) => id !== first.bookId);
  const also = others.length
    ? ` It also sold copies of ${others.map(titleOf).join(', ')}: choose that book to see them.`
    : '';
  showToast(`${orderWords(orderId, first.h.num)} · ${titleOf(first.bookId)}.${also}`, 'ok', others.length ? 6500 : 3600);
}

function openWaitingOrder(orderId) {
  const doc = websiteOrderDoc(orderId);
  const bookId = bookForWaitingOrder(doc);
  if (bookId) {
    switchBook(bookId);
    switchTab('website');
  }
  const num = doc && doc.web && doc.web.number;
  let words;
  if (doc && doc.web && doc.web.test === true) {
    words = `${orderWords(orderId, num)} is a rehearsal from the website. It is listed under Rehearsal orders and never added to your books.`;
  } else if (doc) {
    words = `${orderWords(orderId, num)} hasn’t reached your books yet. The Website orders card below says what it is waiting for.`;
  } else if (!online()) {
    words = `${orderWords(orderId)} isn’t in your books on this device yet. It comes in by itself once you’re back online.`;
  } else {
    words = `${orderWords(orderId)} isn’t in your books yet. It comes in by itself while the app is open; if it doesn’t, the Website orders card says why.`;
  }
  showToast(words, 'warn', 7000);
}

function openWebsiteOrder(orderId, tries = 0) {
  const hits = rowsOfOrder(orderId);
  if (hits.length) { _finding = 0; openFoundOrder(orderId, hits); return; }
  if (online() && tries < FIND_TRIES) {
    if (tries === 0) showToast('Finding that website order…', 'ok', 2400);
    _finding = setTimeout(() => openWebsiteOrder(orderId, tries + 1), FIND_EVERY_MS);
    return;
  }
  _finding = 0;
  openWaitingOrder(orderId);
}

function openPending() {
  if (!_pending || !_booksReady || !isPublisherSession()) return;
  const id = _pending;
  _pending = null;
  tidyHash();
  if (_finding) { clearTimeout(_finding); _finding = 0; }
  openWebsiteOrder(id);
}

function onHashChange() {
  if (takeHash()) { openPending(); openRoute(); openBookOrSearch(); }
}

/** Every book has loaded: a deep link that arrived meanwhile can open now. */
function appSwitchBooksReady() {
  _booksReady = true;
  openPending();
  openRoute();
  openBookOrSearch();
  refreshAppSwitch();
}

/** Listen for clicks, the deep link, the network and website order changes. Once. */
function startAppSwitch() {
  if (_started || typeof window === 'undefined') return;
  _started = true;
  // The referrer is fixed for this page: when the website opened it, links go back to that address.
  useWebsiteFrom(typeof document === 'undefined' ? '' : document.referrer);
  tidyAdminMode();
  takeHash();
  document.addEventListener('click', onDocumentClick);
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('online', refreshAppSwitch);
  window.addEventListener('offline', refreshAppSwitch);
  window.addEventListener('website-link-changed', refreshAppSwitch);
  refreshAppSwitch();
}

export {
  appSwitchBooksReady,
  openWebsiteDetailDiffs,
  openWebsiteShopBooks,
  refreshAppSwitch,
  startAppSwitch,
};
