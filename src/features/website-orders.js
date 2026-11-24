// Website orders: the Gmail scan and the queue it fills.
//
// fetchOrders reads the shop's order emails through the Apps Script, turns
// each into a queue entry (normalizeGmailOrder) and paints the queue
// (renderOrders) with its status strip and scanning skeletons. From the queue
// an order is applied (applyOne / applyAll, through the shared sale step),
// reverted (unapplyOne), refreshed with the latest receipt totals
// (reapplyOne), or dismissed and restored (cancelOrder / restoreOrder).
// commitRecoveredWebsiteOrder is applyOne's ledger half for an order the scan
// never saw. The scan memory (applied / cancelled numbers, last scan) and the
// cross-book applied-order cache live here too.
//
// Lifted out of src/main.js verbatim. The scanned order list (`orders`) moved
// with it, because fetchOrders is what reassigns it; main.js imports and
// re-exports the live binding. The applied-order cache moved for the same
// reason: main.js forgets it through invalidateAppliedIds(). Nothing here runs
// at module-evaluation time, which is what makes the main.js <-> feature
// import cycle safe.
//
// eslint's no-undef (an error, checked in CI) is what keeps the import list
// honest: an identifier that isn't imported fails the build rather than
// throwing at click time.
import {
  $,
  WEBSITE_SALE_LOCKED,
  addLog,
  recomputeAfters,
  saveState,
  sheetsUrl,
  showToast,
  today,
} from '../main.js';
import { BOOKS, BOOK_LIST, states, activeBook, getBook } from '../core/store.js';
import { localDay } from '../lib/calendar-day.js';
import { escapeHtml } from '../lib/html.js';
import { stockToReturn } from '../lib/inventory.js';
import { fmt, fmtD, getBookCurrencyCode } from '../lib/money.js';
import { updateDash } from './dashboard.js';
import { addSaleToState, syncHistoryVoidDeletion } from './sales-ledger.js';
import { syncToSheets } from './sheets-bridge.js';
import { linkablePostageExpenses, renderOrderShippingSummary, shippingPurchaseRowPayload } from './shipping.js';
import { storageSet, storageRead } from '../lib/safe-storage.js';

// The orders the last Gmail scan found, for every book. fetchOrders replaces
// the list; everything else reads it.
let orders = [];

// ── WEBSITE ORDERS — persistent scan memory
const SCAN_MEMORY_KEY = 'lm-scan-memory';
function getScanMemory() {
  try { return JSON.parse(localStorage.getItem(SCAN_MEMORY_KEY) || '{}'); } catch (e) { return {}; }
}
function saveScanMemory(mem) {
  storageSet(SCAN_MEMORY_KEY, JSON.stringify(mem));
}

/* ── WEBSITE ORDERS — the scan status strip ────────────────────────────────
   The three tiles above the queue used to read "Source: Gmail / Channel: Big
   Cartel / Action: Inventory update" — true on every render for every book,
   and therefore worth nothing after the first read. They now carry the only
   three facts this screen is ever asked for: how many orders are waiting to be
   applied, how many are already accounted for, and how stale the last Gmail
   read is. All three are read off the same values renderOrders() already
   computes — nothing new is derived, and no aggregation is touched. */

/**
 * "Never" / "Just now" / "12 min ago" / "3 hours ago" / "6 Aug" for the
 * last-scan tile. `now` is a parameter so the boundaries stay testable.
 */
// toLocaleDateString with options builds a fresh Intl.DateTimeFormat per call
// (~200x slower than reusing one), and this runs once per activity-feed line
// and notification older than a week, so build it once.
const _WEB_SCAN_DAY_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

function webScanRelativeTime(iso, now = Date.now()) {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'Never';
  const mins = Math.floor((now - then) / 60000);
  // A clock that has drifted backwards should read as fresh, not as a negative
  // age — the scan genuinely did just happen.
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return _WEB_SCAN_DAY_FMT.format(new Date(then));
}

/** One tile. `tone` drives the accent: 'ready' = gold, '' = neutral. */
function webScanStatTile(label, value, sub, tone = '') {
  return `<div class="web-stat web-stat-live${tone ? ` is-${tone}` : ''}">
    <span class="web-stat-label">${escapeHtml(label)}</span>
    <strong class="web-stat-value">${escapeHtml(String(value ?? '—'))}</strong>
    <span class="web-stat-sub">${escapeHtml(sub ?? '')}</span>
  </div>`;
}

/**
 * The strip's markup for a given state. Built on `.web-stat` itself so the
 * placeholder tiles occupy the same box as the real ones and the page does not
 * jump when a scan lands.
 */
