// The register: the Point of Sale tab and Fair Mode on a phone. The cart and
// its per-line price overrides, the currency it charges in and the exchange
// rates behind that, the payment QR for the exact amount owed, checkout and
// the receipt, and Fair Mode's one-tap charge, undo, today's sales and the
// end-of-day summary.
//
// Lifted out of src/main.js as one unit, verbatim apart from three things:
// the inline handlers became plain function declarations (main.js puts them
// on window), and the two keyboard-shortcut listeners and the saved exchange
// rates, which used to be set up as main.js evaluated, are now set up by
// initPos(), which main.js calls at that same point in start-up. With those
// gone, nothing here runs at module-evaluation time, which is what makes the
// main.js <-> feature import cycle safe.
//
// posCart is exported as a live binding for pos-books.js; only this module
// reassigns it. syncQueue and the two sync flags are read live from main.js
// for the end-of-day summary's upload line.
//
// eslint's no-undef (an error, checked in CI) is what keeps the import list
// honest: an identifier that isn't imported fails the build rather than
// throwing at click time.
import {
  $,
  _fxRateCache,
  _syncQueueHeldInMemory,
  _syncRetrying,
  copyTextWithFallback,
  createStripePaymentLinkForAmount,
  fetchLiveRate,
  isAuthor,
  posExtraBooks,
  renderFairSyncPill,
  renderHist,
  saveCatalogWithDeletions,
  saveState,
  showToast,
  startupPreviewActive,
  syncCatalog,
  syncQueue,
  today,
  updateHeader,
} from '../main.js';
import { BOOKS, states, activeBook, withActiveBook } from '../core/store.js';
import { recordOrder, voidHistEntry } from './sales-ledger.js';
import { updateDash } from './dashboard.js';
import { escapeHtml } from '../lib/html.js';
import { closeM, confirmDialog, openM, promptDialog } from '../lib/modal.js';
import { buildPaymentMeta, getBookCurrencyCode, getSym, normalizeCurrencyCode } from '../lib/money.js';
import { posOversellSummary, posStockView } from '../lib/pos-stock.js';
import { FAIR_SEARCH_OVER, FAIR_UNDO_MS, countLabel, fairDaySummary, fairSyncPill, fairTileHtml, keepScreenAwake, readCurrentFair, readLastMethod, registerSalesForDay, rememberMethod, saveCurrentFair, soldLabel, undoOpen } from '../lib/fair-mode.js';

// ── EVENT POS ──
let posCart = {};
// Per-book custom unit price (in the book's native currency), keyed by book id.
// Set via the "Adjust price" control on a cart line. Lets the seller discount
// or hand-price a title at the table. Cleared when the item is removed or the
// sale completes.
let posPriceOverrides = {};
let _posPriceEditId = null;
let posPendingSale = null;
const POS_FX_STORAGE_KEY = 'lm_pos_exchange_rates_v1';
const POS_FX_FETCHED_AT_KEY = 'lm_pos_fx_fetched_at';
// How many CAD one unit of each currency is worth. These are only the offline
// seed values used until the seller taps "↻ FX Rates" — a stall with no signal
// still totals a cart instead of showing "—" next to every price.
const POS_DEFAULT_CAD_RATES = { CAD: 1, EUR: 1.47, USD: 1.36, GBP: 1.73, MXN: 0.075 };
// Filled from this device's saved rates by initPos(), when main.js starts the
// register.
let posExchangeRates = {};

// ── POS-ONLY BOOK RESOLUTION ──
// The POS, sales tracker and QR sheet all draw from catalog books PLUS the
// POS-only extras. These helpers keep that merge in one place so the three
// surfaces stay consistent. Authors only ever see their single active book, so
// POS-only extras (a publisher tool) are excluded for them.
function posBooksMap() {
  if (isAuthor() && activeBook !== 'all') {
    return BOOKS[activeBook] ? { [activeBook]: BOOKS[activeBook] } : {};
  }
  return { ...BOOKS, ...posExtraBooks };
}
function posResolveBook(id) {
  return BOOKS[id] || posExtraBooks[id] || null;
}
function isPosOnlyBook(id) {
  return !!posExtraBooks[id] && !BOOKS[id];
}

// Default to the native currency of the first available book, falling back to EUR
const POS_CURRENCY_KEY = 'lm-pos-currency';
function _getPosDefaultCurrency() {
  // The currency last charged in on this device, e.g. EUR at a fair abroad.
  try { const saved = localStorage.getItem(POS_CURRENCY_KEY); if (saved) return saved; } catch (_) { /* private mode */ }
  const firstBook = Object.values(posBooksMap())[0];
  return firstBook ? currencyToCode(firstBook.currency) : 'EUR';
}
// Seeded in initPos(): the default reads the catalog, which main.js fills first.
let posTransactionCurrency = 'EUR';
function posCurrencyChosenOnDevice() {
  try { return !!localStorage.getItem(POS_CURRENCY_KEY); } catch (_) { return false; }
}

function loadPosExchangeRates() {
  try {
    const raw = localStorage.getItem(POS_FX_STORAGE_KEY);
    if (!raw) return { ...POS_DEFAULT_CAD_RATES };
    const parsed = JSON.parse(raw);
    return { ...POS_DEFAULT_CAD_RATES, ...parsed, CAD: 1 };
  } catch {
    return { ...POS_DEFAULT_CAD_RATES };
  }
}

function savePosExchangeRates() {
  localStorage.setItem(POS_FX_STORAGE_KEY, JSON.stringify(posExchangeRates));
}

// Delegate to the canonical helpers defined earlier so the POS uses the
// same symbol↔code mapping as the rest of the app (avoids CA$/CAD and
// $/USD ambiguities).
function currencyToCode(cur) {
  return normalizeCurrencyCode(cur, 'EUR');
}

function codeToSymbol(code) {
  return getSym(code);
}

// Building an Intl.NumberFormat costs ~60× more than calling .format() on one,
// and the POS grid asks for two or three per book tile on every re-render, so
// keep one formatter per currency code. An invalid code still throws at
// construction (never cached), exactly as before.
const _posFormatters = new Map();
function posFormat(amount, currencyCode) {
  let fmt = _posFormatters.get(currencyCode);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode });
    _posFormatters.set(currencyCode, fmt);
  }
  return fmt.format(amount || 0);
}

function convertCurrency(amount, fromCode, toCode) {
  if (fromCode === toCode) return amount;
  const fromRate = posExchangeRates[fromCode];
  const toRate = posExchangeRates[toCode];
  if (!fromRate || !toRate) return null;
  const cadValue = amount * fromRate;
  return cadValue / toRate;
}

// Currencies offered as the POS transaction currency, and the set
// posConfigureRates() fetches live rates for. Book currencies come first so a
// title's own currency is always selectable; the fixed tail covers the
// currencies taken at the table regardless of what the books are priced in
// (MXN for Mexican fairs).
function getPOSCurrencies() {
  const fromBooks = Object.values(posBooksMap()).map((b) => currencyToCode(b.currency));
  const unique = Array.from(new Set([...fromBooks, 'EUR', 'CAD', 'USD', 'MXN']));
  return unique.filter(Boolean);
}

function buildPOSCartRows() {
  const items = [];
  for (const [bookId, qty] of Object.entries(posCart)) {
    if (!qty) continue;
    const book = posResolveBook(bookId);
    if (!book) continue;
    const sourceCode = currencyToCode(book.currency);
    const listUnit = book.listPrice || 0;
    const hasOverride = Object.prototype.hasOwnProperty.call(posPriceOverrides, bookId);
    const unit = hasOverride ? posPriceOverrides[bookId] : listUnit;
    const convertedUnit = convertCurrency(unit, sourceCode, posTransactionCurrency);
    items.push({
      book,
      qty,
      sourceCode,
      sourceUnit: unit,
      listUnit,
      overridden: hasOverride && unit !== listUnit,
      sourceLine: unit * qty,
      convertedUnit,
      convertedLine: convertedUnit === null ? null : convertedUnit * qty
    });
  }
  return items;
}

// ── #2: POS keyboard search state ─────────────────────────────────────
let posSearchQuery = '';
function posSearchFilter(val) {
  posSearchQuery = (val || '').toLowerCase().trim();
  renderPOS();
}

