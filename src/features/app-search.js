// One search box — publisher only.
//
// Opened from the 🔍 button in the top bar, Ctrl/⌘ K, "/" (when not typing),
// or a `#search=<text>` link from the website admin. It finds this app's own
// books and, from what the app already holds, the website's books and website
// orders, each opening where it lives; the last row always searches the
// website itself (docs/website-link.md › "One search box"). Website rows open
// through the app switch (src/features/app-switch.js), reusing the website's
// tab, and say so when offline.
//
// The matching is pure and tested in src/lib/app-search.js. Nothing here runs
// at import time (tests/features-boundary.test.js).
import '../styles/app-search.css';
import { escapeHtml } from '../lib/html.js';
import { openM, closeM } from '../lib/modal.js';
import { registerActions } from '../lib/actions.js';
import { WEBSITE_TAB_NAME, websiteAdmin } from '../lib/app-switch.js';
import { cleanQuery, searchEverything } from '../lib/app-search.js';
import { isAuthor, isPublisherSession, isTestBook, switchBook } from '../main.js';
import { BOOK_LIST } from '../core/store.js';
import { websiteSearchSources } from './website-link.js';

const MODAL = 'app-search';
let _wired = false;
let _active = -1;

const $ = (id) => document.getElementById(id);

function publisherHere() {
  return isPublisherSession() && !isAuthor();
}

function isOpen() {
  const el = $(`m-${MODAL}`);
  return !!el && el.style.display !== 'none' && !el.classList.contains('closing');
}

function results(text) {
  const sources = websiteSearchSources();
  return searchEverything(text, {
    appBooks: BOOK_LIST.filter(b => b && !isTestBook(b)),
    shopBooks: sources.shopBooks,
    orders: sources.orders,
    admin: websiteAdmin(),
  });
}

function rowHtml({ id, kind, title, sub, href, bookId }) {
  const inner = `<span class="as-row-copy"><span class="as-row-title">${escapeHtml(title)}</span>${sub ? `<span class="as-row-sub">${escapeHtml(sub)}</span>` : ''}</span>`;
  if (kind === 'app') {
    return `<li role="none"><button type="button" class="as-row" role="option" id="${id}" aria-selected="false" data-as-book="${escapeHtml(bookId)}">${inner}<span class="as-row-go" aria-hidden="true">→</span></button></li>`;
  }
  return `<li role="none"><a class="as-row" role="option" id="${id}" aria-selected="false" href="${escapeHtml(href)}" target="${WEBSITE_TAB_NAME}" data-open-website="1">${inner}<span class="as-row-go" aria-hidden="true">↗</span></a></li>`;
}

function groupHtml(label, rows) {
  if (!rows.length) return '';
  return `<li role="presentation" class="as-group"><span class="as-group-label">${escapeHtml(label)}</span></li>${rows.map(rowHtml).join('')}`;
}

function render() {
  const input = $('as-input');
  const list = $('as-results');
  const note = $('as-note');
  if (!input || !list) return;
  const r = results(input.value);
  let n = 0;
  const next = () => `as-opt-${n++}`;
  const mine = r.appBooks.map(b => ({ id: next(), kind: 'app', title: b.title, sub: b.sub, bookId: b.id }));
  const theirs = r.websiteBooks.map(b => ({ id: next(), kind: 'web', title: b.title, sub: b.sub ? `On the website · ${b.sub}` : 'On the website', href: b.href }));
  const orders = r.orders.map(o => ({ id: next(), kind: 'web', title: `Website order ${o.number}`, sub: 'Opens it on the website', href: o.href }));
  const last = r.websiteSearch
    ? [{ id: next(), kind: 'web', title: `Search the website for “${r.websiteSearch.text}”`, sub: '', href: r.websiteSearch.href }]
    : [];
  list.innerHTML = [
    groupHtml('Books in this app', mine),
    groupHtml('Books on the website', theirs),
    groupHtml('Website orders', orders),
    groupHtml('On the website', last),
  ].join('');
  list.hidden = !r.query;
  _active = n ? 0 : -1;
  markActive();
  if (note) {
    note.textContent = !r.query
      ? 'Type a title, an author, an ISBN or a website order number.'
      : (mine.length || theirs.length || orders.length)
        ? `${mine.length + theirs.length + orders.length} found. Use the arrow keys and Enter, or tap one.`
        : `Nothing here matches “${r.query}”. The website may still have it.`;
  }
}

function options() {
  const list = $('as-results');
  return list ? [...list.querySelectorAll('[role="option"]')] : [];
}

function markActive() {
  const opts = options();
  const input = $('as-input');
  opts.forEach((o, i) => {
    const on = i === _active;
    o.classList.toggle('is-active', on);
    o.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (input) {
    if (_active >= 0 && opts[_active]) input.setAttribute('aria-activedescendant', opts[_active].id);
    else input.removeAttribute('aria-activedescendant');
  }
  if (_active >= 0 && opts[_active]) { try { opts[_active].scrollIntoView({ block: 'nearest' }); } catch (_) { /* old browser */ } }
}

function close() {
  closeM(MODAL);
}

function openBook(bookId) {
  close();
  if (bookId) switchBook(bookId);
}

function onKey(event) {
  const opts = options();
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!opts.length) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    _active = (_active + step + opts.length) % opts.length;
    markActive();
  } else if (event.key === 'Enter') {
    if (_active < 0 || !opts[_active]) return;
    event.preventDefault();
    opts[_active].click();
  }
}

function typingInField(target) {
  if (!target || !target.closest) return false;
  return !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

function wire() {
  if (_wired) return;
  const modal = $(`m-${MODAL}`);
  const input = $('as-input');
  if (!modal || !input) return;
  _wired = true;
  input.addEventListener('input', render);
  input.addEventListener('keydown', onKey);
  modal.addEventListener('click', (event) => {
    const t = event.target && event.target.closest ? event.target : null;
    const book = t && t.closest('[data-as-book]');
    if (book) { openBook(book.dataset.asBook); return; }
    // A website row: the app switch's own click handler opens it (or lets the
    // link open by itself in an installed app); the window just gets out of the way.
    const web = t && t.closest('a[data-open-website]');
    if (web) setTimeout(close, 0);
  });
  modal.addEventListener('mousemove', (event) => {
    const opt = event.target && event.target.closest ? event.target.closest('[role="option"]') : null;
    if (!opt) return;
    const i = options().indexOf(opt);
    if (i >= 0 && i !== _active) { _active = i; markActive(); }
  });
}

/** Open the search, with `text` filled in (a `#search=` link) or empty. */
function openAppSearch(text = '') {
  if (!publisherHere()) return;
  wire();
  const input = $('as-input');
  if (!input) return;
  input.value = cleanQuery(text);
  openM(MODAL);
  render();
  setTimeout(() => { try { input.focus(); input.select(); } catch (_) { /* fine */ } }, 0);
}

/** The top-bar button and the keyboard shortcuts. Once. */
function startAppSearch() {
  if (typeof document === 'undefined') return;
  registerActions({ 'search.open': () => openAppSearch(''), 'search.close': () => close() });
  document.addEventListener('keydown', (event) => {
    if (!publisherHere() || isOpen() || event.defaultPrevented) return;
    const k = String(event.key || '').toLowerCase();
    const combo = k === 'k' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
    const slash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !typingInField(event.target)
      && !document.querySelector('.overlay[id^="m-"][style*="flex"]');
    if (!combo && !slash) return;
    event.preventDefault();
    openAppSearch('');
  });
}

export { openAppSearch, startAppSearch };