function webScanStatusHtml({ newCount = 0, appliedCount = 0, lastScan = null, scanning = false, now = Date.now() } = {}) {
  if (scanning) {
    const tile = `<div class="web-stat web-stat-live is-scanning" aria-hidden="true">
      <div class="skeleton-line sk-web-label"></div>
      <div class="skeleton-line sk-web-value"></div>
      <div class="skeleton-line sk-web-sub"></div>
    </div>`;
    // The tiles are decorative while they shimmer; the status is what a screen
    // reader should hear. .sr-only is absolutely positioned, so it claims no
    // grid track of its own.
    return `${tile}${tile}${tile}<span class="sr-only" role="status">Scanning Gmail for new orders…</span>`;
  }

  const n = Number(newCount) || 0;
  const applied = Number(appliedCount) || 0;
  const readyTile = webScanStatTile(
    'Ready to apply',
    n,
    n === 0 ? 'Nothing waiting on you' : `New order${n === 1 ? '' : 's'} not yet in stock`,
    n > 0 ? 'ready' : '',
  );
  const appliedTile = webScanStatTile(
    'Already applied',
    applied,
    applied === 0 ? 'None recorded from this scan' : 'Counted in stock, hidden below',
  );
  const scanTile = webScanStatTile(
    'Last Gmail scan',
    webScanRelativeTime(lastScan, now),
    lastScan ? new Date(lastScan).toLocaleString() : 'Press Scan Gmail to check',
  );
  return `${readyTile}${appliedTile}${scanTile}`;
}

/** Placeholder order cards, built on `.order-card` so the queue keeps its height. */
function webOrdersSkeletonHtml(rows = 3) {
  const card = `<div class="order-card is-skeleton" aria-hidden="true">
    <div class="order-row order-card-top">
      <div class="order-identity">
        <div class="skeleton-line sk-ord-num"></div>
        <div class="skeleton-line sk-ord-meta"></div>
      </div>
      <div class="skeleton-line sk-ord-pill"></div>
    </div>
    <div class="order-row order-card-bottom">
      <div class="skeleton-line sk-ord-summary"></div>
      <div class="skeleton-line sk-ord-actions"></div>
    </div>
  </div>`;
  return `<div class="sr-only" role="status">Scanning Gmail for new orders…</div>`
    + card.repeat(Math.max(1, rows));
}

// True only while fetchOrders() is in flight. renderOrders() bails out on it so
// an unrelated re-render (the show-applied checkbox, a Firestore echo) cannot
// replace the skeletons with a stale queue mid-scan.
let _webScanning = false;

/**
 * Swap the whole Website-orders screen into its scanning state. Clearing the
 * flag only unlocks the screen — the caller then renders the real result, so
 * the skeletons are never on-screen a frame longer than the fetch.
 */
function setWebScanning(on) {
  _webScanning = !!on;
  if (!on) return;
  const strip = $('web-orders-status');
  if (strip) strip.innerHTML = webScanStatusHtml({ scanning: true });
  const list = $('orders-list');
  if (list) list.innerHTML = webOrdersSkeletonHtml(3);
}

// Build a cross-book set of all order IDs already applied across any session.
// Cached until explicitly invalidated — rebuilt at most once per render cycle.
let _appliedIdsCache = null;
function getAllAppliedIds() {
  if (_appliedIdsCache) return _appliedIdsCache;
  const ids = new Set();
  Object.values(states).forEach(s => {
    (s.doneIds || []).forEach(id => ids.add(id));
    (s.hist || []).forEach(h => { if (h.num) ids.add(h.num); });
  });
  _appliedIdsCache = ids;
  return ids;
}
// Forget the cached set after a sale, a dismissal or a restore changes it.
// Feature modules call this; they can't reassign the cache themselves.
function invalidateAppliedIds() { _appliedIdsCache = null; }