// ── #2: POS keyboard shortcuts ─────────────────────────────────────────
// /         → focus POS search input
// Escape    → clear and blur POS search
// Ctrl+Enter → trigger checkout
function _posKeyboardShortcuts(e) {
  // Only apply shortcuts when on the POS tab
  const posPanel = $('tab-pos');
  if (!posPanel || posPanel.style.display === 'none') return;
  // Don't intercept when focused inside a modal or form input
  const tag = (document.activeElement || {}).tagName || '';
  const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  const inModal = document.activeElement && document.activeElement.closest('.modal, .overlay');

  const searchEl = $('pos-search-input');

  // / → focus search (only when not already in an input)
  if (e.key === '/' && !inInput && !inModal) {
    e.preventDefault();
    if (searchEl) { searchEl.focus(); searchEl.select(); }
    return;
  }

  // Escape → clear search (only when search box is focused or has a query)
  if (e.key === 'Escape' && !inModal) {
    if (searchEl && (document.activeElement === searchEl || posSearchQuery)) {
      e.preventDefault();
      searchEl.value = '';
      posSearchQuery = '';
      searchEl.blur();
      renderPOS();
    }
    return;
  }

  // Ctrl+Enter / Cmd+Enter → checkout
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !inModal) {
    e.preventDefault();
    if (typeof window.posCheckout === 'function') window.posCheckout();
    return;
  }
}

// ── POS cart presentation ─────────────────────────────────────────────
// Both checkout actions already refuse an empty cart (posCheckout and
// posGenerateSaleQR toast and bail), but at a fair the wasted tap costs a beat
// with a customer standing there. Showing the refusal in the control itself is
// cheaper than explaining it afterwards; the guards stay as the real safety
// net. The existing :disabled styling carries the look — never a custom one.
function posSyncCheckoutAvailability(hasItems) {
  for (const id of ['pos-checkout-btn', 'pos-sale-qr-btn']) {
    const btn = $(id);
    if (!btn) continue;
    btn.disabled = !hasItems;
    if (hasItems) btn.removeAttribute('title');
    else btn.setAttribute('title', 'Add a book to the cart first');
  }
}

// Split out of renderPOS so the checkout column is coverable on its own: it is
// the screen under the most time pressure in the app (a customer waiting at a
// fair table), and a mis-tap here removes a line or charges the wrong amount.
// buildPOSCartRows still does all the money work — these only format it.

// The three per-line controls used to be identical 11px pills roughly 20px
// tall, one of which deleted the line. That is a mis-tap waiting to happen on a
// phone. They are now real targets, and the destructive one is a separated
// icon so it cannot be confused with Adjust at a glance.
function posCartRowHtml(row, txnCurrency) {
  const idAttr = escapeHtml(String(row?.book?.id ?? ''));
  const title = escapeHtml(row?.book?.title ?? 'Untitled');
  const qty = row?.qty ?? 0;
  const unitLabel = row.overridden
    ? `<span class="pos-line-was">${posFormat(row.listUnit, row.sourceCode)}</span> <span class="pos-line-now">${posFormat(row.sourceUnit, row.sourceCode)}</span> <span class="pos-line-adj">Adj</span>`
    : posFormat(row.sourceUnit, row.sourceCode);
  const lineTotal = row.convertedLine === null
    ? posFormat(row.sourceLine, row.sourceCode)
    : posFormat(row.convertedLine, txnCurrency);
  return `
      <div class="pos-line">
        <div class="pos-line-id">
          <div class="pos-line-title">${title}</div>
          <div class="pos-line-meta"><span class="mono-num">${qty}</span> × ${unitLabel}</div>
        </div>
        <div class="pos-line-total mono-num">${lineTotal}</div>
        <div class="pos-line-actions">
          <button type="button" class="pos-line-btn" onclick="openPosPriceModal('${idAttr}')" title="Adjust the price of this line">Adjust</button>
          <button type="button" class="pos-line-btn" onclick="posGenerateLineQR('${idAttr}')" title="Payment QR for this line">QR</button>
          <button type="button" class="pos-line-btn danger" onclick="posRemoveItem('${idAttr}')" title="Remove ${title} from the cart" aria-label="Remove ${title} from the cart">✕</button>
        </div>
      </div>
    `;
}

// An empty till is the normal state between customers, not an error — so this
// says what to do next rather than just reporting that nothing is there.
function posCartEmptyHtml() {
  return `<div class="empty-state pos-cart-empty">
      <div class="e-icon" aria-hidden="true">🛒</div>
      Nothing in the cart yet.
      <span>Tap <strong>+</strong> on a book to start a sale, or press <kbd>/</kbd> to search.</span>
    </div>`;
}

// On-hand for one POS card, read from the same per-book state every other
// screen reads (`s.stock`). The register REPORTS stock, it never recomputes it —
// keeping the ledger the single owner of the number. A POS-only guest title has
// no catalog state at all and returns null, which posStockView() reads as "not
// stock-tracked" and renders as nothing rather than a misleading zero.
function posOnHandFor(bookId) {
  if (isPosOnlyBook(bookId)) return null;
  const s = states[bookId];
  return s && Number.isFinite(s.stock) ? s.stock : null;
}

// One book tile in the POS grid. Pulled out of renderPOS() so that function
// stays an orchestrator, matching posCartRowHtml/posCartEmptyHtml's split for
// the cart panel.
function posBookCardHtml(book) {
  const qty = posCart[book.id] || 0;
  const sourceCode = currencyToCode(book.currency);
  const converted = convertCurrency(book.listPrice || 0, sourceCode, posTransactionCurrency);
  const convertedLabel = converted === null
    ? `No FX rate → ${posFormat(book.listPrice || 0, sourceCode)}`
    : `${posFormat(converted, posTransactionCurrency)} (${sourceCode})`;
  const posOnly = isPosOnlyBook(book.id);
  const idAttr = escapeHtml(book.id);
  const badge = posOnly
    ? `<span style="display:inline-block;font-size:var(--text-3xs);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);background:var(--gold-bg);border:var(--stroke-hair) solid var(--gold-line);border-radius:var(--r);padding:2px 6px;margin-bottom:6px;">POS-only</span>`
    : '';
  const soldNote = (posOnly && book.sold)
    ? `<div style="font-size:var(--text-xs);color:var(--green);margin-top:3px;">${book.sold} sold${book.revenue ? ' · ' + posFormat(book.revenue, sourceCode) : ''}</div>`
    : '';
  // How many are still in the box, counting down as the cart fills. The
  // pill is the only place on this screen that has ever said so.
  const stockView = posStockView({ onHand: posOnHandFor(book.id), inCart: qty });
  const stockPill = stockView.tracked
    ? `<div class="pos-card-stock"><span class="pill ${stockView.pill} pos-stock-pill" title="${escapeHtml(stockView.srText)}">${stockView.glyph ? escapeHtml(stockView.glyph) + ' ' : ''}${escapeHtml(stockView.label)}</span></div>`
    : '';
  const editControls = posOnly
    ? `<div class="pos-card-actions">
           <button class="btn sm pos-card-btn" onclick="openPosBookModal('${idAttr}')" aria-label="Edit or view QR">✎ Edit / QR</button>
           <button class="btn sm danger-btn pos-card-btn pos-card-btn-danger" onclick="removePosBook('${idAttr}')" title="Remove POS-only book" aria-label="Remove POS-only book">✕</button>
         </div>`
    : '';
  const isActiveClass = qty > 0 ? ' is-active' : '';
  return `
      <div class="card pos-card${isActiveClass}" style="display:flex; flex-direction:column; justify-content:space-between; padding:1.2rem;${posOnly ? 'border:1.5px solid var(--gold-line);' : ''}">
        <div>
          ${badge}
          <div class="pos-card-title">${escapeHtml(book.title)}</div>
          <div class="pos-card-sub">${posFormat(book.listPrice || 0, sourceCode)} &bull; ${convertedLabel}</div>
          ${stockPill}
          ${soldNote}
        </div>
        <div>
          <div class="pos-qty-wrapper">
            <button class="pos-qty-btn" aria-label="Decrease quantity" onclick="posUpdateQty('${idAttr}', -1)">-</button>
            <span class="pos-qty-val"${qty > 0 ? ' style="color:var(--gold-text);"' : ''}>${qty}</span>
            <button class="pos-qty-btn" aria-label="Increase quantity" onclick="posUpdateQty('${idAttr}', 1)">+</button>
          </div>
          ${editControls}
        </div>
      </div>
    `;
}

