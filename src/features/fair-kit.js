// Fair kit — the POS "Fair kit" sub-tab: the printable sales tracker (tally
// sheet), the printable payment QR sheet, the shared book list both are packed
// from, the saved fair presets, and the one-click "print the kit" that sends
// both sheets out together.
//
// Lifted out of src/main.js as one unit, verbatim. Everything it needs from the
// app is imported explicitly below. main.js and this module import from each
// other; that cycle is fine because nothing here reads a main.js import at
// module-evaluation time — the top-level statements are constants built from
// leaf-module imports and empty state, and every export is a hoisted function
// declaration called later, from a click handler or from main.js after
// start-up. The inline handlers the Fair kit markup calls are therefore put on
// window by main.js, not here.
//
// activePOSSubTab is exported as a live binding for switchTab in main.js to
// read; only switchPOSSubTab here reassigns it.
//
// eslint's no-undef (an error, checked in CI) is what keeps the import list
// honest: an identifier that isn't imported fails the build rather than
// throwing at click time.
import {
  createStripePaymentLinkForAmount,
  getReconStripeKey,
  showToast,
  switchTab,
} from '../main.js';
import { codeToSymbol, convertCurrency, currencyToCode, posBooksMap, posResolveBook } from './pos.js';
import { closeM, confirmDialog, openM, promptDialog } from '../lib/modal.js';
import { escapeHtml } from '../lib/html.js';
import { deriveOnHand } from '../lib/inventory.js';
import { computeTallyRowHeights, computeQrCardSize, estimateTallyPages, estimateQrPages } from '../lib/print-sheet-layout.js';
import {
  QR_PRESET_PRICE_CURRENCIES,
  loadQrPresets,
  saveQrPresets,
  upsertQrPreset,
  removeQrPreset,
  qrPresetMissingBooks,
  qrPresetSummary,
} from '../lib/qr-presets.js';
import {
  loadStPresets,
  saveStPresets,
  upsertStPreset,
  removeStPreset,
  stPresetId,
  stPresetMissingBooks,
  stPresetSummary,
} from '../lib/sales-tracker-presets.js';

// ── PRINTABLE SALES TRACKER ──
let salesTrackerCustomBooks = [];
// Copies of each catalog title the seller is packing for this fair, keyed by
// book id. Kept separate from the catalog record itself (never written to
// BOOKS) since "bringing" is a per-trip decision, not a stock fact.
let salesTrackerQtyBrought = {};