function renderOrders() {
  // A scan is mid-flight and the skeletons are on screen. Repainting the real
  // queue now would show the pre-scan state as though it were the result.
  if (_webScanning) return;
  const book = getBook(), cur = book.currency;
  const list = $('orders-list');
  // Filter to current book; show all if bookId not set
  const rel = orders.filter(o => o.hasBook && (!o.bookId || o.bookId === activeBook));
  const appliedIds = getAllAppliedIds();
  const mem = getScanMemory();
  const cancelledNums = mem.cancelledNums || [];

  const showAllChk = $('show-all-orders-chk');
  const showAll = showAllChk ? showAllChk.checked : false;

  // ⚡ Bolt Optimization: Replace O(N) Array.includes with O(1) Set.has inside filter loop
  const cancelledNumsSet = new Set(cancelledNums);

  const isApplied = (o) => appliedIds.has(o.id) || appliedIds.has(o.orderNum);
  const isCancelled = (o) => cancelledNumsSet.has(o.orderNum);

  // Smart filter: hide orders whose order number already exists in history or is cancelled
  const visible = rel.filter(o => {
    if (showAll) return true;
    return !isApplied(o) && !isCancelled(o);
  });
  const hiddenCount = rel.length - visible.length;

  // Counts for the status strip. Read off `rel` rather than `visible` so the
  // "Show applied/hidden" checkbox changes what the queue lists without
  // changing what the tiles report — the strip is about this book's scan, not
  // about the current filter.
  let readyCount = 0, appliedCount = 0;
  for (const o of rel) {
    if (isApplied(o)) appliedCount++;
    else if (!isCancelled(o)) readyCount++;
  }
  const strip = $('web-orders-status');
  if (strip) {
    strip.innerHTML = webScanStatusHtml({
      newCount: readyCount,
      appliedCount,
      lastScan: mem.lastScan || null,
    });
  }

  if (!visible.length) {
    const msg = hiddenCount > 0
      ? `<div class="empty-state web-empty success"><div class="e-icon">✅</div><strong>Everything is up to date</strong><span>All ${hiddenCount} found order(s) are already applied or hidden. Scan again to check for newer receipts.</span></div>`
      : `<div class="empty-state web-empty"><div class="e-icon">📬</div><strong>No orders found for this book</strong><span>Make sure Google Sheets is connected, then press Scan Gmail at the top of this screen.</span></div>`;
    list.innerHTML = msg;
    $('apply-all-btn').disabled = true;
    setApplyAllHint(hiddenCount > 0 ? 'Nothing new to apply. Scan Gmail again for newer receipts.' : 'Scan Gmail first to find new orders.');
    return;
  }

  const expanded = new Set([...list.querySelectorAll('.phone-order-details[open]')].map(el => el.dataset.order));
  // Order ids and numbers come from parsed receipt emails, so they reach the
  // markup escaped: a quote in one must not end the attribute or the call.
  const jsArg = (v) => escapeHtml(JSON.stringify(String(v ?? '')));
  const postage = linkablePostageExpenses();
  list.innerHTML = visible.map(o => {
    const done = isApplied(o);
    const cancelled = isCancelled(o);
    const addrParts = [o.shipAddr1, o.shipCity, o.shipProvince, o.shipCountry].filter(Boolean);
    const addrLine = addrParts.length
      ? `<div style="font-size:var(--text-xs);color:var(--text3);margin-top:4px;">📦 ${addrParts.map(escapeHtml).join(', ')}</div>`
      : '';
    const listPrice = BOOKS[o.bookId]?.listPrice || book.listPrice;
    const listCur = BOOKS[o.bookId]?.currency || cur;
    const priceMismatch = !done && !cancelled && o.price && Math.abs(o.price - listPrice) > 0.5;
    const priceWarn = priceMismatch
      ? `<span style="font-size:var(--text-2xs);color:var(--amber);margin-left:6px;">⚠ paid ${escapeHtml(listCur)}${escapeHtml(String(o.price))} (list ${escapeHtml(listCur)}${escapeHtml(String(listPrice))})</span>`
      : '';
    const shippingBadge = renderOrderShippingSummary(o, postage);
    const bookLabel = o.bookId && BOOKS[o.bookId]
      ? `<span style="font-size:var(--text-2xs);background:${BOOKS[o.bookId].accent}22;color:${BOOKS[o.bookId].accent};border-radius:var(--r-pill);padding:2px 8px;margin-right:6px;">${escapeHtml(BOOKS[o.bookId].title)}</span>`
      : '';
    const viewEmailBtn = o.id
      ? `<a href="https://mail.google.com/mail/u/0/#all/${encodeURIComponent(o.id)}" target="_blank" class="btn sm" style="font-size:var(--text-2xs);opacity:.7;">📧 View</a>`
      : '';

    let cardClass = 'order-card';
    if (done) cardClass += ' done';
    else if (cancelled) cardClass += ' cancelled';

    const statusPill = done
      ? '<span class="pill gray">Applied</span>'
      : cancelled
        ? '<span class="pill red" style="background:var(--red-bg);color:var(--red);border:var(--stroke-hair) solid var(--red-bg);">Cancelled</span>'
        : '<span class="pill gold">New</span>';

    let actionsHtml = viewEmailBtn;
    if (done) {
      actionsHtml += `<button class="btn sm danger-btn" onclick="unapplyOne(${jsArg(o.id)})" title="Revert this applied order back to New status">Unapply</button>
                      <button class="btn sm" onclick="reapplyOne(${jsArg(o.id)})" title="Update this applied order with the latest receipt totals">Reapply</button>`;
    } else if (cancelled) {
      actionsHtml += `<button class="btn sm gold" onclick="restoreOrder(${jsArg(o.orderNum)})" title="Restore this order to New status">Restore</button>`;
    } else {
      actionsHtml += `<button class="btn sm" onclick="cancelOrder(${jsArg(o.orderNum)})" title="Cancel/dismiss this order" style="color:var(--text3);border-color:var(--border);background:transparent;">Cancel</button>
                      <button class="btn sm gold" onclick="applyOne(${jsArg(o.id)})">Apply</button>`;
    }

    return `<div class="${cardClass}">
      <div class="order-row order-card-top">
        <div class="order-identity">
          <div class="order-num">${escapeHtml(o.orderNum)}</div>
          <div class="order-meta">${escapeHtml(o.customer) || '—'} · ${escapeHtml(o.date)}</div>
          <details class="phone-order-details" data-order="${escapeHtml(o.id)}" ${expanded.has(String(o.id)) ? 'open' : ''}>
            <summary>Customer &amp; delivery details</summary>
            <div class="phone-order-contact">${escapeHtml(o.email) || 'No email on this receipt'}${addrLine}</div>
          </details>
        </div>
        ${statusPill}
      </div>
      <div class="order-row order-card-bottom">
        <span class="order-summary">${bookLabel}<span>Qty ${escapeHtml(String(o.qty))}</span><span>${fmt(o.price || listPrice, listCur)}</span>${shippingBadge}${priceWarn}</span>
        <div class="order-actions">
          ${actionsHtml}
        </div>
      </div>
    </div>`;
  }).join('');

  if (hiddenCount > 0 && !showAll) {
    list.innerHTML += `<div class="orders-hidden-note">${hiddenCount} already-applied or hidden order(s) hidden.</div>`;
  }

  const canApply = visible.some(o => !isApplied(o) && !isCancelled(o));
  $('apply-all-btn').disabled = !canApply;
  setApplyAllHint(canApply ? '' : 'Nothing new to apply. Scan Gmail again for newer receipts.');
}