// The cart in the shape posOversellSummary() wants. Built straight off posCart
// rather than buildPOSCartRows() so the stock warning stays entirely clear of
// the money/FX pipeline.
function posStockLines() {
  return Object.entries(posCart)
    .filter(([, qty]) => qty > 0)
    .map(([bookId, qty]) => {
      const book = posResolveBook(bookId);
      return { title: (book && book.title) || 'Untitled', onHand: posOnHandFor(bookId), inCart: qty };
    });
}

// Paint (or hide) the "this sells more copies than you have" banner. Used in two
// places on purpose: above Complete Sale, where the seller is looking while they
// build the cart, and again in the confirm dialog, which is the last moment
// before the stock actually moves.
function posRenderOversellNote(hostId, summary) {
  const host = $(hostId);
  if (!host) return;
  if (!summary) {
    host.hidden = true;
    host.innerHTML = '';
    return;
  }
  host.hidden = false;
  host.innerHTML = `<span class="pos-oversell-ico" aria-hidden="true">⚠</span><span><strong>More copies than you have on hand.</strong> ${escapeHtml(summary.message)} ${escapeHtml(summary.note)}</span>`;
}

function renderPOS() {
  const grid = $('pos-grid');
  if (!grid) return;

  const cartRows = buildPOSCartRows();
  const mobileCartCount = $('pos-mobile-cart-count');
  if (mobileCartCount) mobileCartCount.textContent = String(cartRows.reduce((count, row) => count + row.qty, 0));
  const cartItemsEl = $('pos-cart-items');
  const subtotalEl = $('pos-subtotal-lines');
  const totalEl = $('pos-total');
  const totalNoteEl = $('pos-total-note');
  const selectorEl = $('pos-currency');
  // The default was picked when the app started, before the books loaded, so
  // a device that never chose a currency was left on the EUR fallback. Until
  // one is chosen here, follow the books (only with an empty sale, so a sale
  // in progress never changes currency under the seller).
  if (!posCurrencyChosenOnDevice() && !cartRows.length) posTransactionCurrency = _getPosDefaultCurrency();
  const currencyOptions = getPOSCurrencies();
  if (!currencyOptions.includes(posTransactionCurrency)) posTransactionCurrency = currencyOptions[0] || 'EUR';

  if (selectorEl) {
    selectorEl.innerHTML = currencyOptions.map((code) => `<option value="${code}">${code}</option>`).join('');
    selectorEl.value = posTransactionCurrency;
  }

  let convertedTotal = 0;
  let hasMissingFx = false;
  const mixedTotals = {};
  cartRows.forEach((row) => {
    mixedTotals[row.sourceCode] = (mixedTotals[row.sourceCode] || 0) + row.sourceLine;
    if (row.convertedLine === null) hasMissingFx = true;
    else convertedTotal += row.convertedLine;
  });

  const booksToRender = posBooksMap();
  const allowPosOnly = !(isAuthor() && activeBook !== 'all');
  // ── #2: Filter books by search query ───────────────────────────────────
  const booksArr = Object.values(booksToRender).filter(b =>
    !posSearchQuery ||
    (b.title || '').toLowerCase().includes(posSearchQuery) ||
    (b.author || '').toLowerCase().includes(posSearchQuery)
  );
  if (!booksArr.length && posSearchQuery) {
    grid.innerHTML = `<div class="pos-search-empty">No books match <strong>&ldquo;${escapeHtml(posSearchQuery)}&rdquo;</strong>.<span class="pos-search-empty-hint">Clear the search to see every book.</span></div>`;
  } else {
    grid.innerHTML = booksArr.map(posBookCardHtml).join('') + (allowPosOnly && !posSearchQuery ? `
      <button type="button" class="card pos-card pos-add-tile" onclick="openPosBookModal()" aria-label="Add POS-only book">
        <div class="pos-add-tile-icon" aria-hidden="true">＋</div>
        <div class="pos-add-tile-title">Add POS-only book</div>
        <div class="pos-add-tile-sub">Guest / consignment titles. Stays out of your catalog &amp; ledger.</div>
      </button>
    ` : '');
  } // end search-filter else

  if (cartItemsEl) {
    cartItemsEl.innerHTML = cartRows.length
      ? cartRows.map((row) => posCartRowHtml(row, posTransactionCurrency)).join('')
      : posCartEmptyHtml();
  }

  posSyncCheckoutAvailability(cartRows.length > 0);
  posRenderOversellNote('pos-oversell-note', posOversellSummary(posStockLines()));

  if (subtotalEl) {
    const subtotalRows = Object.entries(mixedTotals).map(([code, amount]) => `<div>${code}: ${posFormat(amount, code)}</div>`).join('');
    subtotalEl.innerHTML = subtotalRows || '<div>—</div>';
  }

  if (totalEl) {
    totalEl.textContent = hasMissingFx
      ? Object.entries(mixedTotals).map(([code, amount]) => `${codeToSymbol(code)}${amount.toFixed(2)}`).join(' + ')
      : posFormat(convertedTotal, posTransactionCurrency);
  }
  posSyncReviewBar(cartRows.reduce((count, row) => count + row.qty, 0), totalEl?.textContent || '');
  renderFairMode(booksArr, Object.keys(booksToRender).length, cartRows, totalEl?.textContent || '');
  posSyncPaymentSeg();
  if (totalNoteEl) {
    totalNoteEl.textContent = hasMissingFx
      ? 'Mixed currency total: configure FX rates or finish in native currencies.'
      : `Transaction currency: ${posTransactionCurrency}`;
  }
}

// Phone: the floating "Review sale" bar mirrors the cart count and the total
// the checkout already computed — it never recomputes money itself.
function posSyncReviewBar(count, totalText) {
  const bar = $('pos-review-bar');
  if (!bar) return;
  bar.hidden = count === 0;
  const countEl = $('pos-review-count');
  if (countEl) countEl.textContent = String(count);
  const totalEl = $('pos-review-total');
  if (totalEl) totalEl.textContent = totalText;
  bar.setAttribute('aria-label', `Review sale: ${count} ${count === 1 ? 'book' : 'books'}, ${totalText}`);
}

// ── FAIR MODE (phones) ────────────────────────────────────────────────────
// The register as a stall tool: big tiles, one pinned Charge button, and a
// sheet where tapping how they paid records the sale — with a short Undo in
// place of the desktop's confirm dialog. Money still comes from
// buildPOSCartRows()/renderPOS(); the sale still goes through posConfirmSale().
function renderFairMode(booksArr, titleCount, cartRows, totalText) {
  const tiles = $('fm-tiles');
  if (!tiles) return;
  // A short list is faster to tap than to search.
  document.querySelector('#pos-subpanel-register .pos-layout')?.classList.toggle('fm-searchable', titleCount > FAIR_SEARCH_OVER);
  tiles.innerHTML = booksArr.map((book) => {
    const qty = posCart[book.id] || 0;
    const sourceCode = currencyToCode(book.currency);
    const converted = convertCurrency(book.listPrice || 0, sourceCode, posTransactionCurrency);
    const priceText = converted === null ? posFormat(book.listPrice || 0, sourceCode) : posFormat(converted, posTransactionCurrency);
    const stock = posStockView({ onHand: posOnHandFor(book.id), inCart: qty });
    return fairTileHtml({ id: book.id, title: book.title || 'Untitled', priceText, qty, stock, accent: book.accent });
  }).join('') || '<p class="fm-empty">No books to sell yet. Add a book to your catalogue, or add a POS-only book on a larger screen.</p>';
  // Currency switch: same list and state as the full checkout's selector.
  const ccy = $('fm-currency');
  if (ccy) {
    const codes = getPOSCurrencies();
    if (ccy.dataset.codes !== codes.join()) {
      ccy.innerHTML = codes.map((code) => `<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`).join('');
      ccy.dataset.codes = codes.join();
    }
    ccy.value = posTransactionCurrency;
  }
  // A book with no rate into this currency shows its own price; say so.
  const missingRate = booksArr.some((book) => convertCurrency(book.listPrice || 0, currencyToCode(book.currency), posTransactionCurrency) === null);
  const ratesBtn = $('fm-ccy-rates');
  if (ratesBtn) ratesBtn.hidden = !missingRate;
  const count = cartRows.reduce((n, row) => n + row.qty, 0);
  const bar = $('fm-bar');
  if (bar) bar.hidden = count === 0;
  const countEl = $('fm-bar-count');
  if (countEl) countEl.textContent = countLabel(count);
  const totalEl = $('fm-bar-total');
  if (totalEl) totalEl.textContent = totalText;
  const charge = $('fm-charge-btn');
  if (charge) {
    charge.textContent = `Charge ${totalText}`;
    charge.setAttribute('aria-label', `Charge ${totalText} for ${countLabel(count)}`);
  }
  renderFairToday();
  renderFairSyncPill();
  renderFairName();
  // The sheet stays live while open: − on a line repaints it in place.
  if ($('m-fair-charge')?.style.display === 'flex') {
    if (!count) closeM('fair-charge');
    else fairPaintCharge(cartRows, totalText);
  }
}