// Best-effort "on hand" hint shown next to the packing-quantity field, so the
// seller has a ceiling in view without the field silently capping their entry.
// Never throws: a POS-only extra book carries none of deriveOnHand's expected
// fields, and a missing hint is fine where a broken modal is not.
function _stOnHandHint(book) {
  try {
    const n = deriveOnHand(book, book);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function _stUpdatePackTotal() {
  const el = document.getElementById('st-pack-total');
  if (!el) return;
  const total = _fkPackedTotal();
  el.textContent = total > 0
    ? `📦 ${total} book${total === 1 ? '' : 's'} packed for this fair`
    : 'Enter how many copies of each title you\'re bringing.';
}

function salesTrackerQtyInput(el) {
  const qty = parseInt(el.value, 10);
  const clean = Number.isFinite(qty) && qty > 0 ? qty : 0;
  if (el.dataset.bookId) {
    if (clean > 0) salesTrackerQtyBrought[el.dataset.bookId] = clean;
    else delete salesTrackerQtyBrought[el.dataset.bookId];
  } else if (el.dataset.customIdx != null) {
    const cb = salesTrackerCustomBooks[parseInt(el.dataset.customIdx, 10)];
    if (cb) cb.qty = clean;
  }
  _fkMarkOverPacked(el);
  fairKitSelectionChanged();
}

// Bringing more copies than the stock count says you have is almost always a
// typo (40 for 4) — flag the field itself so it's caught before packing.
function _fkMarkOverPacked(el) {
  const over = _fkOverPackedBy(el);
  el.classList.toggle('fk-over', over > 0);
  el.title = over > 0 ? `That's ${over} more than you have on hand` : '';
}

function _fkOverPackedBy(el) {
  if (!el.dataset.bookId) return 0;
  const qty = parseInt(el.value, 10);
  const book = posResolveBook(el.dataset.bookId);
  const onHand = book ? _stOnHandHint(book) : null;
  if (!Number.isFinite(qty) || onHand == null) return 0;
  return Math.max(0, qty - onHand);
}

// ── FAIR KIT BOOK LIST ──
// The tally sheet and the payment QR sheet are packed off the same box of
// books, so they share one list here. Each inventory row carries both marker
// classes (.st-book-check and .qrp-book-check) and both per-book fields — the
// copies-packed count the tally sheet prints, and the door price the QR card
// charges — so every path that used to query two separate lists still selects
// exactly the books it prints, without knowing they now come from one place.
function renderFairKitBookList() {
  const list = document.getElementById('fk-books-list');
  if (!list) return;
  // posBooksMap() includes POS-only extras (publisher) or just the active book (author).
  const inventoryEntries = Object.values(posBooksMap());
  const baseCur = document.getElementById('qrp-base-cur')?.value || 'auto';
  const hasStripeKey = !!getReconStripeKey();

  const inventoryHtml = inventoryEntries.map((book) => {
    const onHand = _stOnHandHint(book);
    const nativeCode = currencyToCode(book.currency);
    const targetCode = baseCur === 'auto' ? nativeCode : baseCur;
    const defaultPrice = baseCur === 'auto'
      ? (book.listPrice || 0)
      : convertCurrency(book.listPrice || 0, nativeCode, targetCode);
    const existingOverride = book.priceOverrides?.[targetCode] || '';

    // A title with no saved payment link still belongs on the tally sheet, so
    // it stays selectable — the row says up front why no QR card will come out
    // for it, rather than the seller finding a dead square at the table.
    const hasLink = !!(book.stripeLink || book.paymentLink);
    // The status column answers one question per row — "will this title get a
    // scan-to-pay square?" — in words, so a gap is legible on the row it belongs
    // to rather than only as a number in the footer.
    const tag = hasLink
      ? '<span class="fk-tag fk-tag-ok">Ready</span>'
      : hasStripeKey
        ? '<span class="fk-tag fk-tag-gap">QR needs a door price</span>'
        : '<span class="fk-tag fk-tag-warn">Tally only · no link</span>';

    return `
      <div class="fk-book">
        <label class="fk-book-pick">
          <input type="checkbox" id="fk-pick-${book.id}" class="fk-book-check st-book-check qrp-book-check" data-kind="inv" value="${book.id}" checked onchange="fairKitSelectionChanged()">
        </label>
        <span class="fk-book-id">
          <label class="fk-book-title" for="fk-pick-${book.id}">${escapeHtml(book.title)}</label>
          ${book.author ? `<span class="fk-book-meta">${escapeHtml(book.author)}</span>` : ''}
        </span>
        <span class="fk-cell fk-field fk-cell-onhand">
          <span class="fk-cell-lab">On hand</span>
          <span class="fk-onhand">${onHand != null ? onHand : '—'}</span>
        </span>
        <span class="fk-cell fk-field fk-cell-qty">
          <label class="fk-cell-lab" for="fk-qty-${book.id}">Copies bringing</label>
          <input type="number" inputmode="numeric" min="0" step="1" class="st-book-qty" id="fk-qty-${book.id}" data-book-id="${book.id}" value="${salesTrackerQtyBrought[book.id] || ''}" placeholder="0" oninput="salesTrackerQtyInput(this)">
        </span>
        <span class="fk-cell fk-field fk-field-price">
          <label class="fk-cell-lab" for="qrp-override-${book.id}">Door price (${escapeHtml(targetCode)})</label>
          <input type="number" inputmode="decimal" step="0.01" min="0" class="qrp-override-input" id="qrp-override-${book.id}" data-book-id="${book.id}" value="${existingOverride}" placeholder="${defaultPrice.toFixed(2)}" oninput="fairKitSelectionChanged()">
        </span>
        <span class="fk-cell fk-cell-status">${tag}</span>
      </div>
    `;
  }).join('');

  const customHtml = salesTrackerCustomBooks.map((book, idx) => `
    <div class="fk-book fk-book-custom">
      <label class="fk-book-pick">
        <input type="checkbox" id="fk-pick-custom-${idx}" class="fk-book-check st-book-check" data-kind="custom" value="${idx}" checked onchange="fairKitSelectionChanged()">
      </label>
      <span class="fk-book-id">
        <label class="fk-book-title" for="fk-pick-custom-${idx}">${escapeHtml(book.title)}</label>
        ${book.author ? `<span class="fk-book-meta">${escapeHtml(book.author)}</span>` : ''}
      </span>
      <span class="fk-cell fk-field fk-cell-onhand">
        <span class="fk-cell-lab">On hand</span>
        <span class="fk-onhand">—</span>
      </span>
      <span class="fk-cell fk-field fk-cell-qty">
        <label class="fk-cell-lab" for="fk-qty-custom-${idx}">Copies bringing</label>
        <input type="number" inputmode="numeric" min="0" step="1" class="st-book-qty" id="fk-qty-custom-${idx}" data-custom-idx="${idx}" value="${book.qty || ''}" placeholder="0" oninput="salesTrackerQtyInput(this)">
      </span>
      <span class="fk-cell fk-cell-status">
        <span class="fk-tag">Tally only</span>
        <button type="button" class="fk-book-remove" onclick="salesTrackerRemoveCustom(${idx})" title="Remove" aria-label="Remove ${escapeHtml(book.title)}">✕</button>
      </span>
    </div>
  `).join('');

  if (!inventoryEntries.length && !salesTrackerCustomBooks.length) {
    list.innerHTML = `
      <div class="fk-empty">
        <span class="fk-empty-art" aria-hidden="true">📦</span>
        <span class="fk-empty-title">Nothing to pack yet</span>
        <span class="fk-empty-note">Your catalog is empty for this account. Use <b>Add a title that isn&rsquo;t in your catalog</b> just below to put a book on the tally sheet.</span>
      </div>`;
  } else {
    list.innerHTML = inventoryHtml + customHtml;
    list.querySelectorAll('.st-book-qty[data-book-id]').forEach(_fkMarkOverPacked);
  }
  fairKitSelectionChanged();
}

// Both sheets render from the same list now. The two old names stay because the
// preset-restore paths and the base-currency selector call them by name, and
// each still means "rebuild the list the sheet I print from reads".
function renderSalesTrackerBookList() { renderFairKitBookList(); }
function renderQRPrintBookList() { renderFairKitBookList(); }

// ── WHAT THE KIT IS ABOUT TO PRINT ──
function fairKitMode() {
  const picked = document.querySelector('input[name="fk-mode"]:checked');
  return picked ? picked.value : 'both';
}

// A selected title only yields a QR card if something can actually be charged:
// a saved payment link, or a door price this device's Stripe key can mint a
// link for. Counting checkboxes instead would promise cards that never print.
function _fkBookPrintsQR(book, id, hasStripeKey) {
  // A row whose title has since left the catalog can't be priced or charged —
  // and would throw building the card, taking the whole sheet down with it.
  if (!book) return false;
  if (book.stripeLink || book.paymentLink) return true;
  const amount = parseFloat(document.getElementById(`qrp-override-${id}`)?.value);
  return hasStripeKey && Number.isFinite(amount) && amount > 0;
}

function _fkSelectionCounts() {
  const checked = (kind) => Array.from(document.querySelectorAll(`.st-book-check[data-kind="${kind}"]`)).filter((el) => el.checked);
  const inv = checked('inv');
  const custom = checked('custom');
  const hasStripeKey = !!getReconStripeKey();
  const qrCards = inv.filter((el) => _fkBookPrintsQR(posResolveBook(el.value), el.value, hasStripeKey)).length;
  return {
    titles: inv.length + custom.length,
    qrCards,
    // Custom titles have no catalog record and no payment link, so they are
    // always part of the "tally sheet only" remainder.
    noCard: (inv.length - qrCards) + custom.length,
  };
}

function _fkPackedTotal() {
  let total = 0;
  document.querySelectorAll('.st-book-qty').forEach((input) => {
    const n = parseInt(input.value, 10);
    if (Number.isFinite(n) && n > 0) total += n;
  });
  return total;
}

function _fkUpdateSummary() {
  const el = document.getElementById('fk-summary');
  const btn = document.getElementById('fk-print-btn');
  if (!el) return;

  const mode = fairKitMode();
  const { titles, qrCards, noCard } = _fkSelectionCounts();
  const packed = _fkPackedTotal();

  // One stat block per sheet rather than a run-on sentence: the number that
  // decides whether the print is right — titles, copies, cards — is the thing
  // the eye lands on, with the sheet it belongs to labelled above it.
  const stat = (label, value, note) => `
    <div class="fk-stat">
      <span class="fk-stat-lab">${label}</span>
      <b class="fk-stat-val">${value}</b>
      ${note ? `<span class="fk-stat-note">${note}</span>` : ''}
    </div>`;

  // Page counts come from the same maths the print uses, so "2 pages" here is
  // what actually comes out of the printer.
  const pagesLabel = (n) => (n > 1 ? `${n} pages` : 'Fits on 1 page');
  const tallyPages = estimateTallyPages(titles, { includeNotes: !!document.getElementById('st-notes')?.checked });
  const qrCols = Math.max(1, Math.min(6, parseInt(document.getElementById('qrp-cols')?.value, 10) || 3));
  const qrPages = estimateQrPages({
    count: qrCards,
    cols: Math.min(qrCards >= 9 && document.getElementById('qrp-fit-one-page')?.checked ? Math.max(qrCols, 4) : qrCols, qrCards),
    fitOnePage: !!document.getElementById('qrp-fit-one-page')?.checked,
    priceRows: _qrpSelectedPriceCurrencies().length,
  });

  const parts = [];
  if (mode !== 'qr') {
    parts.push(stat(
      'Tally sheet',
      `${titles} title${titles === 1 ? '' : 's'}`,
      [packed > 0
        ? `${packed} cop${packed === 1 ? 'y' : 'ies'} packed`
        : 'No copies entered yet', titles ? pagesLabel(tallyPages) : ''].filter(Boolean).join(' · '),
    ));
    const overPacked = Array.from(document.querySelectorAll('.st-book-qty'))
      .filter((input) => input.closest('.fk-book')?.querySelector('.st-book-check')?.checked && _fkOverPackedBy(input) > 0).length;
    if (overPacked > 0) {
      parts.push(`
        <div class="fk-flag">
          <span aria-hidden="true">⚠</span>
          <span>${overPacked} title${overPacked === 1 ? ' is' : 's are'} set to bring more copies than you have on hand.</span>
        </div>`);
    }
  }
  if (mode !== 'tracker') {
    parts.push(stat('QR sheet', `${qrCards} card${qrCards === 1 ? '' : 's'}`, qrCards ? pagesLabel(qrPages) : ''));
    // Named on the spot, with a way to jump straight to the row that needs
    // fixing — a count on its own leaves the seller hunting the list for it.
    if (noCard > 0) {
      parts.push(`
        <div class="fk-flag">
          <span aria-hidden="true">⚠</span>
          <span>${noCard} title${noCard === 1 ? '' : 's'} without a payment link or a door price won’t get a card.
            <button type="button" class="fk-flag-link" onclick="fkFocusFirstGap()">Show me</button>
          </span>
        </div>`);
    }
  }

  const nothingToPrint = mode === 'qr' ? qrCards === 0 : titles === 0;
  el.innerHTML = nothingToPrint
    ? `<div class="fk-stat-empty">${mode === 'qr'
      ? 'None of the selected titles has a payment link or a door price yet.'
      : 'Select at least one book to print.'}</div>`
    : parts.join('');
  if (btn) btn.disabled = nothingToPrint;
}

// Every checkbox, quantity and door price in the dialog funnels through here so
// the footer's read-out is never a step behind what will actually print.
function fairKitSelectionChanged() {
  _stUpdatePackTotal();
  _fkUpdateSummary();
}

function fairKitModeChanged() {
  const mode = fairKitMode();
  const trackerOpts = document.getElementById('fk-opts-tracker');
  const qrOpts = document.getElementById('fk-opts-qr');
  // Hide the settings for a sheet that isn't being printed rather than dimming
  // them: a visible-but-inert control is the one people fill in and then wonder
  // why nothing changed.
  if (trackerOpts) trackerOpts.hidden = mode === 'qr';
  if (qrOpts) qrOpts.hidden = mode === 'tracker';

  // Same rule inside the book list: a door price means nothing on a tally-only
  // print, and copies packed means nothing on a QR-only one. The shell carries
  // the same two classes so the column headings drop out with their columns.
  const list = document.getElementById('fk-books-list');
  if (list) {
    list.classList.toggle('fk-hide-price', mode === 'tracker');
    list.classList.toggle('fk-hide-qty', mode === 'qr');
  }
  const shell = document.querySelector('.fk-list-shell');
  if (shell) {
    shell.classList.toggle('fk-hide-price', mode === 'tracker');
    shell.classList.toggle('fk-hide-qty', mode === 'qr');
  }

  // The preview only shows the sheets that are actually coming out.
  const tallySheet = document.getElementById('fk-sheet-tally');
  const qrSheet = document.getElementById('fk-sheet-qr');
  if (tallySheet) tallySheet.hidden = mode === 'qr';
  if (qrSheet) qrSheet.hidden = mode === 'tracker';

  const btn = document.getElementById('fk-print-btn');
  if (btn) {
    btn.textContent = mode === 'both'
      ? '🖨 Print both sheets'
      : mode === 'tracker' ? '🖨 Print tally sheet' : '🖨 Print QR sheet';
  }
  _fkUpdateSummary();
}

// ── SALES TRACKER FAIR PRESETS ──
// Same idea as the QR sheet's fair presets: the whole tracker setup — layout,
// currency, which titles, and how many copies of each are packed — saved
// under a fair's name so a recurring event doesn't get rebuilt from scratch.
// localStorage, not Firestore: a per-device packing list that has to work
// with no signal.
let salesTrackerFairPresets = [];

function _stPresetStore() {
  try { return window.localStorage; } catch { return null; }
}

function _stReadPresetForm(name) {
  const qtyBrought = {};
  document.querySelectorAll('.st-book-qty[data-book-id]').forEach((el) => {
    const qty = parseInt(el.value, 10);
    if (el.dataset.bookId && Number.isFinite(qty) && qty > 0) qtyBrought[el.dataset.bookId] = qty;
  });

  const checkedCustomIdx = new Set(
    Array.from(document.querySelectorAll('.st-book-check[data-kind="custom"]'))
      .filter((el) => el.checked)
      .map((el) => parseInt(el.value, 10))
  );
  const customBooks = salesTrackerCustomBooks.filter((_, idx) => checkedCustomIdx.has(idx));

  return {
    name,
    cols: document.getElementById('st-cols')?.value,
    currencyCode: document.getElementById('st-currency')?.value || 'EUR',
    includeNotes: !!document.getElementById('st-notes')?.checked,
    bookIds: Array.from(document.querySelectorAll('.st-book-check[data-kind="inv"]'))
      .filter((el) => el.checked)
      .map((el) => el.value),
    qtyBrought,
    customBooks,
    savedAt: new Date().toISOString(),
  };
}

function _stApplyPresetToForm(preset) {
  if (!preset) return { missing: [] };

  const colsEl = document.getElementById('st-cols');
  if (colsEl) colsEl.value = String(preset.cols);

  const curEl = document.getElementById('st-currency');
  if (curEl) {
    curEl.value = Array.from(curEl.options).some((o) => o.value === preset.currencyCode) ? preset.currencyCode : 'EUR';
  }

  const notesEl = document.getElementById('st-notes');
  if (notesEl) notesEl.checked = !!preset.includeNotes;

  // Custom titles aren't in the catalog, so restoring a preset recreates them
  // wholesale rather than trying to look them up by id.
  salesTrackerCustomBooks = preset.customBooks.map((b) => ({ ...b }));
  salesTrackerQtyBrought = { ...preset.qtyBrought };

  renderSalesTrackerBookList();

  const wantedBooks = new Set(preset.bookIds);
  document.querySelectorAll('.st-book-check[data-kind="inv"]').forEach((el) => {
    el.checked = wantedBooks.has(el.value);
  });
  // Every custom title just restored from the preset is exactly what should print.
  document.querySelectorAll('.st-book-check[data-kind="custom"]').forEach((el) => { el.checked = true; });

  _stUpdatePackTotal();

  return { missing: stPresetMissingBooks(preset, Object.keys(posBooksMap())) };
}

let activePOSSubTab = 'register';

function switchPOSSubTab(subTabName) {
  activePOSSubTab = subTabName || 'register';
  const subTabs = ['register', 'fairkit'];
  subTabs.forEach((tab) => {
    const btn = document.getElementById('btn-pos-subtab-' + tab);
    const sec = document.getElementById('pos-subpanel-' + tab);
    if (btn && sec) {
      if (tab === activePOSSubTab) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        btn.setAttribute('tabindex', '0');
        sec.style.display = 'block';
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
        btn.setAttribute('tabindex', '-1');
        sec.style.display = 'none';
      }
    }
  });

  const mFk = document.getElementById('m-fair-kit');
  if (mFk) {
    mFk.style.display = 'block';
    mFk.classList.remove('closing');
  }

  if (activePOSSubTab === 'fairkit') {
    salesTrackerFairPresets = loadStPresets(_stPresetStore());
    qrFairPresets = loadQrPresets(_qrPresetStore());
    renderFairKitBookList();
    renderFairKitPresetPicker();
    fairKitModeChanged();
  }
}

function fairKitSearchFilter(query) {
  const q = (query || '').toLowerCase().trim();
  document.querySelectorAll('#fk-books-list .fk-book').forEach((card) => {
    const title = card.querySelector('.fk-book-title')?.textContent?.toLowerCase() || '';
    const meta = card.querySelector('.fk-book-meta')?.textContent?.toLowerCase() || '';
    const match = !q || title.includes(q) || meta.includes(q);
    card.style.display = match ? '' : 'none';
  });
}

function openFairKitModal() {
  salesTrackerFairPresets = loadStPresets(_stPresetStore());
  qrFairPresets = loadQrPresets(_qrPresetStore());
  renderFairKitBookList();
  renderFairKitPresetPicker();
  fairKitModeChanged();
  switchTab('pos');
  switchPOSSubTab('fairkit');
  openM('fair-kit');
}

// The two printables used to have a button each. Anything still pointing at
// either one lands on the combined dialog rather than a modal that no longer
// exists.

function fairKitSelectAll(checked) {
  document.querySelectorAll('.st-book-check').forEach((el) => { el.checked = !!checked; });
  fairKitSelectionChanged();
}

// "2 titles won't get a card" is only useful if the seller can find them. This
// walks the list in the order it is printed and puts the cursor in the first
// door-price box that would fix one, so the gap is repaired where it was read.
function fkFocusFirstGap() {
  const hasStripeKey = !!getReconStripeKey();
  const gap = Array.from(document.querySelectorAll('.st-book-check[data-kind="inv"]'))
    .find((el) => el.checked && !_fkBookPrintsQR(posResolveBook(el.value), el.value, hasStripeKey));
  const row = gap?.closest('.fk-book');
  if (!row) return;

  const field = document.getElementById(`qrp-override-${gap.value}`);
  row.scrollIntoView({ block: 'center' });
  (field || gap).focus({ preventScroll: true });

  row.classList.add('fk-book-flagged');
  setTimeout(() => row.classList.remove('fk-book-flagged'), 2000);
}

function salesTrackerAddCustom() {
  const titleEl = document.getElementById('st-custom-title');
  const authorEl = document.getElementById('st-custom-author');
  const qtyEl = document.getElementById('st-custom-qty');
  const title = (titleEl.value || '').trim();
  const author = (authorEl.value || '').trim();
  const qty = parseInt(qtyEl?.value, 10);
  if (!title) {
    showToast('Enter a book title', 'warn');
    titleEl.focus();
    return;
  }
  salesTrackerCustomBooks.push({ title, author, qty: Number.isFinite(qty) && qty > 0 ? qty : 0 });
  titleEl.value = '';
  authorEl.value = '';
  if (qtyEl) qtyEl.value = '';
  renderSalesTrackerBookList();
  titleEl.focus();
}

function salesTrackerRemoveCustom(idx) {
  salesTrackerCustomBooks.splice(idx, 1);
  renderSalesTrackerBookList();
}

// escapeHtml is imported from ./lib/html.js

// Returns true once the sheet is on its way to a print window, false if it
// bailed — printFairKit() needs to know, so a tally sheet that never opened
// doesn't leave a stray blank QR window behind it.
// Same shape as computeQrSheetLayoutSizes() below: a pure lookup from row
// count to the font/spacing tier that keeps the printed sheet on one page.
function computeSalesTrackerLayoutSizes(visualRows, includeNotes) {
  let rowHeight = 56;
  let priceRowHeight = 28;
  let thHeight = 32;
  let titleFontSize = '11.5pt';
  let authorFontSize = '9pt';
  let packedFontSize = '8.5pt';
  let thFontSize = '11pt';
  let metaFontSize = '12pt';
  let metaGap = '36px';
  let grandBoxW = '110px';
  let grandBoxH = '44px';
  let grandLabelFontSize = '14pt';
  let grandMarginTop = '18px';

  if (visualRows === 1) {
    rowHeight = 220;
    thHeight = 44;
    titleFontSize = '18pt';
    authorFontSize = '12.5pt';
    packedFontSize = '11.5pt';
    thFontSize = '13pt';
    metaFontSize = '13.5pt';
    metaGap = '48px';
    grandBoxW = '140px';
    grandBoxH = '56px';
    grandLabelFontSize = '16pt';
    grandMarginTop = '28px';
  } else if (visualRows === 2) {
    rowHeight = 150;
    priceRowHeight = 50;
    thHeight = 40;
    titleFontSize = '15pt';
    authorFontSize = '11pt';
    packedFontSize = '10.5pt';
    thFontSize = '12pt';
    metaFontSize = '13pt';
    metaGap = '42px';
    grandBoxW = '130px';
    grandBoxH = '50px';
    grandLabelFontSize = '15pt';
    grandMarginTop = '24px';
  } else if (visualRows <= 4) {
    rowHeight = 100;
    priceRowHeight = 38;
    thHeight = 36;
    titleFontSize = '13.5pt';
    authorFontSize = '10pt';
    packedFontSize = '9.5pt';
    thFontSize = '11.5pt';
    metaFontSize = '12.5pt';
    metaGap = '38px';
    grandBoxW = '120px';
    grandBoxH = '46px';
    grandLabelFontSize = '14.5pt';
    grandMarginTop = '20px';
  } else if (visualRows <= 6) {
    rowHeight = 75;
    priceRowHeight = 32;
    thHeight = 32;
    titleFontSize = '12pt';
    authorFontSize = '9.5pt';
    packedFontSize = '9pt';
    thFontSize = '11pt';
  } else if (visualRows <= 9) {
    rowHeight = 56;
    priceRowHeight = 28;
    thHeight = 32;
    titleFontSize = '11.5pt';
    authorFontSize = '9pt';
    packedFontSize = '8.5pt';
    thFontSize = '11pt';
  } else if (visualRows <= 14) {
    rowHeight = 42;
    priceRowHeight = 24;
    thHeight = 28;
    titleFontSize = '10.5pt';
    authorFontSize = '8.5pt';
    packedFontSize = '8pt';
    thFontSize = '10pt';
    grandBoxW = '100px';
    grandBoxH = '38px';
    grandLabelFontSize = '13pt';
    grandMarginTop = '14px';
  } else {
    rowHeight = 32;
    priceRowHeight = 20;
    thHeight = 24;
    titleFontSize = '9.5pt';
    authorFontSize = '8pt';
    packedFontSize = '7.5pt';
    thFontSize = '9.5pt';
    grandBoxW = '90px';
    grandBoxH = '32px';
    grandLabelFontSize = '12pt';
    grandMarginTop = '10px';
  }

  return {
    rowHeight, priceRowHeight, thHeight, titleFontSize, authorFontSize, packedFontSize,
    thFontSize, metaFontSize, metaGap, grandBoxW, grandBoxH, grandLabelFontSize, grandMarginTop,
    effectiveTallyRowHeight: includeNotes ? Math.max(32, Math.round(rowHeight * 0.95)) : rowHeight,
    effectivePriceRowHeight: priceRowHeight,
  };
}

function printSalesTracker(opts = {}) {
  const closeModal = opts.closeModal !== false;
  const eventName = (document.getElementById('st-event').value || '').trim();
  const dateValue = (document.getElementById('st-date').value || '').trim();
  let cols = parseInt(document.getElementById('st-cols').value, 10);
  if (!cols || cols < 1) cols = 10;
  if (cols > 30) cols = 30;

  const currencyCode = document.getElementById('st-currency').value || 'EUR';
  const currencySymbol = codeToSymbol(currencyCode);

  const selected = Array.from(document.querySelectorAll('.st-book-check'))
    .filter((el) => el.checked)
    .map((el) => ({ kind: el.dataset.kind, value: el.value }));

  if (!selected.length) {
    showToast('Select at least one book to include', 'warn');
    return false;
  }

  const includeNotes = !!document.getElementById('st-notes').checked;

  const dateLabel = dateValue
    ? new Date(dateValue + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const colHeaders = Array.from({ length: cols }, (_, i) => `<th class="num">${i + 1}</th>`).join('');

  const selectedBooks = selected.map((sel) => {
    if (sel.kind === 'custom') {
      const cb = salesTrackerCustomBooks[parseInt(sel.value, 10)];
      if (!cb) return null;
      return { title: cb.title, author: cb.author || '', qty: Number(cb.qty) || 0 };
    }
    const book = posResolveBook(sel.value);
    if (!book) return null;
    return { title: book.title, author: book.author || '', qty: Number(salesTrackerQtyBrought[sel.value]) || 0 };
  }).filter(Boolean);

  // ⚡ Bolt: Imperative loops instead of .reduce() avoid array allocations in rendering functions
  let totalPacked = 0;
  for (const b of selectedBooks) {
    totalPacked += b.qty;
  }

  const bookRows = selectedBooks.map(({ title, author, qty }) => {
    const packedNote = qty > 0 ? `<div class="title-packed">Packed: ${qty}</div>` : '';
    const tallyCells = Array.from({ length: cols }, () => '<td class="tally"></td>').join('');
    if (includeNotes) {
      const priceCells = Array.from({ length: cols }, () => '<td class="price-paid"></td>').join('');
      return `
        <tr>
          <td class="title" rowspan="2">
            <div class="title-name">${escapeHtml(title)}</div>
            ${author ? `<div class="title-meta">${escapeHtml(author)}</div>` : ''}
            ${packedNote}
          </td>
          ${tallyCells}
          <td class="total" rowspan="2"></td>
        </tr>
        <tr class="price-row">
          ${priceCells}
        </tr>
      `;
    }
    return `
      <tr>
        <td class="title">
          <div class="title-name">${escapeHtml(title)}</div>
          ${author ? `<div class="title-meta">${escapeHtml(author)}</div>` : ''}
          ${packedNote}
        </td>
        ${tallyCells}
        <td class="total"></td>
      </tr>
    `;
  }).join('');

  const numBooks = selectedBooks.length;
  const visualRows = numBooks * (includeNotes ? 2 : 1);

  const {
    thHeight, titleFontSize, authorFontSize, packedFontSize,
    thFontSize, metaFontSize, metaGap, grandBoxW, grandBoxH, grandLabelFontSize, grandMarginTop,
  } = computeSalesTrackerLayoutSizes(visualRows, includeNotes);
  // Row heights come from the page itself so a short list fills the sheet and
  // a long one flows onto extra pages (header repeats) instead of overflowing.
  const { tallyRowHeight: effectiveTallyRowHeight, priceRowHeight: effectivePriceRowHeight } =
    computeTallyRowHeights(numBooks, { includeNotes, thHeight });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Book Sales Tracker${eventName ? ' — ' + escapeHtml(eventName) : ''}</title>
    <style>
      @page { size: letter landscape; margin: 0.4in; }
      * { box-sizing: border-box; }
      html, body { background: #fff; color: #17130f; margin: 0; padding: 0; }
      body {
        font-family: "Archivo", "Helvetica Neue", Helvetica, Arial, sans-serif;
        padding: 0.2in;
        min-height: calc(100vh - 0.4in);
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
      }
      .header { text-align: center; margin-bottom: 14px; border-bottom: 2px solid #17130f; padding-bottom: 8px; }
      .header h1 { margin: 0; font-family: "Anton", Impact, sans-serif; font-size: 26pt; font-weight: 800; letter-spacing: .035em; text-transform: uppercase; }
      .meta { display: flex; gap: ${metaGap}; margin-bottom: 12px; font-size: ${metaFontSize}; }
      .meta-row { flex: 1; display: flex; align-items: baseline; gap: 8px; border-bottom: 1.5px solid #17130f; padding-bottom: 4px; min-height: 1.4em; }
      .meta-row .label { font-weight: 800; }
      .meta-row .value { flex: 1; font-weight: 500; min-height: 1.2em; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1.2px solid #17130f; padding: 0; }
      thead th { background: #e8e1d6; font-size: ${thFontSize}; font-weight: 800; text-align: center; height: ${thHeight}px; padding: 4px; text-transform: uppercase; letter-spacing: .04em; }
      thead th.title-col { text-align: left; padding-left: 10px; width: 22%; }
      thead th.total-col { background: #e6b4a8; width: 80px; }
      td.title { padding: 8px 10px; vertical-align: middle; }
      td.title .title-name { font-family: "Anton", Impact, sans-serif; font-weight: 700; font-size: ${titleFontSize}; line-height: 1.2; text-transform: uppercase; letter-spacing: .02em; }
      td.title .title-meta { font-size: ${authorFontSize}; color: #555; margin-top: 2px; }
      td.title .title-packed { font-size: ${packedFontSize}; font-weight: 700; color: #654400; margin-top: 2px; }
      thead { display: table-header-group; }
      tbody tr { break-inside: avoid; page-break-inside: avoid; }
      td.tally { background: #fff; height: ${effectiveTallyRowHeight}px; }
      td.total { background: #f4ded8; height: ${effectiveTallyRowHeight}px; }
      td.price-paid { background: #fafafa; height: ${effectivePriceRowHeight}px; font-size: 9pt; color: #666; text-align: center; vertical-align: middle; }
      tr.price-row td.price-paid::before { content: "${escapeHtml(currencySymbol)} ___"; color: #bbb; font-size: 8pt; }
      tfoot td { border: none; padding-top: 14px; }
      .grand-row { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: ${grandMarginTop}; }
      .grand-label { font-size: ${grandLabelFontSize}; font-weight: 800; }
      .grand-box { width: ${grandBoxW}; height: ${grandBoxH}; border: 2px solid #17130f; background: #f4ded8; }
      @media print {
        body { padding: 0; min-height: 100%; }
      }
    </style>
    </head><body>
      <div class="header"><h1>Book Sales Tracker</h1></div>
      <div class="meta">
        <div class="meta-row"><span class="label">Event:</span><span class="value">${eventName ? escapeHtml(eventName) : '&nbsp;'}</span></div>
        <div class="meta-row"><span class="label">Date:</span><span class="value">${dateLabel ? escapeHtml(dateLabel) : '&nbsp;'}</span></div>
        ${totalPacked > 0 ? `<div class="meta-row"><span class="label">Packed:</span><span class="value">${totalPacked} book${totalPacked === 1 ? '' : 's'}</span></div>` : ''}
      </div>
      <table>
        <thead>
          <tr>
            <th class="title-col">Book Title</th>
            ${colHeaders}
            <th class="total-col">TOTAL</th>
          </tr>
        </thead>
        <tbody>${bookRows}</tbody>
      </table>
      <div class="grand-row">
        <div class="grand-label">GRAND TOTAL</div>
        <div class="grand-box"></div>
      </div>
    </body></html>`;

  const win = window.open('', '_blank', 'width=1100,height=800');
  if (!win) {
    showToast('Pop-up blocked — allow pop-ups to print', 'warn');
    return false;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 350);
  if (closeModal) closeM('fair-kit');
  return true;
}

// ── PRINTABLE PAYMENT QR CODES ──

// The price columns a QR card can print, paired with their checkbox ids. One
// list drives the sheet, the preset snapshot and the preset restore, so adding
// a currency here is the only edit needed to offer it everywhere.
const QRP_PRICE_CHECKBOXES = QR_PRESET_PRICE_CURRENCIES.map((code) => ({
  code,
  id: `qrp-show-${code.toLowerCase()}`,
}));

function _qrpSelectedPriceCurrencies() {
  return QRP_PRICE_CHECKBOXES
    .filter(({ id }) => !!document.getElementById(id)?.checked)
    .map(({ code }) => code);
}

// ── QR FAIR PRESETS ──
// The QR half of a saved fair — layout, base currency, price columns, selected
// titles and their door prices. Stored in localStorage rather than Firestore
// because it's a per-device stall setup, and because the modal has to work with
// no signal at the table. Its tally-sheet twin lives above; the fair-kit preset
// functions further down save, load and delete the pair as one named fair.
let qrFairPresets = [];

function _qrPresetStore() {
  try { return window.localStorage; } catch { return null; }
}

// Snapshot the modal exactly as it stands, including any override the seller
// typed but hasn't printed yet.
function _qrReadPresetForm(name) {
  const overrides = {};
  document.querySelectorAll('.qrp-override-input').forEach((el) => {
    const amount = parseFloat(el.value);
    if (el.dataset.bookId && Number.isFinite(amount) && amount > 0) {
      overrides[el.dataset.bookId] = amount;
    }
  });
  return {
    name,
    cols: document.getElementById('qrp-cols')?.value,
    baseCur: document.getElementById('qrp-base-cur')?.value || 'auto',
    currencies: _qrpSelectedPriceCurrencies(),
    fitOnePage: !!document.getElementById('qrp-fit-one-page')?.checked,
    bookIds: Array.from(document.querySelectorAll('.qrp-book-check'))
      .filter((el) => el.checked)
      .map((el) => el.value),
    overrides,
    savedAt: new Date().toISOString(),
  };
}

function _qrApplyPresetToForm(preset) {
  if (!preset) return { missing: [] };

  const colsEl = document.getElementById('qrp-cols');
  if (colsEl) colsEl.value = String(preset.cols);

  // A preset saved with a base currency the select no longer offers would
  // silently keep the previous selection, so fall back to per-book native
  // rather than print prices in a currency nobody chose.
  const baseEl = document.getElementById('qrp-base-cur');
  if (baseEl) {
    const wantedBase = preset.baseCur || 'auto';
    baseEl.value = Array.from(baseEl.options).some((o) => o.value === wantedBase) ? wantedBase : 'auto';
  }

  QRP_PRICE_CHECKBOXES.forEach(({ code, id }) => {
    const el = document.getElementById(id);
    if (el) el.checked = preset.currencies.includes(code);
  });

  const fitEl = document.getElementById('qrp-fit-one-page');
  if (fitEl) fitEl.checked = !!preset.fitOnePage;

  // Rebuild the list against the current base currency first, then impose the
  // preset's selection on top — the fresh render defaults every book with a
  // payment link to checked, which is not what the preset asked for.
  renderQRPrintBookList();

  const wantedBooks = new Set(preset.bookIds);
  document.querySelectorAll('.qrp-book-check').forEach((el) => {
    el.checked = wantedBooks.has(el.value);
  });
  document.querySelectorAll('.qrp-override-input').forEach((el) => {
    const amount = preset.overrides[el.dataset.bookId];
    el.value = Number.isFinite(amount) && amount > 0 ? String(amount) : '';
  });

  return { missing: qrPresetMissingBooks(preset, Object.keys(posBooksMap())) };
}

// ── FAIR KIT PRESETS ──
// One name, both sheets. The two stores stay separate on disk — each still
// normalizes and repairs its own shape, and fairs saved before the sheets were
// merged still load — but the dialog saves, recalls and deletes them as a
// single fair, because that's the only way the seller ever thought of them.
let fkActivePresetId = '';

// Pair the two stores up by id. A fair saved from this dialog has both halves;
// one saved by an older build has whichever half it was set up in, and still
// restores that half rather than being hidden or dropped.
function fairKitPresets() {
  const byId = new Map();
  salesTrackerFairPresets.forEach((p) => byId.set(p.id, { id: p.id, name: p.name, st: p, qr: null }));
  qrFairPresets.forEach((p) => {
    const entry = byId.get(p.id);
    if (entry) entry.qr = p;
    else byId.set(p.id, { id: p.id, name: p.name, st: null, qr: p });
  });
  return Array.from(byId.values())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function findFairKitPreset(id) {
  const target = stPresetId(id);
  if (!target) return null;
  return fairKitPresets().find((p) => p.id === target) || null;
}

// "9 titles · 64 packed · EUR · 10 cols" for the tally half, the QR half on its
// own line, so a fair that only ever had one of them says so plainly.
function fairKitPresetSummary(entry) {
  if (!entry) return '';
  const lines = [];
  if (entry.st) lines.push(`Tally: ${stPresetSummary(entry.st)}`);
  if (entry.qr) lines.push(`QR: ${qrPresetSummary(entry.qr)}`);
  return lines.join(' · ');
}

function renderFairKitPresetPicker() {
  const select = document.getElementById('fk-preset-select');
  if (!select) return;

  const presets = fairKitPresets();
  if (!presets.some((p) => p.id === fkActivePresetId)) fkActivePresetId = '';

  const options = presets
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
    .join('');
  select.innerHTML = `<option value="">${presets.length ? 'Choose a saved fair…' : 'No saved fairs yet'}</option>${options}`;
  select.value = fkActivePresetId;

  const deleteBtn = document.getElementById('fk-preset-delete');
  if (deleteBtn) deleteBtn.disabled = !fkActivePresetId;

  // The loaded fair's name rides on the button, so it's obvious at a glance
  // which setup (and whose door prices) is about to print.
  const btnLabel = document.getElementById('fk-preset-btn-label');
  if (btnLabel) {
    const loaded = presets.find((p) => p.id === fkActivePresetId);
    btnLabel.textContent = loaded ? loaded.name : 'Saved fairs';
    document.getElementById('fk-preset-btn')?.setAttribute('aria-label', loaded ? `Saved fairs — ${loaded.name} loaded` : 'Saved fairs');
  }

  const note = document.getElementById('fk-preset-note');
  if (note) {
    const active = presets.find((p) => p.id === fkActivePresetId);
    note.textContent = active
      ? fairKitPresetSummary(active)
      : 'Set the whole kit up once, save it under the fair\'s name, and recall it next time.';
  }
}

function fkPresetSelected(id) {
  const entry = findFairKitPreset(id);
  fkActivePresetId = entry ? entry.id : '';
  if (!entry) { renderFairKitPresetPicker(); return; }

  // Tally first, QR second. Both halves of a fair saved here hold the same book
  // selection, and the QR half is the one that re-renders the list against its
  // own base currency and then puts the door prices back.
  const missing = new Set();
  if (entry.st) _stApplyPresetToForm(entry.st).missing.forEach((bookId) => missing.add(bookId));
  if (entry.qr) _qrApplyPresetToForm(entry.qr).missing.forEach((bookId) => missing.add(bookId));

  renderFairKitPresetPicker();
  fairKitSelectionChanged();

  if (missing.size) {
    showToast(`Loaded "${entry.name}" — ${missing.size} saved title${missing.size === 1 ? '' : 's'} no longer in the catalog`, 'warn', 6000);
  } else {
    showToast(`✓ Loaded fair "${entry.name}"`, 'ok');
  }
}

async function fkSaveFairPreset() {
  const active = findFairKitPreset(fkActivePresetId);
  const name = (await promptDialog(
    'Name this fair so you can recall the whole kit next time — the titles, how many copies you packed, the door prices and both sheet layouts.',
    active?.name || '',
    { title: 'Save fair', okLabel: 'Save', placeholder: 'e.g. Mexico City Book Fair' }
  ) || '').trim();
  if (!name) return;

  if (!stPresetId(name)) {
    showToast('Give the fair a name with at least one letter or number', 'warn');
    return;
  }

  // Same name = same fair: overwriting is the intent, but it's destructive
  // enough (last year's door prices) to confirm first.
  const clash = findFairKitPreset(name);
  if (clash && !(await confirmDialog(`"${clash.name}" already exists. Replace it with the current setup?`, { okLabel: 'Replace' }))) {
    return;
  }

  const stSnapshot = _stReadPresetForm(name);
  const qrSnapshot = _qrReadPresetForm(name);
  if (!stSnapshot.bookIds.length && !stSnapshot.customBooks.length
    && !(await confirmDialog('No books are selected. Save this fair anyway?', { okLabel: 'Save' }))) {
    return;
  }

  salesTrackerFairPresets = saveStPresets(_stPresetStore(), upsertStPreset(salesTrackerFairPresets, stSnapshot));
  qrFairPresets = saveQrPresets(_qrPresetStore(), upsertQrPreset(qrFairPresets, qrSnapshot));
  fkActivePresetId = stPresetId(name);
  renderFairKitPresetPicker();
  showToast(`✓ Saved fair "${name}"`, 'ok');
}

async function fkDeleteFairPreset() {
  const entry = findFairKitPreset(fkActivePresetId);
  if (!entry) return;
  if (!(await confirmDialog(`Delete the saved fair "${entry.name}"?`, { danger: true, okLabel: 'Delete' }))) return;

  // Delete both halves under this name, including a stray half left behind by a
  // build that only knew about one of the sheets.
  salesTrackerFairPresets = saveStPresets(_stPresetStore(), removeStPreset(salesTrackerFairPresets, entry.id));
  qrFairPresets = saveQrPresets(_qrPresetStore(), removeQrPreset(qrFairPresets, entry.id));
  fkActivePresetId = '';
  renderFairKitPresetPicker();
  showToast(`Deleted "${entry.name}"`, 'ok');
}

// Opens the window the QR sheet will be written into. Split out because in the
// combined flow it has to happen inside the click, before any await: a
// window.open() after an await is a pop-up the browser can't trace back to a
// user gesture, and it gets blocked.
function _fkOpenQrPrintWindow() {
  const win = window.open('', '_blank', 'width=1100,height=800');
  if (!win) return null;
  win.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preparing payment QR codes…</title></head><body style="font-family:Archivo,Arial,sans-serif;background:#f5f0e7;color:#17130f;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;border:2px solid #17130f;padding:28px;box-shadow:6px 6px 0 #17130f;"><div style="font-family:Anton,Impact,sans-serif;font-size:15px;letter-spacing:.08em;text-transform:uppercase;">Preparing payment QR codes…</div><div style="font-size:12px;color:#5d544a;margin-top:8px;">Keep this tab open.</div></div></body></html>');
  win.document.close();
  return win;
}

// Card / QR typography and spacing scale down as more books are packed onto
// one sheet. Pulled out of printPaymentQRCodes() as a pure lookup so that
// function's own logic (selecting books, pricing them, building the HTML)
// isn't buried under this six-way branch.
function computeQrSheetLayoutSizes(count, rowCount, effectiveCols, fitOnePage) {
  const sizes = {
    headerPadding: '32px 28px 20px',
    brandFontSize: fitOnePage ? '1.8rem' : '2.2rem',
    taglineFontSize: '0.6rem',
    cardPadding: '24px 18px 20px',
    cardMaxWidth: 'none',
    cardNumSize: '0.5rem',
    cardNumMargin: '8px',
    qrFrameSize: '140px',
    qrRenderSize: 120,
    cornerBracketSize: '6px',
    cornerBracketWidth: '1px',
    titleFontSize: '1.05rem',
    authorFontSize: '0.68rem',
    priceThFontSize: '0.5rem',
    priceTdPadding: '4px 0',
    priceCurFontSize: '0.58rem',
    priceValFontSize: '0.8rem',
    urlFontSize: '0.48rem',
  };

  if (count === 1) {
    // Single QR showcase / stall sign poster
    Object.assign(sizes, {
      headerPadding: '32px 32px 18px',
      brandFontSize: '2.6rem',
      taglineFontSize: '0.72rem',
      cardPadding: '44px 36px 36px',
      cardMaxWidth: '580px',
      cardNumSize: '0.72rem',
      cardNumMargin: '14px',
      qrFrameSize: '280px',
      qrRenderSize: 250,
      cornerBracketSize: '12px',
      cornerBracketWidth: '2px',
      titleFontSize: '2.1rem',
      authorFontSize: '0.95rem',
      priceThFontSize: '0.65rem',
      priceTdPadding: '8px 4px',
      priceCurFontSize: '0.82rem',
      priceValFontSize: '1.35rem',
      urlFontSize: '0.56rem',
    });
  } else if (count === 2 || (rowCount === 1 && effectiveCols === 2)) {
    // Pair of books in a single row
    Object.assign(sizes, {
      headerPadding: '24px 24px 14px',
      brandFontSize: '2.2rem',
      taglineFontSize: '0.65rem',
      cardPadding: '30px 22px 24px',
      cardNumSize: '0.62rem',
      cardNumMargin: '10px',
      qrFrameSize: '210px',
      qrRenderSize: 185,
      cornerBracketSize: '10px',
      cornerBracketWidth: '1.5px',
      titleFontSize: '1.5rem',
      authorFontSize: '0.82rem',
      priceThFontSize: '0.58rem',
      priceTdPadding: '6px 2px',
      priceCurFontSize: '0.72rem',
      priceValFontSize: '1.1rem',
      urlFontSize: '0.5rem',
    });
  } else if (count === 3 || (rowCount === 1 && effectiveCols === 3)) {
    // Trio in a single row
    Object.assign(sizes, {
      headerPadding: '20px 20px 12px',
      brandFontSize: '2.0rem',
      taglineFontSize: '0.62rem',
      cardPadding: '22px 18px 18px',
      cardNumSize: '0.55rem',
      cardNumMargin: '8px',
      qrFrameSize: '160px',
      qrRenderSize: 140,
      cornerBracketSize: '8px',
      cornerBracketWidth: '1.2px',
      titleFontSize: '1.25rem',
      authorFontSize: '0.72rem',
      priceThFontSize: '0.54rem',
      priceTdPadding: '5px 0',
      priceCurFontSize: '0.65rem',
      priceValFontSize: '0.98rem',
      urlFontSize: '0.48rem',
    });
  } else if (rowCount === 2) {
    // 2 rows (4-6 books)
    Object.assign(sizes, {
      headerPadding: '16px 20px 10px',
      brandFontSize: '1.9rem',
      taglineFontSize: '0.6rem',
      cardPadding: '16px 14px 14px',
      cardNumSize: '0.5rem',
      cardNumMargin: '6px',
      qrFrameSize: '126px',
      qrRenderSize: 108,
      cornerBracketSize: '7px',
      cornerBracketWidth: '1px',
      titleFontSize: '1.05rem',
      authorFontSize: '0.65rem',
      priceThFontSize: '0.5rem',
      priceTdPadding: '3px 0',
      priceCurFontSize: '0.58rem',
      priceValFontSize: '0.85rem',
      urlFontSize: '0.46rem',
    });
  } else if (rowCount === 3) {
    // 3 rows (7-9 books)
    Object.assign(sizes, {
      headerPadding: '12px 16px 8px',
      brandFontSize: '1.7rem',
      taglineFontSize: '0.55rem',
      cardPadding: '10px 8px 8px',
      cardNumSize: '0.48rem',
      cardNumMargin: '4px',
      qrFrameSize: '96px',
      qrRenderSize: 80,
      cornerBracketSize: '6px',
      cornerBracketWidth: '1px',
      titleFontSize: '0.9rem',
      authorFontSize: '0.58rem',
      priceThFontSize: '0.48rem',
      priceTdPadding: '2px 0',
      priceCurFontSize: '0.54rem',
      priceValFontSize: '0.78rem',
      urlFontSize: '0.44rem',
    });
  } else {
    // 4+ rows (10+ books or dense fit-one-page)
    Object.assign(sizes, {
      headerPadding: '8px 14px 4px',
      brandFontSize: '1.5rem',
      taglineFontSize: '0.52rem',
      cardPadding: '8px 6px 6px',
      cardNumSize: '0.45rem',
      cardNumMargin: '3px',
      qrFrameSize: '78px',
      qrRenderSize: 64,
      cornerBracketSize: '5px',
      cornerBracketWidth: '1px',
      titleFontSize: '0.8rem',
      authorFontSize: '0.52rem',
      priceThFontSize: '0.46rem',
      priceTdPadding: '1px 0',
      priceCurFontSize: '0.5rem',
      priceValFontSize: '0.72rem',
      urlFontSize: '0.42rem',
    });
  }

  return sizes;
}

async function printPaymentQRCodes(opts = {}) {
  const closeModal = opts.closeModal !== false;
  const cols = Math.max(1, Math.min(6, parseInt(document.getElementById('qrp-cols').value, 10) || 3));
  const baseCur = document.getElementById('qrp-base-cur').value || 'auto';

  const bail = (message) => {
    showToast(message, 'warn');
    if (opts.win) opts.win.close();
    return false;
  };

  const hasStripeKey = !!getReconStripeKey();
  const checked = Array.from(document.querySelectorAll('.qrp-book-check')).filter((el) => el.checked);
  if (!checked.length) return bail('Select at least one book for the payment QR sheet');

  // The book list is shared with the tally sheet, where a title with no way to
  // take payment is perfectly valid. Those can't become a card, so they're
  // dropped here (and counted) instead of printing a QR that scans to nothing.
  const selectedIds = checked
    .filter((el) => _fkBookPrintsQR(posResolveBook(el.value), el.value, hasStripeKey))
    .map((el) => el.value);
  const droppedCount = checked.length - selectedIds.length;

  if (!selectedIds.length) {
    return bail('No selected book has a payment link or a door price to charge — nothing to put on the QR sheet');
  }

  const currenciesShown = _qrpSelectedPriceCurrencies();

  showToast(droppedCount
    ? `⌛ Preparing payment QR sheet — skipping ${droppedCount} title${droppedCount === 1 ? '' : 's'} with no payment link`
    : '⌛ Preparing payment QR code sheet…');

  const _qrPriceFallbackTitles = [];
  const booksData = await Promise.all(selectedIds.map(async (id) => {
    const book = posResolveBook(id);
    const nativeCode = currencyToCode(book.currency);
    const listedCode = baseCur === 'auto' ? nativeCode : baseCur;

    const overrideInput = document.getElementById(`qrp-override-${id}`);
    const overrideVal = overrideInput ? parseFloat(overrideInput.value) : NaN;
    const hasOverride = !isNaN(overrideVal) && overrideVal > 0;

    let listedAmount = hasOverride
      ? overrideVal
      : (baseCur === 'auto' ? (book.listPrice || 0) : convertCurrency(book.listPrice || 0, nativeCode, listedCode));

    if (!book.priceOverrides) book.priceOverrides = {};
    if (hasOverride) {
      book.priceOverrides[listedCode] = overrideVal;
    }

    let url = book.stripeLink || book.paymentLink || '';
    // The card must print what the QR actually charges. A door-price link that
    // could not be minted falls back to the saved link, which charges list price.
    let overrideLinkMade = false;

    // If override is set and Stripe key is configured, create live Stripe Payment Link
    const stripeKey = getReconStripeKey();
    if (hasOverride && stripeKey) {
      try {
        url = await createStripePaymentLinkForAmount({
          amountMajor: listedAmount,
          currencyCode: listedCode,
          description: `${book.title} (${listedCode} ${listedAmount.toFixed(2)})`,
          metadata: { book_id: book.id, sku: book.id, override: 'true' }
        });
        overrideLinkMade = !!url;
      } catch (err) {
        console.warn('Stripe link creation failed for override:', err);
      }
    } else if (hasOverride && url && !url.includes('amount=')) {
      const joiner = url.includes('?') ? '&' : '?';
      url = `${url}${joiner}amount=${listedAmount.toFixed(2)}&currency=${listedCode}`;
    }
    if (hasOverride && !overrideLinkMade) {
      // Payment Links have a fixed price, so show the price the saved link charges.
      listedAmount = baseCur === 'auto' ? (book.listPrice || 0) : convertCurrency(book.listPrice || 0, nativeCode, listedCode);
      _qrPriceFallbackTitles.push(book.title);
    }

    const prices = currenciesShown.map((code) => {
      let amount;
      let approx = false;
      if (code === listedCode) {
        amount = listedAmount;
      } else if (listedAmount != null) {
        amount = convertCurrency(listedAmount, listedCode, code);
        approx = true;
      } else {
        amount = null;
      }
      const symbol = codeToSymbol(code);
      let display;
      if (amount == null) {
        display = '—';
      } else {
        const rounded = amount.toFixed(2);
        display = `${approx ? '~' : ''}${symbol}${rounded}`;
      }
      return { currency: code, amount: display, base: code === listedCode };
    });

    return { id: book.id, title: book.title, author: book.author || '', url, prices };
  }));

  if (_qrPriceFallbackTitles.length) {
    showToast(`Couldn't make a door-price link for ${_qrPriceFallbackTitles.join(', ')} — the card shows the list price its QR charges.`, 'warn', 6000);
  }
  const fitOnePage = !!document.getElementById('qrp-fit-one-page')?.checked;
  const count = booksData.length;

  let effectiveCols = cols;
  if (fitOnePage && count > 8 && cols < 4) {
    effectiveCols = 4;
  }
  // Cap effectiveCols at count so a single book or small batch doesn't get squished into thin columns
  effectiveCols = Math.min(effectiveCols, Math.max(1, count));
  const rowCount = Math.ceil(count / effectiveCols);

  const {
    headerPadding, brandFontSize, taglineFontSize, cardPadding, cardMaxWidth, cardNumSize, cardNumMargin,
    cornerBracketSize, cornerBracketWidth, titleFontSize, authorFontSize,
    priceThFontSize, priceTdPadding, priceCurFontSize, priceValFontSize, urlFontSize,
  } = computeQrSheetLayoutSizes(count, rowCount, effectiveCols, fitOnePage);
  // The code itself grows or shrinks to the space each card actually gets on
  // the page, rather than jumping between a few fixed sizes.
  const { frameSize, renderSize: qrRenderSize } = computeQrCardSize({
    count, cols: effectiveCols, fitOnePage,
    marginIn: fitOnePage ? 0.1 : 0.25,
    headerPx: rowCount >= 3 ? 64 : 90,
    priceRows: currenciesShown.length,
    hasAuthor: booksData.some((b) => b.author),
  });
  const qrFrameSize = `${frameSize}px`;

  const cardsHtml = booksData.map((book, i) => {
    const priceRows = book.prices.map((p) => `
      <tr${p.base ? ' class="base-price"' : ''}>
        <td>${escapeHtml(p.currency)}</td>
        <td>${escapeHtml(p.amount)}</td>
      </tr>
    `).join('');
    const pricesTable = book.prices.length ? `
      <table class="prices">
        <thead><tr><th>Currency</th><th>Price</th></tr></thead>
        <tbody>${priceRows}</tbody>
      </table>
    ` : '';
    const authorLine = book.author ? `<div class="card-author">${escapeHtml(book.author)}</div>` : '';
    return `
      <div class="card">
        <div class="card-num">${String(i + 1).padStart(2, '0')}</div>
        <div class="qr-frame"><div id="qr-${i}" data-url="${escapeHtml(book.url)}"></div></div>
        <div class="card-title">${escapeHtml(book.title)}</div>
        ${authorLine}
        ${pricesTable}
        <div class="card-url">${escapeHtml(book.url)}</div>
      </div>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Lyricalmyrical Books — Payment QR Codes</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --ink: #17130f;
    --paper: #f5f0e7;
    --rule: #c9c0b3;
    --accent: #d84a3a;
    --accent-light: #f4ded8;
    --blue-light: #dce8ee;
    --mono: "DM Mono", monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    height: 100%;
    min-height: 100vh;
    background: var(--paper);
    font-family: "Archivo", Arial, sans-serif;
    font-weight: 400;
    color: var(--ink);
  }
  body {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .header { text-align: center; padding: ${headerPadding}; border-bottom: 2px solid var(--ink); flex-shrink: 0; }
  .header::before { content: ''; display: block; width: 32px; height: 4px; background: var(--accent); margin: 0 auto 10px; }
  .brand { font-family: Anton, Impact, sans-serif; font-size: ${brandFontSize}; font-weight: 400; letter-spacing: 0.06em; line-height: 1; text-transform: uppercase; }
  .brand em { font-style: normal; }
  .tagline { margin-top: 6px; font-size: ${taglineFontSize}; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink); }
  .date-line { margin-top: 4px; font-family: var(--mono); font-size: 0.55rem; letter-spacing: 0.12em; text-transform: uppercase; color: #62594f; }

  .page-main {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 100%;
  }

  .grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: stretch;
    width: 100%;
    ${cardMaxWidth !== 'none' ? `max-width: ${cardMaxWidth};` : ''}
  }

  .card {
    width: calc(100% / ${effectiveCols});
    padding: ${cardPadding};
    border: 2px solid var(--ink);
    border-right-width: 0;
    border-bottom-width: 0;
    background: var(--paper);
    display: flex; flex-direction: column; align-items: center; position: relative;
    page-break-inside: avoid; break-inside: avoid;
    ${count <= 2 ? 'box-shadow: 6px 6px 0 var(--ink);' : ''}
  }
  .card:nth-child(${effectiveCols}n) { border-right-width: 2px; }
  .card:nth-last-child(-n + ${effectiveCols}) { border-bottom-width: 2px; }
  .card::before, .card::after { content: ''; position: absolute; width: ${cornerBracketSize}; height: ${cornerBracketSize}; border-color: var(--accent); border-style: solid; opacity: 1; }
  .card::before { top: 6px; left: 6px; border-width: ${cornerBracketWidth} 0 0 ${cornerBracketWidth}; }
  .card::after  { bottom: 6px; right: 6px; border-width: 0 ${cornerBracketWidth} ${cornerBracketWidth} 0; }

  .card-num { font-family: var(--mono); font-size: ${cardNumSize}; letter-spacing: 0.16em; color: #a32e24; text-transform: uppercase; margin-bottom: ${cardNumMargin}; font-weight: 500; }

  .qr-frame { width: ${qrFrameSize}; height: ${qrFrameSize}; padding: 6px; background: #fff; border: 2px solid var(--ink); display: flex; align-items: center; justify-content: center; margin-bottom: 10px; flex-shrink: 0; }

  .card-title { font-family: Anton, Impact, sans-serif; font-size: ${titleFontSize}; font-style: normal; font-weight: 400; text-transform: uppercase; letter-spacing: .02em; text-align: center; line-height: 1.15; margin-bottom: 4px; }
  .card-author { font-size: ${authorFontSize}; color: #51483f; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; text-align: center; }

  .prices { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  .prices thead tr { border-bottom: 2px solid var(--ink); }
  .prices thead th { font-size: ${priceThFontSize}; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #51483f; padding: 0 0 3px; text-align: left; }
  .prices thead th:last-child { text-align: right; }
  .prices tbody tr { border-bottom: 1px solid var(--rule); }
  .prices tbody tr:last-child { border-bottom: none; }
  .prices tbody td { font-size: ${priceCurFontSize}; padding: ${priceTdPadding}; color: var(--ink); letter-spacing: 0.04em; }
  .prices tbody td:first-child { color: #a32e24; font-size: ${priceCurFontSize}; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700; }
  .prices tbody td:last-child { text-align: right; font-family: var(--mono); font-size: ${priceValFontSize}; font-variant-numeric: tabular-nums; }
  .prices .base-price td:first-child { color: var(--ink); }

  .card-url { font-family: var(--mono); font-size: ${urlFontSize}; color: #62594f; word-break: break-all; text-align: center; margin-top: 4px; line-height: 1.4; }

  .footer { border-top: 2px solid var(--ink); padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; margin-top: auto; }
  .footer-brand { font-family: Anton, Impact, sans-serif; font-size: 0.78rem; text-transform: uppercase; color: var(--ink); letter-spacing: 0.08em; }
  .footer-note { font-size: 0.55rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #51483f; }

  .print-bar { position: fixed; bottom: 22px; right: 22px; z-index: 100; }
  .print-btn { background: var(--accent); color: var(--ink); border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); font-family: "Archivo", Arial, sans-serif; font-size: 0.68rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; padding: 12px 26px; cursor: pointer; }
  .print-btn:hover { transform: translate(-1px,-1px); box-shadow: 5px 5px 0 var(--ink); }

  @media print {
    @page { size: portrait; margin: ${fitOnePage ? '0.1in' : '0.25in'}; }
    html, body {
      background: white !important;
      height: 100%;
      min-height: 100vh;
      ${fitOnePage ? 'max-height: 100vh; overflow: hidden !important;' : ''}
    }
    .page-main { flex: 1; }
    .print-bar { display: none !important; }
  }
</style>
</head>
<body>

<header class="header">
  <div class="brand"><em>Lyricalmyrical</em> Books</div>
  <div class="tagline">Scan to purchase · Secured by Stripe</div>
  <div class="date-line" id="date-line"></div>
</header>

<main class="page-main">
  <div class="grid">${cardsHtml}</div>
</main>

<footer class="footer">
  <span class="footer-brand">Lyricalmyrical Books</span>
  <span class="footer-note">All transactions secured by Stripe · Adaptive Pricing enabled</span>
</footer>

<div class="print-bar">
  <button class="print-btn" onclick="window.print()">↓ Print / Save PDF</button>
</div>

<script>
document.getElementById('date-line').textContent = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
function renderQRs() {
  if (typeof QRCode === 'undefined') { setTimeout(renderQRs, 120); return; }
  document.querySelectorAll('[id^="qr-"]').forEach(function(el) {
    const url = el.getAttribute('data-url');
    if (!url) return;
    new QRCode(el, { text: url, width: ${qrRenderSize}, height: ${qrRenderSize}, colorDark: "#1c1814", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
  });
}
renderQRs();
<\/script>
</body>
</html>`;

  // In the combined flow the window was opened back when the button was
  // clicked, so it's already sitting there showing "Preparing…".
  const win = opts.win || window.open('', '_blank', 'width=1100,height=800');
  if (!win) {
    showToast('Pop-up blocked — allow pop-ups to print', 'warn');
    return false;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  if (closeModal) closeM('fair-kit');
  return true;
}

// ── PRINT THE KIT ──
// One setup, one click, both sheets. The tally sheet opens and sends itself to
// the printer; the QR sheet opens alongside it and waits on its own Print
// button, because minting Stripe links for any door prices can take a moment
// and a print dialog that fires mid-render prints half a page of blank squares.
async function printFairKit() {
  const mode = fairKitMode();

  if (mode === 'tracker') {
    printSalesTracker();
    return;
  }
  if (mode === 'qr') {
    await printPaymentQRCodes();
    return;
  }

  const qrWin = _fkOpenQrPrintWindow();
  if (!qrWin) {
    showToast('Pop-up blocked — allow pop-ups to print both sheets', 'warn');
    return;
  }

  // If the tally sheet bails (nothing selected, its own pop-up blocked), don't
  // leave the placeholder QR window stranded.
  if (!printSalesTracker({ closeModal: false })) {
    qrWin.close();
    return;
  }

  const qrPrinted = await printPaymentQRCodes({ closeModal: false, win: qrWin });
  closeM('fair-kit');
  if (qrPrinted) {
    showToast('Tally sheet is printing — the QR sheet opened in its own tab, print it when the codes have drawn', 'ok', 7000);
  }
}

export {
  _stOnHandHint,
  _stUpdatePackTotal,
  renderFairKitBookList,
  renderSalesTrackerBookList,
  renderQRPrintBookList,
  fairKitMode,
  _fkBookPrintsQR,
  _fkSelectionCounts,
  _fkPackedTotal,
  _fkUpdateSummary,
  _stReadPresetForm,
  _stApplyPresetToForm,
  activePOSSubTab,
  switchPOSSubTab,
  fairKitSearchFilter,
  _qrpSelectedPriceCurrencies,
  _qrReadPresetForm,
  _qrApplyPresetToForm,
  fairKitPresets,
  findFairKitPreset,
  fairKitPresetSummary,
  renderFairKitPresetPicker,
  _fkOpenQrPrintWindow,
  salesTrackerQtyInput,
  openFairKitModal,
  fairKitSelectAll,
  fkFocusFirstGap,
  salesTrackerAddCustom,
  salesTrackerRemoveCustom,
  fkPresetSelected,
  fkSaveFairPreset,
  fkDeleteFairPreset,
  fairKitSelectionChanged,
  fairKitModeChanged,
  printSalesTracker,
  printPaymentQRCodes,
  printFairKit,
};