// The reason line under Apply all: shown only while the button is greyed out.
function setApplyAllHint(text) {
  const hint = $('apply-all-hint');
  if (!hint) return;
  hint.textContent = text || '';
  hint.hidden = !text;
}

function cancelOrder(orderNum) {
  const mem = getScanMemory();
  if (!mem.cancelledNums) mem.cancelledNums = [];
  if (!mem.cancelledNums.includes(orderNum)) {
    mem.cancelledNums.push(orderNum);
  }
  saveScanMemory(mem);
  renderOrders();
  showToast(`✓ Order ${orderNum} cancelled/hidden`, 'ok');
}

function restoreOrder(orderNum) {
  const mem = getScanMemory();
  if (mem.cancelledNums) {
    mem.cancelledNums = mem.cancelledNums.filter(num => num !== orderNum);
    saveScanMemory(mem);
  }
  renderOrders();
  showToast(`✓ Order ${orderNum} restored to New`, 'ok');
}

// The book an order goes to: the one its receipt named, else the open book.
// Own keys only, so a parsed id such as "__proto__" can never stand for a
// book and lead a write onto Object.prototype.
function orderBookId(o) {
  const own = (obj, key) => !!key && Object.prototype.hasOwnProperty.call(obj, key);
  const id = own(BOOKS, o.bookId) ? o.bookId : activeBook;
  return own(BOOKS, id) && own(states, id) ? id : null;
}

function unapplyOne(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const targetBook = orderBookId(o);
  const state = states[targetBook];
  const book = BOOKS[targetBook];
  if (!state || !book) { showToast('Cannot find book for this order', 'err'); return; }

  const histIndex = (state.hist || []).findIndex(h => h.num === o.orderNum && h.chan === 'Website');
  if (histIndex === -1) {
    showToast('Applied order history not found', 'warn');
    return;
  }
  const h = state.hist[histIndex];
  if (h.webOrderId) { showToast(WEBSITE_SALE_LOCKED, 'warn', 5000); return; }

  if (!h.voided) state.stock += stockToReturn(h);

  state.hist.splice(histIndex, 1);
  // Totals and every later row's "stock after" are worked out again from the
  // history, as reapplyOne does. Nudging the totals by hand left the later
  // rows' stock counts (and the Google Sheet's copy of them) one order off.
  recomputeAfters(state, book);

  if (state.doneIds) {
    state.doneIds = state.doneIds.filter(x => x !== id && x !== o.id);
  }

  const mem = getScanMemory();
  if (mem.appliedNums) {
    mem.appliedNums = mem.appliedNums.filter(num => num !== o.orderNum);
    saveScanMemory(mem);
  }

  _appliedIdsCache = null;

  syncHistoryVoidDeletion(h, true, book);
  saveState(targetBook);

  renderOrders();
  if (targetBook === activeBook) updateDash();

  showToast(`✓ Reverted ${o.orderNum} to New`, 'ok');
}