function fairPaintCharge(cartRows, totalText) {
  $('fm-charge-total').textContent = totalText;
  $('fm-charge-lines').innerHTML = cartRows.map((row) => {
    const id = escapeHtml(JSON.stringify(String(row.book.id)));
    const line = row.convertedLine === null ? posFormat(row.sourceLine, row.sourceCode) : posFormat(row.convertedLine, posTransactionCurrency);
    return `<li class="fm-line"><span class="fm-line-title">${escapeHtml(row.book.title)}</span><span class="fm-line-qty tnum">×${row.qty}</span><span class="fm-line-amt tnum">${line}</span><button type="button" class="fm-line-minus" onclick="posUpdateQty(${id}, -1)" aria-label="Remove one: ${escapeHtml(row.book.title)}">−</button></li>`;
  }).join('');
  posRenderOversellNote('fm-charge-oversell', posOversellSummary(posStockLines()));
  const last = readLastMethod();
  document.querySelectorAll('#m-fair-charge .fm-pay-btn').forEach((btn) => {
    btn.classList.toggle('is-last', btn.dataset.fmMethod === last);
  });
  const other = document.querySelector('#m-fair-charge .fm-pay-other');
  if (other) other.open = ['Bank Transfer', 'Cash', 'Comp/Gift'].includes(last);
}

function fairOpenCharge() {
  const rows = buildPOSCartRows();
  if (!rows.length) return;
  const printed = $('fm-qr-offline');
  if (printed) printed.hidden = true;
  fairPaintCharge(rows, $('pos-total')?.textContent || '');
  openM('fair-charge');
}

// Online only: show the Stripe code, and let the seller record the sale from
// that same screen once the customer's phone says paid.
async function fairShowQR() {
  // No signal: a payment link can't be made, so point to the printed code.
  if (navigator.onLine === false) { fairShowPrintedQr(); return; }
  closeM('fair-charge');
  const paid = $('pos-qr-record');
  if (paid) paid.hidden = false;
  await window.posGenerateSaleQR();
  // One bar of signal can still fail to reach Stripe: fall back the same way.
  if ($('m-pos-qr')?.style.display !== 'flex') {
    if (paid) paid.hidden = true;
    window.fairOpenCharge();
    fairShowPrintedQr();
  }
}

function fairShowPrintedQr() {
  const box = $('fm-qr-offline');
  if (!box) return;
  box.hidden = false;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ── Today at the register ────────────────────────────────────────────────
function fairTodaySales() {
  const books = Object.keys(BOOKS).map((id) => ({ id, title: BOOKS[id]?.title, currency: getBookCurrencyCode(BOOKS[id]), hist: states[id]?.hist }));
  return registerSalesForDay(books, today());
}

function fairTotalsText(totals) {
  const parts = Object.entries(totals).map(([cur, amt]) => posFormat(amt, currencyToCode(cur)));
  return parts.join(' + ');
}

// Date.toLocaleTimeString with options builds a fresh Intl.DateTimeFormat on
// every call (~200× slower than reusing one), and the today list formats one
// time per register sale, re-rendered after every sale and void on a busy
// fair day, so build the formatter once.
const _FAIR_SALE_TIME_FMT = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });

function renderFairToday() {
  const sum = $('fm-today-sum');
  if (!sum) return;
  const day = fairTodaySales();
  const n = day.sales.length;
  sum.textContent = n ? `${n} ${n === 1 ? 'sale' : 'sales'} · ${fairTotalsText(day.totals)}` : 'No sales yet';
  if ($('m-fair-today')?.style.display !== 'flex') return;
  $('fm-today-total').textContent = n
    ? `${day.units} ${day.units === 1 ? 'book' : 'books'} in ${n} ${n === 1 ? 'sale' : 'sales'} · ${fairTotalsText(day.totals)}`
    : 'No register sales yet today.';
  $('fm-today-list').innerHTML = day.sales.map((sale) => {
    const lines = sale.lines.map((l) => `${escapeHtml(l.title)}${l.qty > 1 ? ` ×${l.qty}` : ''}`).join(', ');
    const time = sale.at ? _FAIR_SALE_TIME_FMT.format(new Date(sale.at)) : '';
    const num = escapeHtml(JSON.stringify(String(sale.num)));
    return `<li class="fm-today-sale"><div class="fm-today-main"><span class="fm-today-lines">${lines}</span><span class="fm-today-meta">${escapeHtml(time)}</span></div><span class="fm-today-amt tnum">${escapeHtml(fairTotalsText(sale.totals))}</span><button type="button" class="fm-today-void" onclick="fairVoidSale(${num})" aria-label="Void this sale: ${lines}">Void</button></li>`;
  }).join('');
}

function fairOpenToday() {
  openM('fair-today');
  renderFairToday();
}

async function fairVoidSale(saleNum) {
  const sale = fairTodaySales().sales.find((x) => x.num === saleNum);
  if (!sale) return;
  const what = sale.lines.map((l) => `${l.title}${l.qty > 1 ? ` ×${l.qty}` : ''}`).join(', ');
  const ok = await confirmDialog(`Void this sale? ${what} goes back into stock and ${fairTotalsText(sale.totals)} comes out of your takings. Do this if it was refunded or rung up by mistake.`, { okLabel: 'Void sale', cancelLabel: 'Keep it', danger: true, title: 'Void sale' });
  if (!ok) return;
  if (_posLastSale?.saleNum === saleNum) { _posLastSale = null; const bar = $('fm-undo'); if (bar) bar.hidden = true; }
  const undone = voidRegisterSale(saleNum, [...new Set(sale.lines.map((l) => l.bookId))], 'Voided at the register');
  renderPOS();
  renderHist();
  updateDash();
  if (typeof window.renderAllOverview === 'function') window.renderAllOverview();
  updateHeader();
  renderFairToday();
  showToast(undone ? '↩ Sale voided — books back in stock' : 'That sale was already voided', undone ? 'ok' : 'warn');
}

// ── The fair you're at, sold-out books, end of day ──────────────────────
function renderFairName() {
  const el = $('fm-fair-name');
  if (!el) return;
  const fair = readCurrentFair(today());
  el.textContent = fair ? fair.name : "Name today's fair";
  $('fm-fair-btn')?.classList.toggle('is-set', !!fair);
}

async function fairSetName() {
  const fair = readCurrentFair(today());
  const name = await promptDialog("Which fair are you at today? Each sale will be labelled with it. Leave it empty to stop labelling.", fair?.name || '', { title: "Today's fair", okLabel: 'Save', placeholder: 'e.g. Toronto Art Book Fair' });
  if (name === null) return;
  const saved = saveCurrentFair(name, today());
  renderFairName();
  showToast(saved ? `📍 Sales today are labelled “${saved}”` : 'Sales are no longer labelled with a fair', 'ok');
}

async function fairTileNoneLeft(bookId) {
  const book = posResolveBook(bookId);
  const ok = await confirmDialog(`Your records show no copies of “${book?.title || 'this book'}” left. Add one anyway? Only do this if you really have a copy in hand, then check its stock count later.`, { okLabel: 'Add anyway', cancelLabel: 'Cancel', title: 'None left' });
  if (ok) window.posUpdateQty(bookId, 1);
}

function fairSummaryData() {
  const day = fairTodaySales();
  const left = {};
  for (const id of Object.keys(BOOKS)) left[id] = posOnHandFor(id);
  return fairDaySummary(day, left);
}

function fairSummaryText(sum, fair) {
  const out = [`${fair ? fair.name + ' · ' : ''}${today()}`, `${sum.units} books in ${sum.sales} sales · ${fairTotalsText(sum.totals) || '0'}`, ''];
  out.push('By payment:');
  for (const m of sum.methods) out.push(`  ${m.label}: ${fairTotalsText(m.totals)} (${m.sales} ${m.sales === 1 ? 'sale' : 'sales'})`);
  out.push('', 'By book:');
  for (const t of sum.titles) out.push(`  ${t.title}: ${t.units} sold · ${fairTotalsText(t.totals)}${t.left === null ? '' : ` · ${t.left} left`}`);
  return out.join('\n');
}