// Update an already-applied website order in place after a receipt backfill.
// This deliberately does not decrement stock or increment sold units again.
function reapplyOne(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const targetBook = orderBookId(o);
  const state = states[targetBook];
  const book = BOOKS[targetBook];
  if (!state || !book) { showToast('Cannot find book for this order', 'err'); return; }
  const history = (state.hist || []).find(h => h.num === o.orderNum && h.chan === 'Website');
  if (!history) { showToast('Applied order history not found', 'warn'); return; }
  const newPrice = Number(o.price) || Number(history.price) || Number(book.listPrice) || 0;
  const newQty = Number(history.qty) || Number(o.qty) || 1;
  Object.assign(history, {
    price: newPrice,
    subtotal: Number(o.subtotal || 0) || 0,
    discountCode: o.discountCode || '',
    discountAmount: Number(o.discountAmount || 0) || 0,
    discountSource: o.discountSource || '',
    merchandisePaid: Number(o.merchandisePaid || 0) || newQty * newPrice,
    shippingMethod: o.shippingMethod || '',
    shippingPaid: Number(o.shippingPaid || 0) || 0,
    taxPaid: Number(o.taxPaid || 0) || 0,
    totalPaid: Number(o.totalPaid || 0) || 0
  });
  // Revenue follows the corrected price, worked out from the history as every
  // load does, rather than nudged by the difference.
  recomputeAfters(state, book);
  saveState(targetBook);
  syncToSheets({ type: 'order', book: book.title, date: history.date, num: history.num, chan: 'Website', qty: history.qty, price: history.price, total: history.qty * history.price, stockAfter: history.after, notes: 'Big Cartel', sheetsId: history.sheetsId, currency: getBookCurrencyCode(book) });
  if (history.shippingPaid > 0) syncToSheets(shippingPurchaseRowPayload(book, getBookCurrencyCode(book), history));
  renderOrders();
  updateDash();
  showToast(`✓ ${o.orderNum} updated with receipt totals`, 'ok');
}

// Shared by applyOne() and commitRecoveredWebsiteOrder(): both record the
// order number as seen in scan memory and un-cancel it if it was previously
// marked cancelled. Does not call saveScanMemory() — the caller does that
// once it's finished mutating mem.
function recordOrderNumApplied(mem, orderNum, { touchLastScan = false } = {}) {
  if (!mem.appliedNums) mem.appliedNums = [];
  if (!mem.appliedNums.includes(orderNum)) mem.appliedNums.push(orderNum);
  if (mem.cancelledNums) {
    mem.cancelledNums = mem.cancelledNums.filter(num => num !== orderNum);
  }
  if (touchLastScan) mem.lastScan = new Date().toISOString();
}

function applyOne(id, { deferRender = false } = {}) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const _checkedIds = getAllAppliedIds();
  const alreadyDone = _checkedIds.has(id) || _checkedIds.has(o.orderNum);
  if (alreadyDone) { showToast('Order already applied', 'warn'); return; }
  // Use the matched book if it differs from active
  const targetBook = orderBookId(o);
  const targetState = states[targetBook];
  const targetBk = BOOKS[targetBook];
  if (!targetState || !targetBk) { showToast('Cannot find book for this order', 'err'); return; }
  // Use target book's price if not on order
  const price = o.price || targetBk.listPrice;
  if (!targetState.doneIds) targetState.doneIds = [];
  targetState.doneIds.push(id);
  const extra = {
    shipName: o.shipName || o.customer || '', shipEmail: o.email || '',
    shipAddr1: o.shipAddr1 || '', shipAddr2: o.shipAddr2 || '',
    shipCity: o.shipCity || '', shipProvince: o.shipProvince || '',
    shipPostal: o.shipPostal || '', shipCountry: o.shipCountry || 'Canada',
    shippingPaid: Number(o.shippingPaid || 0) || 0,
    subtotal: Number(o.subtotal || 0) || 0,
    discountCode: o.discountCode || '',
    discountAmount: Number(o.discountAmount || 0) || 0,
    merchandisePaid: Number(o.merchandisePaid || price * o.qty) || 0,
    shippingMethod: o.shippingMethod || '',
    taxPaid: Number(o.taxPaid || 0) || 0,
    totalPaid: Number(o.totalPaid || 0) || 0,
    discountSource: o.discountSource || ''
  };
  // The shared sale step moves stock, revenue and the Website totals and
  // writes the row. Deterministic id derived from the Big Cartel order number
  // so the same import on a different device produces the same id (no
  // duplicate rows).
  const entry = addSaleToState(targetState, targetBk, {
    num: o.orderNum, chan: 'Website', qty: o.qty, price, notes: 'Big Cartel',
    // A shop order came in on its own; the publisher didn't type it in.
    enteredBy: 'Website',
    date: (o.date && o.date !== '—') ? o.date : today(),
    sheetsId: 'bc-' + String(o.orderNum).replace(/^#/, '').replace(/[^A-Za-z0-9-]/g, ''),
    extra, stamp: false,
  });
  // An older order lands in date order, so its Stock After is its own.
  recomputeAfters(targetState, targetBk);
  // Save scan memory — record this order num as seen
  const mem = getScanMemory();
  recordOrderNumApplied(mem, o.orderNum, { touchLastScan: true });
  saveScanMemory(mem);
  syncToSheets({ type: 'order', book: targetBk.title, date: entry.date, num: o.orderNum, chan: 'Website', qty: o.qty, price, total: o.qty * price, stockAfter: entry.after, notes: entry.notes, sheetsId: entry.sheetsId, currency: getBookCurrencyCode(targetBk) });
  if (entry.shippingPaid > 0) {
    syncToSheets(shippingPurchaseRowPayload(targetBk, getBookCurrencyCode(targetBk), entry));
  }
  addLog('log-web', `✓ ${o.orderNum} (${targetBk.title}): -${o.qty} → ${targetState.stock} remaining`, 'ok');
  if (targetState.stock <= targetBk.threshold) addLog('log-web', `⚠ ${targetBk.title} below threshold!`, 'warn');
  saveState(targetBook);
  if (!deferRender) {
    renderOrders();
    if (targetBook === activeBook) updateDash();
  }
}

/**
 * Write a website order that the Gmail scan never captured straight into a
 * book's ledger.
 *
 * This is applyOne()'s ledger half, reached from the shipping reconciliation
 * worklist instead of the orders queue: same stock decrement, same channel
 * stats, same Sheets rows, same scan-memory bookkeeping, so a recovered order
 * is indistinguishable downstream from a scanned one. The entry itself is
 * built by lib/manual-website-order.js — the caller passes it in finished.
 *
 * Returns the stored entry, or throws when the book is unknown.
 */
function commitRecoveredWebsiteOrder(bookId, form, buildEntry) {
  const targetState = states[bookId];
  const targetBook = BOOKS[bookId];
  if (!targetState || !targetBook) throw new Error('Cannot find that book');

  const qty = Math.max(1, Math.floor(Number(form.qty) || 1));
  const price = Number(form.price) || 0;

  // The builder fills in the shipping details; the shared sale step moves
  // stock, revenue and the Website totals and writes the row, in date order.
  const { num, notes, date, sheetsId, chan: _chan, qty: _qty, price: _price, after: _after, ...extra } =
    buildEntry({ stockAfter: Math.max(0, targetState.stock - qty) });
  const entry = addSaleToState(targetState, targetBook, { num, chan: 'Website', qty, price, notes, enteredBy: 'Website', date, sheetsId, extra, stamp: false });
  recomputeAfters(targetState, targetBook);

  // Record the number as seen so a later Gmail scan that finally turns up the
  // original confirmation email doesn't offer it as a new order to apply.
  const mem = getScanMemory();
  recordOrderNumApplied(mem, entry.num);
  saveScanMemory(mem);

  syncToSheets({
    type: 'order', book: targetBook.title, date: entry.date, num: entry.num, chan: 'Website',
    qty, price, total: qty * price, stockAfter: entry.after, notes: entry.notes,
    sheetsId: entry.sheetsId, currency: getBookCurrencyCode(targetBook),
  });
  if (entry.shippingPaid > 0) {
    syncToSheets(shippingPurchaseRowPayload(targetBook, getBookCurrencyCode(targetBook), entry));
  }

  addLog('log-web', `✓ ${entry.num} (${targetBook.title}) recovered from postage: -${qty} → ${targetState.stock} remaining`, 'ok');
  if (targetState.stock <= targetBook.threshold) addLog('log-web', `⚠ ${targetBook.title} below threshold!`, 'warn');
  saveState(bookId);
  return entry;
}