function fairOpenSummary() {
  closeM('fair-today');
  const sum = fairSummaryData();
  const fair = readCurrentFair(today());
  $('fm-summary-title').textContent = fair ? `End of day · ${fair.name}` : 'End of day';
  const pill = fairSyncPill({
    online: navigator.onLine !== false, pending: syncQueue.length, retrying: _syncRetrying, atRisk: _syncQueueHeldInMemory,
  });
  const synced = pill.tone === 'ok';
  const methodRows = sum.methods.map((m) => `<li class="fm-sum-row"><span>${escapeHtml(m.label)}<small>${m.sales} ${m.sales === 1 ? 'sale' : 'sales'}</small></span><strong class="tnum">${escapeHtml(fairTotalsText(m.totals))}</strong></li>`).join('');
  const titleRows = sum.titles.map((t) => `<li class="fm-sum-row"><span>${escapeHtml(t.title)}<small>${t.units} sold${t.left === null ? '' : ` · ${t.left} left`}</small></span><strong class="tnum">${escapeHtml(fairTotalsText(t.totals))}</strong></li>`).join('');
  $('fm-summary-body').innerHTML = sum.sales ? `
    <div class="fm-sum-hero"><span class="fm-sum-big tnum">${escapeHtml(fairTotalsText(sum.totals))}</span><span>${sum.units} ${sum.units === 1 ? 'book' : 'books'} in ${sum.sales} ${sum.sales === 1 ? 'sale' : 'sales'}</span></div>
    <div class="fm-sum-sync ${synced ? 'is-ok' : 'is-wait'}" role="status">${synced ? '✓ Everything is uploaded. Safe to close the app.' : `⚠ ${escapeHtml(pill.text)}. Keep the app open until this says everything is uploaded.`}</div>
    <h3 class="fm-sum-h">By way of paying</h3>
    <p class="fm-sum-note">Check the card reader line against your card reader's own total for today.</p>
    <ul class="fm-sum-list">${methodRows}</ul>
    <h3 class="fm-sum-h">By book</h3>
    <ul class="fm-sum-list">${titleRows}</ul>`
    : '<p class="fm-empty">No register sales yet today.</p>';
  openM('fair-summary');
}

async function fairShareSummary() {
  const text = fairSummaryText(fairSummaryData(), readCurrentFair(today()));
  try {
    if (navigator.share) { await navigator.share({ title: 'Fair summary', text }); return; }
    await navigator.clipboard.writeText(text);
    showToast('✓ Summary copied — paste it into a message or note', 'ok');
  } catch (e) {
    if (e?.name !== 'AbortError') showToast('Could not share — take a screenshot instead', 'warn');
  }
}

let _fairSaving = false;
async function fairCharge(method, { printedQr = false } = {}) {
  if (_fairSaving) return;
  if (!buildPOSCartRows().length) return;
  _fairSaving = true;
  try {
    const select = $('pos-payment-method');
    if (select) select.value = method;
    posSyncPaymentSeg();
    rememberMethod(method);
    if (!posPreparePendingSale()) return;
    // Paid on the printed code with no signal: nothing links it to a Stripe
    // payment yet, so the sale says to check it arrived.
    if (printedQr) posPendingSale.method = 'Stripe QR (printed code, check it arrived in Stripe)';
    // Name the fair on every sale row, so History and the sheet say where.
    const fair = readCurrentFair(today());
    if (fair) posPendingSale.method = `${posPendingSale.method} · ${fair.name}`;
    const totalText = posPendingSale.totalCharged;
    const count = posPendingSale.rows.reduce((n, row) => n + row.qty, 0);
    closeM('fair-charge');
    if ($('m-pos-qr')?.style.display === 'flex') closeM('pos-qr');
    const paid = $('pos-qr-record');
    if (paid) paid.hidden = true;
    const printed = $('fm-qr-offline');
    if (printed) printed.hidden = true;
    const recorded = window.posConfirmSale();
    fairShowUndo(soldLabel(count, totalText));
    await recorded;
  } finally {
    _fairSaving = false;
  }
}

function fairShowUndo(text) {
  const bar = $('fm-undo');
  if (!bar) return;
  $('fm-undo-text').textContent = text;
  const btn = $('fm-undo-btn');
  if (btn) btn.disabled = false;
  bar.hidden = false;
  clearTimeout(bar._t);
  bar._t = setTimeout(() => { bar.hidden = true; }, FAIR_UNDO_MS);
}

// Reverses the last register sale exactly the way the History Void button
// does (stock back, revenue and channel totals out, Sheets row deleted), and
// only inside the undo window so it can never reach an older sale.
// Reverses one register checkout exactly the way the History Void button
// does (stock back, revenue and channel totals out, Sheets row deleted).
// Returns how many book rows were reversed.
function voidRegisterSale(saleNum, bookIds, reason) {
  let undone = 0;
  for (const bookId of bookIds) {
    const s = states[bookId];
    const book = BOOKS[bookId];
    const h = s?.hist?.find((x) => x.num === saleNum && x.chan === 'Book Fair' && !x.voided);
    if (!h) continue;
    if (h.artistSettlementId) { showToast('Undo the author settlement before voiding this sale.', 'warn'); continue; }
    // voidHistEntry's Sheets sync names the active book.
    withActiveBook(bookId, () => voidHistEntry(s, book, h));
    h.voidedReason = reason;
    saveState(bookId);
    undone++;
  }
  return undone;
}

async function fairUndoLastSale() {
  const sale = _posLastSale;
  const bar = $('fm-undo');
  if (!sale || !undoOpen(sale.at)) { if (bar) bar.hidden = true; return; }
  _posLastSale = null;
  const btn = $('fm-undo-btn');
  if (btn) btn.disabled = true;
  const undone = voidRegisterSale(sale.saleNum, sale.bookIds, 'Undone at the register');
  if (sale.posOnly.length) {
    // The POS-only tally is written after the sale; take it back only once
    // that write has landed, so the two can't cross.
    try { await sale.tail; } catch (_) { /* tally never landed */ }
    if (sale.tallied) {
      for (const line of sale.posOnly) {
        const pb = posExtraBooks[line.id];
        if (!pb) continue;
        pb.sold = Math.max(0, (pb.sold || 0) - line.qty);
        pb.revenue = Math.max(0, (pb.revenue || 0) - line.qty * line.unit);
      }
      try { await saveCatalogWithDeletions(); } catch (e) { console.warn('POS-only undo save failed', e); }
    }
  }
  if (bar) bar.hidden = true;
  renderPOS();
  renderHist();
  updateDash();
  if (typeof window.renderAllOverview === 'function') window.renderAllOverview();
  updateHeader();
  showToast(undone || sale.posOnly.length ? '↩ Sale undone — books back in stock' : 'That sale was already undone', undone || sale.posOnly.length ? 'ok' : 'warn');
}

// Screen stays on while the register is open on a phone.
// var: tab switches can run before this line is reached during start-up.
var _fairReleaseWake = null;
function fairSetAwake(on) {
  if (on && !_fairReleaseWake && window.matchMedia?.('(max-width: 768px)').matches) _fairReleaseWake = keepScreenAwake();
  if (!on && _fairReleaseWake) { _fairReleaseWake(); _fairReleaseWake = null; }
}

// Phone: big payment buttons that drive the existing <select>, which stays the
// single source of truth read by posCheckout().
function posPickPayment(value) {
  const select = $('pos-payment-method');
  if (!select) return;
  select.value = value;
  posSyncPaymentSeg();
}

function posSyncPaymentSeg() {
  const value = $('pos-payment-method')?.value;
  document.querySelectorAll('.pos-pay-opt').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.pay === value));
  });
}