function isOrderEligibleForApply(order, appliedIds, cancelledNumsSet) {
  return order.hasBook &&
         !appliedIds.has(order.id) &&
         !appliedIds.has(order.orderNum) &&
         !cancelledNumsSet.has(order.orderNum);
}

function applyAll() {
  const applied = getAllAppliedIds();
  const mem = getScanMemory();
  const cancelledNumsSet = new Set(mem.cancelledNums || []);
  const toApply = orders.filter(o => isOrderEligibleForApply(o, applied, cancelledNumsSet));
  // Apply the whole batch without rendering, then paint once at the end —
  // turns N full renderOrders()/updateDash() cycles into a single render.
  toApply.forEach(o => applyOne(o.id, { deferRender: true }));
  if (toApply.length) { renderOrders(); updateDash(); }
}

// Loosely matches book id/title/author/urlParam tokens inside free-form Gmail
// text - tolerant of accents and punctuation. Unrelated to (and not a
// duplicate of) shipping-reconciliation.js's own, stricter normalizeText()
// used there for exact order/address comparison.
function normalizeGmailScanText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Deliberately falls back to the raw trimmed value (not '') when no
// #XXX-XXX pattern is found - unlike lib/shipping-reconciliation.js's
// normalizeShippingOrderNumber(), which returns '' on a miss. Do not
// consolidate the two: a scanned order needs to keep whatever identifier
// Gmail gave it so it still shows up in the queue, instead of being
// silently dropped by the orderNum filter below.
function normalizeGmailOrderNum(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hit = raw.match(/#?[a-z0-9]+-[a-z0-9-]+/i);
  if (hit) {
    const v = hit[0].toUpperCase();
    return v.startsWith('#') ? v : `#${v}`;
  }
  return raw;
}

function inferBookIdFromGmailText(value) {
  const txt = normalizeGmailScanText(value);
  if (!txt) return null;
  for (const b of BOOK_LIST) {
    const tokens = [b.id, b.title, b.urlParam, b.author, ...(b.title || '').split(/\s+/)]
      .filter(Boolean)
      .map(v => normalizeGmailScanText(v))
      .filter(v => v.length >= 4);
    if (tokens.some(t => t && txt.includes(t))) return b.id;
  }
  return null;
}

// Retries the Apps Script Gmail scan up to maxRetries times, reporting each
// retry via onStatus. Isolated from fetchOrders() so the request/backoff
// mechanics can be reasoned about (and eventually tested) independently of
// order parsing and dashboard state.
async function scanGmailWithRetries(sheetsUrl, daysBack, onStatus, maxRetries = 3) {
  let attempt = 0;
  let lastError;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const destUrl = sheetsUrl + (sheetsUrl.includes('?') ? '&' : '?') + 'action=scanGmail&daysBack=' + daysBack;
      const res = await fetch(destUrl, {
        method: 'GET',
        mode: 'cors'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || !data.ok) throw new Error(data.error || 'Server returned failure');
      return { parsed: data };
    } catch (e) {
      lastError = e;
      console.warn(`Scan attempt ${attempt} failed:`, e);
      if (attempt < maxRetries) {
        onStatus(`Retrying… (${attempt}/${maxRetries})`);
        await new Promise(res => setTimeout(res, 1200 * attempt));
      }
    }
  }
  return { lastError };
}

// Maps one raw Gmail-scanned order into the shape the queue/ledger expect:
// resolves which book it belongs to, coerces numeric/date fields, and fills
// in defaults for anything the email parse left out.
function normalizeGmailOrder(o, book) {
  const orderNum = normalizeGmailOrderNum(o.orderNum || o.number || o.order || o.orderNumber);
  const stableId = String(o.id || orderNum).trim();
  // Use the fetched email body to identify the correct book
  const textBlob = [o.body, o.notes, o.itemTitle, o.title].filter(Boolean).join(' ');

  let resolvedBookId = inferBookIdFromGmailText(textBlob) || inferBookIdFromGmailText(o.orderNum);
  if (!resolvedBookId) {
    resolvedBookId = BOOKS[activeBook] ? activeBook : Object.keys(BOOKS)[0];
  }

  const qty = Math.max(1, parseInt(o.qty ?? o.quantity ?? 1, 10) || 1);
  const price = parseFloat(o.price ?? o.unitPrice ?? o.amount ?? 0) || BOOKS[resolvedBookId]?.listPrice || book.listPrice;

  const rawDate = o.date || o.timestamp || o.time || o.orderDate || '';
  let normalizedDate = '';
  if (rawDate) {
    const parsedDt = new Date(rawDate);
    if (!isNaN(parsedDt.getTime())) {
      normalizedDate = localDay(rawDate); // bare dates pass through; timestamps -> local day
    }
  }

  return {
    ...o,
    id: stableId || `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    hasBook: !!resolvedBookId,
    bookId: resolvedBookId,
    orderNum,
    qty,
    price,
    shippingPaid: parseFloat(o.shippingPaid ?? o.shipping ?? o.shippingAmount ?? 0) || 0,
    subtotal: parseFloat(o.subtotal ?? 0) || 0,
    discountCode: o.discountCode || '',
    discountAmount: parseFloat(o.discountAmount ?? 0) || 0,
    merchandisePaid: parseFloat(o.merchandisePaid ?? price * qty) || 0,
    shippingMethod: o.shippingMethod || '',
    taxPaid: parseFloat(o.taxPaid ?? 0) || 0,
    totalPaid: parseFloat(o.totalPaid ?? 0) || 0,
    discountSource: o.discountSource || '',
    date: normalizedDate || today()
  };
}

async function fetchOrders() {
  const book = getBook();
  const btn = $('scan-btn');
  const log = 'log-web';

  if (!sheetsUrl) {
    showToast('Connect Google Sheets first to scan Gmail', 'warn');
    return;
  }
  // The empty state carries its own "Scan Gmail" button, so a second scan can
  // be started from the queue while the first is still retrying. One at a time.
  if (_webScanning) return;

  const setStatus = (msg) => { btn.innerHTML = `<span class="spinner"></span>${msg}`; btn.disabled = true; };

  // Read scan memory for smarter queries
  const mem = getScanMemory();
  const lastScanDate = mem.lastScan ? new Date(mem.lastScan) : null;
  const appliedNums = new Set(mem.appliedNums || []);
  const daysBack = parseInt(storageRead('lm-scan-days') || '30');
  const sinceDate = fmtD(new Date(Date.now() - daysBack * 86400000));

  // A Gmail scan is three retries deep at worst, so it can run for the better
  // part of a minute. Until now the queue kept showing its pre-scan content for
  // all of it, which reads as "nothing happened".
  setWebScanning(true);
  setStatus('Connecting to Google Apps Script…');
  const { parsed, lastError } = await scanGmailWithRetries(sheetsUrl, daysBack, setStatus);

  if (!parsed) {
    addLog(log, `❌ Apps Script Scan failed: ${lastError?.message || 'Unknown error'}. Check URL or re-authorize Apps Script.`, 'err');
    orders = [];
    setWebScanning(false);
    renderOrders();
    btn.textContent = 'Scan Gmail'; btn.disabled = false;
    return;
  }

  setStatus('Parsing results…');

  // Normalise and enrich
  orders = (parsed.orders || []).map(o => normalizeGmailOrder(o, book)).filter(o => o.orderNum);

  // Cross-session deduplication
  const allDone = getAllAppliedIds();
  [...appliedNums].forEach(n => allDone.add(n));
  const fresh = orders.filter(o => !allDone.has(o.id) && !allDone.has(o.orderNum));
  const already = orders.length - fresh.length;

  mem.lastScan = new Date().toISOString();
  saveScanMemory(mem);

  if (orders.length === 0) {
    addLog(log, `📭 No orders found in Gmail since ${sinceDate}.`, 'warn');
  } else {
    // ⚡ Bolt Optimization: Use for...of instead of reduce to avoid function allocation
    const byBook = {};
    for (const o of orders) {
      byBook[o.bookId] = (byBook[o.bookId] || 0) + 1;
    }
    const summary = Object.entries(byBook).map(([id, n]) => `${BOOKS[id]?.title || id} ×${n}`).join(', ');
    addLog(log, `✓ Found ${orders.length} order(s): ${summary}`, 'ok');
    if (already > 0) addLog(log, `↩ ${already} already recorded (skipped)`, 'warn');
    if (fresh.length > 0) addLog(log, `→ ${fresh.length} new order(s) ready`, 'ok');
  }
  if (lastScanDate) addLog(log, `🕐 Previous scan: ${lastScanDate.toLocaleString()}`, 'ok');

  setWebScanning(false);
  renderOrders();
  btn.textContent = 'Scan Gmail'; btn.disabled = false;
}

export {
  orders,
  getScanMemory,
  saveScanMemory,
  webScanRelativeTime,
  getAllAppliedIds,
  invalidateAppliedIds,
  renderOrders,
  cancelOrder,
  restoreOrder,
  unapplyOne,
  reapplyOne,
  applyOne,
  commitRecoveredWebsiteOrder,
  applyAll,
  fetchOrders,
};