function posMobileView(view, scroll = true) {
  if (view !== 'books' && view !== 'checkout') return;
  const layout = document.querySelector('#pos-subpanel-register .pos-layout');
  if (!layout) return;
  layout.dataset.mobileView = view;
  ['books', 'checkout'].forEach((step) => {
    const tab = $(`pos-mobile-${step}-tab`);
    if (!tab) return;
    const selected = step === view;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-pressed', String(selected));
  });
  if (scroll && window.matchMedia('(max-width: 768px)').matches) {
    document.querySelector('.pos-mobile-steps')?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
}

function posUpdateQty(bookId, delta) {
  posCart[bookId] = Math.max(0, (posCart[bookId] || 0) + delta);
  if (posCart[bookId] === 0) { delete posCart[bookId]; delete posPriceOverrides[bookId]; }
  renderPOS();
}

function posRemoveItem(bookId) {
  delete posCart[bookId];
  delete posPriceOverrides[bookId];
  renderPOS();
}

// ── PER-LINE PRICE / DISCOUNT OVERRIDE ──
// Opens a compact editor for one cart line so the seller can hand-price a book
// or apply a quick discount. Prices are edited in the book's native currency
// (what flows into revenue/ledger); the cart converts to the txn currency.
function openPosPriceModal(bookId) {
  const book = posResolveBook(bookId);
  if (!book) return;
  _posPriceEditId = bookId;
  const code = currencyToCode(book.currency);
  const list = book.listPrice || 0;
  const current = Object.prototype.hasOwnProperty.call(posPriceOverrides, bookId)
    ? posPriceOverrides[bookId]
    : list;
  $('pp-title').textContent = book.title;
  $('pp-list').textContent = posFormat(list, code);
  $('pp-cur-sym').textContent = codeToSymbol(code);
  const input = $('pp-price');
  input.value = (current || 0).toFixed(2);
  $('pp-reset-btn').style.display = (current !== list) ? '' : 'none';
  window.posPricePreview();
  openM('pos-price');
  // Select the field so a one-handed edit is immediate.
  setTimeout(() => { input.focus(); input.select(); }, 60);
}

// Quick discount buttons: set the field to a percentage off the list price.
function posPriceQuick(pct) {
  const book = posResolveBook(_posPriceEditId);
  if (!book) return;
  const list = book.listPrice || 0;
  const val = Math.max(0, list * (1 - (pct / 100)));
  $('pp-price').value = val.toFixed(2);
  window.posPricePreview();
}

function posPricePreview() {
  const book = posResolveBook(_posPriceEditId);
  if (!book) return;
  const list = book.listPrice || 0;
  const code = currencyToCode(book.currency);
  let val = parseFloat($('pp-price').value);
  const note = $('pp-preview');
  if (!(val >= 0) || isNaN(val)) { note.textContent = ''; return; }
  if (list > 0 && val < list) {
    const off = Math.round((1 - val / list) * 100);
    note.innerHTML = `New price <strong>${posFormat(val, code)}</strong> · <span style="color:var(--gold);">${off}% off</span>`;
  } else if (list > 0 && val > list) {
    note.innerHTML = `New price <strong>${posFormat(val, code)}</strong> · markup`;
  } else {
    note.innerHTML = `New price <strong>${posFormat(val, code)}</strong>`;
  }
}

function savePosPrice() {
  const book = posResolveBook(_posPriceEditId);
  if (!book) return;
  const val = parseFloat($('pp-price').value);
  if (!(val >= 0) || isNaN(val)) { showToast('Enter a valid price (0 or more)', 'warn'); return; }
  const list = book.listPrice || 0;
  // Make sure the line is actually in the cart (Adjust implies selling one).
  if (!posCart[_posPriceEditId]) posCart[_posPriceEditId] = 1;
  if (val === list) delete posPriceOverrides[_posPriceEditId];
  else posPriceOverrides[_posPriceEditId] = Math.round(val * 100) / 100;
  closeM('pos-price');
  _posPriceEditId = null;
  renderPOS();
  showToast('✓ Price updated');
}

function posResetPrice() {
  if (_posPriceEditId) delete posPriceOverrides[_posPriceEditId];
  closeM('pos-price');
  _posPriceEditId = null;
  renderPOS();
  showToast('Reset to list price');
}

// Quick keyboard shortcuts for POS price override modal:
// '1' -> 10%, '2' -> 20%, '3' -> 25%, '5' -> 50%, '0' -> Free (100%), 'Enter' -> Save
function _posPriceModalKeys(e) {
  const modal = $('m-pos-price');
  if (!modal || modal.style.display === 'none') return;
  if (e.key === 'Enter') {
    e.preventDefault();
    window.savePosPrice();
  } else if (e.target.tagName !== 'INPUT') {
    if (e.key === '1') { e.preventDefault(); window.posPriceQuick(10); }
    else if (e.key === '2') { e.preventDefault(); window.posPriceQuick(20); }
    else if (e.key === '3') { e.preventDefault(); window.posPriceQuick(25); }
    else if (e.key === '5') { e.preventDefault(); window.posPriceQuick(50); }
    else if (e.key === '0') { e.preventDefault(); window.posPriceQuick(100); }
  }
}

// ── PAYMENT QR FOR THE EXACT (DISCOUNTED) AMOUNT ──
// Mint a Stripe Payment Link for what the customer actually owes — either the
// whole sale or a single adjusted line — and show a scannable QR. Needs the
// network and a saved Stripe restricted key (same one the catalog QR uses).
let _posQRLink = '';

function _showPosQR(url, amountLabel, sub) {
  _posQRLink = url || '';
  $('pos-qr-amount').textContent = amountLabel || '';
  $('pos-qr-sub').textContent = sub || '';
  $('pos-qr-link').value = url || '';
  const wrap = $('pos-qr-canvas');
  wrap.innerHTML = '';
  if (url && typeof QRCode !== 'undefined') {
    new QRCode(wrap, { text: url, width: 220, height: 220, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.H });
  } else {
    wrap.innerHTML = '<div style="color:var(--text3);font-size:var(--text-sm);">QR library not ready.</div>';
  }
  openM('pos-qr');
}

function copyPosQRLink() {
  if (!_posQRLink) { showToast('No link yet', 'warn'); return; }
  copyTextWithFallback(_posQRLink).then(() => showToast('Payment link copied'));
}

function downloadPosQR() {
  const canvas = document.querySelector('#pos-qr-canvas canvas');
  if (!canvas) { showToast('QR not ready', 'warn'); return; }
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `pos-payment-qr.png`;
  a.click();
  showToast('Downloading QR Code image');
}

// QR for the whole cart at the exact total (discounts included), in the
// transaction currency the customer is paying.
async function posGenerateSaleQR() {
  const rows = buildPOSCartRows();
  if (!rows.length) { showToast('Cart is empty', 'warn'); return; }
  if (rows.some((r) => r.convertedLine === null)) {
    showToast('Set FX rates first — some lines have no rate for ' + posTransactionCurrency, 'warn', 5000);
    return;
  }

  // ⚡ Bolt Optimization: Loop Fusion
  // Calculate total and units in a single pass instead of multiple .reduce() calls
  let total = 0, units = 0;
  for (const r of rows) {
    total += r.convertedLine || 0;
    units += r.qty || 0;
  }

  const desc = rows.length === 1
    ? `${rows[0].book.title}${rows[0].qty > 1 ? ` ×${rows[0].qty}` : ''}`
    : `Book fair sale — ${units} item${units === 1 ? '' : 's'}`;
  const btn = $('pos-sale-qr-btn');
  const restore = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Creating…'; }
  try {
    const url = await createStripePaymentLinkForAmount({
      amountMajor: total,
      currencyCode: posTransactionCurrency,
      description: desc,
      metadata: { source: 'pos_sale', sku: rows.length === 1 ? rows[0].book.id : 'pos-multi' },
    });
    _showPosQR(url, posFormat(total, posTransactionCurrency), desc);
    showToast('✓ Payment QR ready');
  } catch (e) {
    showToast('Stripe: ' + (e.message || e), 'err', 6000);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = restore; }
  }
}

// QR for a single cart line at its adjusted price, in the transaction currency.
async function posGenerateLineQR(bookId) {
  const row = buildPOSCartRows().find((r) => r.book.id === bookId);
  if (!row) { showToast('Item not in cart', 'warn'); return; }
  if (row.convertedLine === null) {
    showToast('Set FX rates first — no rate for ' + posTransactionCurrency, 'warn', 5000);
    return;
  }
  const desc = `${row.book.title}${row.qty > 1 ? ` ×${row.qty}` : ''}`;
  try {
    const url = await createStripePaymentLinkForAmount({
      amountMajor: row.convertedLine,
      currencyCode: posTransactionCurrency,
      description: desc,
      metadata: { source: 'pos_line', book_id: row.book.id, sku: row.book.id },
    });
    _showPosQR(url, posFormat(row.convertedLine, posTransactionCurrency), desc);
    showToast('✓ Payment QR ready');
  } catch (e) {
    showToast('Stripe: ' + (e.message || e), 'err', 6000);
  }
}

function posSetCurrency(code) {
  posTransactionCurrency = code || posTransactionCurrency;
  try { localStorage.setItem(POS_CURRENCY_KEY, posTransactionCurrency); } catch (_) { /* private mode */ }
  renderPOS();
}

function fairSetCurrency(code) {
  window.posSetCurrency(code);
  showToast(`Prices now shown and charged in ${posTransactionCurrency}`, 'ok');
}

// Fetch live rates for all POS currencies (CAD-pivot) and populate both
// posExchangeRates and _fxRateCache so Tax Center conversions stay correct.
// `silent` is set for the automatic fetch on app load (boot(), below) so a
// closed stall with no signal doesn't get a toast on every open — manual
// clicks on the "↻ FX Rates" button (no args, so silent defaults false) keep
// their existing success/warning feedback.
async function posConfigureRates({ silent = false } = {}) {
  const currencies = getPOSCurrencies().filter(c => c !== 'CAD');
  const btn = document.querySelector('[onclick="posConfigureRates()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Fetching…'; }

  let fetched = 0, failed = [];
  // ⚡ Bolt Optimization: Parallelize Asynchronous I/O
  // Replaced sequential `for...of` loops with `Promise.all` to fetch FX rates concurrently.
  await Promise.all(currencies.map(async (code) => {
    // Rate: how many CAD per 1 unit of `code` (e.g. 1 EUR → 1.47 CAD)
    const result = await fetchLiveRate(code, 'CAD');
    if (result.rate) {
      posExchangeRates[code] = result.rate;
      _fxRateCache[`${code}_CAD`] = result.rate;
      fetched++;
    } else {
      failed.push(code);
    }
    // Also cache the inverse (CAD→code) for book-currency→txn-currency conversion
    if (result.rate) {
      _fxRateCache[`CAD_${code}`] = 1 / result.rate;
    }
    // For non-CAD book currencies vs non-CAD txn currencies, cache cross-pairs too
    await Promise.all(currencies.map(async (other) => {
      if (other === code) return;
      const crossResult = await fetchLiveRate(code, other);
      if (crossResult.rate) _fxRateCache[`${code}_${other}`] = crossResult.rate;
    }));
  }));
  posExchangeRates.CAD = 1;
  _fxRateCache['CAD_CAD'] = 1;
  savePosExchangeRates();
  localStorage.setItem(POS_FX_FETCHED_AT_KEY, new Date().toISOString());

  renderPOS();
  renderPOSFxStatus();

  if (btn) { btn.disabled = false; btn.textContent = 'FX Rates'; }
  if (silent) return;
  if (failed.length) {
    showToast(`Rates updated (${fetched} live · ${failed.join(', ')} unavailable — using cached)`, 'warn');
  } else {
    showToast(`✓ Live FX rates updated for ${fetched} currencies`, 'ok');
  }
}

// Render a small status line below the FX button showing rate freshness
function renderPOSFxStatus() {
  const el = document.getElementById('pos-fx-status');
  if (!el) return;
  const ts = localStorage.getItem(POS_FX_FETCHED_AT_KEY);
  if (!ts) {
    el.textContent = 'Using saved rates. Use ↻ FX Rates to refresh them.';
    el.style.color = 'var(--amber)';
  } else {
    const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    const label = mins < 2 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
    el.textContent = `Live rates fetched ${label}`;
    el.style.color = 'var(--green)';
  }
};

// ── POS cart-to-manual-entry adapter
// Maps a POS cart item into the exact payload shape that recordOrder expects,
// so that POS sales and manual entry sales are written to the ledger identically.
//
// fxRate must be the live rate from paymentCurrency → bookNativeCurrency
// (i.e. the same direction fetchLiveRate uses), matching how manual entry works.
function _posItemToManualPayload(book, qty, paymentMethod, basePrice, txnCurCode, convertedUnitInTxnCur, nativePerTxnRate, priceNote, saleNum = '') {
  const nativeCurCode = getBookCurrencyCode(book);
  const isFx = txnCurCode !== nativeCurCode;

  // Amount actually paid in the transaction currency (what the customer handed over)
  const foreignTotal = qty * convertedUnitInTxnCur;

  const payment = buildPaymentMeta({
    book,
    qty,
    unitPrice: basePrice,          // native-currency unit price (for revenue/ledger)
    fxEnabled: isFx,
    fxCur: txnCurCode,             // what currency was actually paid
    fxAmt: foreignTotal,           // total amount paid in that currency
    fxRate: nativePerTxnRate || 1  // rate: 1 txnCur = N nativeCur  (e.g. 1 CAD = 0.68 EUR)
  });

  // One number per checkout, passed in by the caller, so every book the
  // customer bought in one go shares it — the market-day check groups a
  // checkout's rows by this number to match them to one card payment.
  const num = saleNum || `POS-${Date.now().toString().slice(-6)}`;
  const chan = 'Book Fair';
  const notes = priceNote ? `${paymentMethod} · ${priceNote}` : paymentMethod;
  return { num, chan, qty, price: basePrice, notes, payment };
}

// Freezes the cart into posPendingSale. Shared by the desktop confirm dialog
// and Fair Mode, which records straight away.
function posPreparePendingSale() {
  // The device's own copy is still on screen from startup (showStartupPreview).
  // A sale recorded on it would be merged in once the latest copy arrives, and
  // that merge can bring back an entry another device removed meanwhile. The
  // wait is a second or two on any signal the sale could be sent on anyway.
  if (startupPreviewActive()) {
    showToast('Getting the latest figures — one moment, then try again', 'warn', 3500);
    return false;
  }
  const method = $('pos-payment-method').value;
  const rows = buildPOSCartRows();

  if (rows.length === 0) {
    showToast('Cart is empty', 'warn');
    return false;
  }

  // ⚡ Bolt Optimization: Loop fusion - Combine the `.some()` check and `.reduce()` accumulation into a single imperative loop.
  let hasMissingFx = false;
  let convertedSum = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].convertedLine === null) {
      hasMissingFx = true;
      break;
    }
    convertedSum += rows[i].convertedLine || 0;
  }

  const totalCharged = hasMissingFx
    ? rows.map((row) => `${row.sourceCode} ${row.sourceLine.toFixed(2)}`).join(' + ')
    : posFormat(convertedSum, posTransactionCurrency);

  const timestamp = new Date();
  const localeTs = timestamp.toLocaleString('en-CA');
  posPendingSale = {
    method,
    rows,
    hasMissingFx,
    totalCharged,
    currency: posTransactionCurrency,
    timestampIso: timestamp.toISOString(),
    timestampLabel: localeTs
  };
  return true;
}

function posCheckout() {
  if (!posPreparePendingSale()) return;
  const { rows, method, totalCharged, timestampLabel: localeTs } = posPendingSale;

  $('pos-confirm-items').innerHTML = rows.map((row) => {
    const lineDisplay = row.convertedLine === null ? posFormat(row.sourceLine, row.sourceCode) : posFormat(row.convertedLine, posTransactionCurrency);
    const adj = row.overridden
      ? ` <span style="font-size:var(--text-xs);color:var(--gold);">(was ${posFormat(row.listUnit, row.sourceCode)} ea)</span>`
      : '';
    return `<tr><td>${escapeHtml(row.book.title)}${adj}</td><td class="r mono-num">${row.qty}</td><td class="r mono-num">${lineDisplay}</td></tr>`;
  }).join('');
  // Last gate before the stock actually moves — repeat the shortfall here so a
  // seller who built the cart while talking to a customer still sees it.
  posRenderOversellNote('pos-confirm-oversell', posOversellSummary(posStockLines()));
  $('pos-confirm-payment').textContent = method;
  $('pos-confirm-timestamp').textContent = localeTs;
  $('pos-confirm-total').textContent = totalCharged;
  openM('pos-sale-confirm');
}

// True while a sale is being written. A second tap on Complete Sale — easy on
// a phone at a busy table — must not record the same sale twice.
let _posSaving = false;
// The most recent register sale, for Fair Mode's Undo.
let _posLastSale = null;

async function posConfirmSale() {
  if (_posSaving || !posPendingSale) return;
  _posSaving = true;
  // Taken now and cleared at once, so nothing that happens while this sale is
  // being written can pick the same cart up again.
  const sale = posPendingSale;
  posPendingSale = null;
  const saleNum = `POS-${Date.now().toString().slice(-6)}`;
  const posOnlyRows = [];
  const recordedBooks = [];
  let recorded = 0;
  const failed = [];

  try {
    // Catalogue books first, and before anything touches the network: the sale
    // is written to this device (and queued for the cloud) the moment it is
    // confirmed. It used to wait for a full catalogue reload, which on a
    // one-bar fair connection could hold a sale for as long as the signal took
    // to answer — or forever.
    for (const row of sale.rows) {
      const book = row.book;
      const qty = row.qty;

      // POS-only books never touch the catalog ledger; their tally is kept on
      // the book itself and saved with the catalogue below.
      if (isPosOnlyBook(book.id) && posExtraBooks[book.id]) {
        posOnlyRows.push(row);
        continue;
      }

      try {
        // basePrice = native-currency unit price (what flows into revenue, ledger, and Sheets)
        const basePrice = row.sourceUnit;
        const nativeCurCode = getBookCurrencyCode(book);
        // txnCurCode = the currency the customer actually paid in
        const txnCurCode = (row.convertedUnit === null) ? row.sourceCode : sale.currency;
        const isFx = txnCurCode !== nativeCurCode;
        // convertedUnitInTxnCur = unit price expressed in the txn currency
        const convertedUnitInTxnCur = (row.convertedUnit === null) ? row.sourceUnit : row.convertedUnit;

        // nativePerTxnRate: how many native units = 1 txn-currency unit.
        // Must match the direction fetchLiveRate(txnCur, nativeCur) returns,
        // which is exactly what _fxRateCache[`${txnCurCode}_${nativeCurCode}`] holds.
        let nativePerTxnRate = 1;
        if (isFx) {
          const cacheKey = `${txnCurCode}_${nativeCurCode}`;
          if (_fxRateCache[cacheKey]) {
            nativePerTxnRate = _fxRateCache[cacheKey];
          } else {
            // Derive from CAD-pivot posExchangeRates as fallback:
            // (txnCur → CAD) / (nativeCur → CAD)  = txnCur → nativeCur
            const txnToCAD = posExchangeRates[txnCurCode] || 1;
            const nativeToCAD = posExchangeRates[nativeCurCode] || 1;
            nativePerTxnRate = txnToCAD / nativeToCAD;
            _fxRateCache[cacheKey] = nativePerTxnRate;
          }
        }

        // Record a price adjustment (custom price / discount) in the ledger note.
        const priceNote = row.overridden
          ? `Price ${posFormat(row.listUnit, row.sourceCode)}→${posFormat(row.sourceUnit, row.sourceCode)}`
          : null;

        const { num, chan, notes, payment } = _posItemToManualPayload(
          book, qty, sale.method,
          basePrice, txnCurCode, convertedUnitInTxnCur, nativePerTxnRate, priceNote, saleNum
        );

        // recordOrder is the single shared sale-writing function used by manual
        // entry. It reads the active book, so point it at this row's book.
        withActiveBook(book.id, () => recordOrder(num, chan, qty, basePrice, notes, payment));
        recordedBooks.push(book.id);
        recorded++;
      } catch (error) {
        // One book failing must not take the rest of the customer's books
        // down with it, and must never be silent.
        console.error('POS: could not record a line', book?.title, error);
        failed.push(book?.title || 'a book');
      }
    }
  } finally {
    _posSaving = false;
  }

  // What Fair Mode's Undo may reverse, and nothing older.
  const lastSale = {
    saleNum,
    bookIds: recordedBooks,
    posOnly: posOnlyRows.map((row) => ({ id: row.book.id, qty: row.qty, unit: row.sourceUnit })),
    at: Date.now(),
    tail: null,
    tallied: false,
  };
  _posLastSale = lastSale;

  closeM('pos-sale-confirm');
  posCart = {};
  posPriceOverrides = {};
  renderPOS();
  renderHist();
  updateDash();
  if (typeof window.renderAllOverview === 'function') window.renderAllOverview();
  updateHeader();
  if (failed.length) {
    showToast(`⚠ Sale recorded, but ${failed.join(', ')} could not be saved — add ${failed.length === 1 ? 'it' : 'them'} by hand`, 'err', 8000);
  } else {
    showToast('✓ Sale complete', 'ok');
  }

  // POS-only books: their running tally lives in the shared catalogue, so the
  // latest copy is fetched first to avoid overwriting another device's count —
  // but only for as long as the signal allows. Their sale is not in the ledger
  // either way, so nothing above ever waits on this.
  if (posOnlyRows.length) {
    let doneTail;
    lastSale.tail = new Promise((resolve) => { doneTail = resolve; });
    try {
      await Promise.race([syncCatalog(), new Promise(resolve => setTimeout(resolve, 6000))]);
    } catch (_) { /* offline — count on what this device has */ }
    for (const row of posOnlyRows) {
      const pb = posExtraBooks[row.book.id];
      if (!pb) continue;
      pb.sold = (pb.sold || 0) + row.qty;
      pb.revenue = (pb.revenue || 0) + row.qty * row.sourceUnit;
      pb.lastSold = today();
    }
    lastSale.tallied = true;
    try { await saveCatalogWithDeletions(); } catch (e) { console.warn('POS-only tally save failed', e); }
    doneTail();
    renderPOS();
  }
  return recorded;
}

function posPrintReceipt() {
  if (!posPendingSale) return;
  const rowsHtml = posPendingSale.rows.map((row) => {
    const line = row.convertedLine === null ? posFormat(row.sourceLine, row.sourceCode) : posFormat(row.convertedLine, posPendingSale.currency);
    return `<tr><td>${escapeHtml(row.book.title)}</td><td>${row.qty}</td><td style="text-align:right;">${escapeHtml(line)}</td></tr>`;
  }).join('');
  const win = window.open('', '_blank', 'width=420,height=600');
  if (!win) return;
  win.document.write(`
    <html><head><title>POS Receipt</title><style>body{font-family:Arial,sans-serif;padding:16px;} table{width:100%;border-collapse:collapse;} td,th{padding:6px 0;border-bottom:var(--stroke-hair) solid #ddd;} .r{text-align:right;} .mt{margin-top:12px;}</style></head>
    <body>
      <h2>Lyricalmyrical Books</h2>
      <div>Timestamp: ${escapeHtml(posPendingSale.timestampLabel)}</div>
      <div>Payment: ${escapeHtml(posPendingSale.method)}</div>
      <table class="mt"><thead><tr><th>Item</th><th>Qty</th><th class="r">Line</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      <h3 class="r">Total: ${escapeHtml(posPendingSale.totalCharged)}</h3>
    </body></html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

// Called once by main.js, at the point in start-up where this code used to run
// inline: loads this device's saved exchange rates and installs the register's
// keyboard shortcuts.
function initPos() {
  posTransactionCurrency = _getPosDefaultCurrency();
  posExchangeRates = loadPosExchangeRates();
  document.addEventListener('keydown', _posKeyboardShortcuts);
  document.addEventListener('keydown', _posPriceModalKeys);
}

export {
  posCart,
  posBooksMap,
  posResolveBook,
  currencyToCode,
  convertCurrency,
  renderPOS,
  _getPosDefaultCurrency,
  _posItemToManualPayload,
  _showPosQR,
  buildPOSCartRows,
  codeToSymbol,
  fairSetAwake,
  fairTotalsText,
  getPOSCurrencies,
  isPosOnlyBook,
  loadPosExchangeRates,
  posFormat,
  posPreparePendingSale,
  renderPOSFxStatus,
  savePosExchangeRates,
  initPos,
  posSearchFilter,
  fairOpenCharge,
  fairShowQR,
  fairOpenToday,
  fairVoidSale,
  fairSetName,
  fairTileNoneLeft,
  fairOpenSummary,
  fairShareSummary,
  fairCharge,
  fairUndoLastSale,
  posPickPayment,
  posMobileView,
  posUpdateQty,
  posRemoveItem,
  openPosPriceModal,
  posPriceQuick,
  posPricePreview,
  savePosPrice,
  posResetPrice,
  copyPosQRLink,
  downloadPosQR,
  posGenerateSaleQR,
  posGenerateLineQR,
  posSetCurrency,
  fairSetCurrency,
  posConfigureRates,
  posCheckout,
  posConfirmSale,
  posPrintReceipt,
  posSyncPaymentSeg,
};
