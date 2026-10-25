// Tax Centre — entering and correcting the ledger: the add-expense form, the
// phone receipt snap and AI receipt scan, the edit dialogs for expenses,
// sales, author payouts and trip assignments, removing a ledger line, the trip
// and category drill-downs, the ledger search shortcuts, and the full
// tax-season CSV export.
//
// The rest of the Tax Centre screen (rendering, filtering, paging, trips,
// recurring expenses, the other exports) lives in taxcentre.js; this is the
// part that was still in src/main.js. Lifted out verbatim apart from two
// things: the three inline handlers became plain function declarations
// (main.js puts them on window), and the four listeners that used to be
// installed as main.js evaluated (outside-click for trip pickers, two
// page-load wirings, the ledger shortcuts) are now installed by
// initTaxEntries(), which main.js calls at that same point in start-up. With
// those gone, nothing here runs at module-evaluation time, which is what makes
// the main.js <-> feature import cycle safe.
//
// TAX_CENTER stays in main.js (see taxcentre.js for why) and is only mutated
// here. _editingExpense, _tcEditTripId and _tcOpenTripName are owned and
// reassigned here; receipts.js and taxcentre.js read them as live bindings.
//
// eslint's no-undef (an error, checked in CI) is what keeps the import list
// honest: an identifier that isn't imported fails the build rather than
// throwing at click time.
import {
  $,
  _fxRateCache,
  calculateArtistEarnings,
  filterArtistEarningsByYear,
  isExpenseAwaitingRate,
  isTestBook,
  isTestBookId,
  loadTaxCenter,
  openEditHist,
  openEditLedger,
  resolveExpenseRate,
  saveState,
  showToast,
  switchBook,
  switchTab,
  TAX_CENTER,
  today,
  WEBSITE_SALE_LOCKED,
} from '../main.js';
import { BOOKS, BOOK_LIST, states, defaultState, withActiveBook } from '../core/store.js';
import { voidHistEntry } from './sales-ledger.js';
import { editArtistPayout, findArtistPayout, settlePayoutRequests, undoRecordedArtistSettlement } from './dashboard.js';
import { ledgerSaleIndexForHistMirror } from '../lib/consignment.js';
import { csvCell, toCsv } from '../lib/csv.js';
import { downloadCsv } from '../lib/download.js';
import { payoutNetted } from '../lib/earnings.js';
import { canonicalExpenseCategory } from '../lib/expense-categories.js';
import { expensesRepaidBySettlement } from '../lib/receipt-storage.js';
import { escapeHtml } from '../lib/html.js';
import { closeM, confirmDialog, openM, promptDialog } from '../lib/modal.js';
import { fmt, getBookCurrencyCode, getSym, roundCents, setSelectCurrency } from '../lib/money.js';
import { followableUrl } from '../lib/receipt-links.js';
import {
  _localReceiptCell,
  _runReceiptScan,
  getPendingWebcamReceipt,
  saveReceiptBestEffort,
  saveReceiptToLocalFile,
  setPendingWebcamReceipt,
} from './receipts.js';
import {
  _tcClearConfirmedPending,
  _tcFindTripRecord,
  renderTaxCenter,
  saveTaxCenter,
  switchTaxCenterSubTab,
  tcCloseTripDropdown,
} from './taxcentre.js';

// ── TAX CENTER LOGIC
const TC_CATEGORIES = [
  'Software & Subscriptions', 'Marketing & Advertising', 'Printing & Production',
  'Editorial & Proofreading', 'Illustration & Photography', 'Rights & Permissions',
  'ISBN, Barcodes & Cataloging', 'Shipping & Postage', 'Warehousing & Fulfillment',
  'Packaging Materials', 'Office Supplies', 'Home Office', 'Travel', 'Meals & Entertainment', 'Professional Services',
  'Books, Research & Reference', 'Events & Exhibitions', 'Artist Royalties',
  'Inventory Valuation Adjustment', 'Other'
];

function changeExpenseCategory(itemId, newCat) {
  const exp = (TAX_CENTER.businessExpenses || []).find(e => String(e.id) === String(itemId));
  if (!exp) return;
  if (exp.cat === newCat) return;
  exp.cat = newCat;
  saveTaxCenter();
  renderTaxCenter();
  showToast(`✓ Moved to ${newCat}`);
}

// Persist the ledger view (year + search + type) so a tax session survives a
// reload or PWA relaunch. Restored once, lazily, on the first Tax Center render.

// Debounced free-text search over the Master Ledger (description / ref / category / type).

// Sales-only / Expenses-only toggle for the Master Ledger.

// Year dropdown change — reset to page 1 (the inline handler used to set a stray
// global instead of the module's _tcLedgerPage) and persist the choice.
// Canonical year-filter handler. Both the Cash Flow Summary select (#tc-year)
// and the Master Ledger select (#tc-year-ledger) call this so they stay in sync
// and drive the same render. renderTaxCenter() reads #tc-year, so push the new
// value there too in case the change came from the ledger control.

// Retained for backward-compatibility (older inline handlers / persisted code
// paths may still call it). Delegates to the canonical handler using the
// current #tc-year value.

// Clear the Master Ledger search + type filter in one click. The year is left
// alone — it has its own visible dropdown and scopes the summary cards too.

// Apply the active search + type filter to the full (year-filtered) ledger array.

// A click anywhere outside a trip picker closes its dropdown (installed by
// initTaxEntries).
function _tcCloseTripPickersOnOutsideClick(e) {
  if (!e.target.closest('.tc-trip-picker-wrapper')) {
    ['tc-exp-trip', 'tc-edit-trip-input', 'edit-exp-trip'].forEach(tcCloseTripDropdown);
  }
}

function exportTripCSV(tripName) {
  const detail = window._tcTripDetail;
  if (!detail || !detail.byName || !detail.byName[tripName]) {
    showToast('⚠ Trip details not found', 'warn');
    return;
  }

  const { baseCurrency, byName } = detail;
  const { items } = byName[tripName];

  const rows = [
    ['Date', 'Description', 'Tax Category', 'Reference', 'Original Currency', 'Original Amount', `Base Amount (${baseCurrency})`, 'Receipt URL'],
    ...items.map(item => [
      item.date || '',
      item.desc || '',
      item.cat || '',
      item.ref || '',
      item.origCurrency || 'CAD',
      Number(item.origAmount || 0).toFixed(2),
      Number(item.baseAmount || 0).toFixed(2),
      item.receipt || '',
    ]),
  ];

  const safeFilename = `trip_expenses_${tripName.replace(/[^a-zA-Z0-9_\-]/g, '_')}.csv`;
  downloadCsv(toCsv(rows), safeFilename);
  showToast(`✓ Exported ${items.length} expenses to ${safeFilename}`);
}

async function setTripBudgetPrompt(tripName) {
  if (!tripName) return;
  if (!TAX_CENTER.tripBudgets) TAX_CENTER.tripBudgets = {};
  const currentBudget = TAX_CENTER.tripBudgets[tripName] || '';
  const input = window.prompt(`Set Target Budget (CAD) for trip "${tripName}":\n(Leave blank to clear budget limit)`, currentBudget);
  if (input === null) return;

  const val = parseFloat(input.trim());
  if (!isNaN(val) && val > 0) {
    TAX_CENTER.tripBudgets[tripName] = val;
    showToast(`✓ Budget set to ${fmt(val, TAX_CENTER.settings?.baseCurrency || 'CAD')} for ${tripName}`);
  } else {
    delete TAX_CENTER.tripBudgets[tripName];
    showToast(`✓ Budget cleared for ${tripName}`);
  }

  await saveTaxCenter();
  renderTaxCenter();
  if (_tcOpenTripName === tripName) {
    showTripDetail(tripName);
  }
}

// Escape a value for safe interpolation into an SVG/HTML attribute or text node.

// Build a delta chip ("▲ 12% vs 2024" / "new" / "—") for a headline stat.
// `goodWhenUp` flips colour semantics for expenses (a rise is bad / red).

// Render the redesigned Cash Flow Summary card. Pulls headline figures from the
// totals renderTaxCenter already computed, derives period-over-period deltas and
// secondary KPIs via the pure cashflow helpers, and draws an inline-SVG mini
// chart. No external libraries; everything is a string built here.

// Build a responsive inline-SVG paired-bar chart (green income / red expenses)
// from the ledger. Months for a single year, years for "All Time". Returns ''
// when there is nothing to plot so the chart hides gracefully.

/**
 * Delete exactly one row, even when its key is not unique.
 *
 * History entries are never given an `id` — nothing in the app sets one — so
 * these deletes key on `num`, and `num` is not unique. A consignment sale's
 * number ends in the last four digits of the clock (see recordSale), which
 * recycle every ten seconds, and a manual sale's number is free text the owner
 * types. `filter` removed EVERY match: two sales to the same store ten seconds
 * apart, and deleting one silently deleted both — two stock reversals and two
 * revenue reversals for one intended deletion, with nothing on screen to say
 * so.
 *
 * Splicing the first match keeps the delete to the one row the owner asked
 * about. It does not make the key unique — a duplicate number still means the
 * wrong one of the two may go — but it can no longer destroy a record the
 * owner never selected.
 */
function removeOneByKey(list, id) {
  const wanted = String(id);
  const idx = list.findIndex(entry => String(entry?.id ?? entry?.num) === wanted);
  if (idx !== -1) list.splice(idx, 1);
  return idx !== -1;
}

async function removeLedgerEntry(type, bid, id) {
  if ((type === 'artistPayout' || type === 'artistDebtRecovery') && findArtistPayout(bid, id)?.settlement) {
    await undoRecordedArtistSettlement(bid, id);
    renderTaxCenter();
    return;
  }
  if (type === 'sale' && (states[bid]?.hist || []).find(h => String(h.id ?? h.num) === String(id))?.artistSettlementId) {
    showToast('Undo the author settlement before deleting this sale.', 'warn'); return;
  }
  if (type === 'bookExpense' && expensesRepaidBySettlement(states[bid]?.artistPayouts).has(String(id))) {
    showToast('Undo the author settlement that paid this expense back before deleting it.', 'warn'); return;
  }
  if (type === 'sale' && (states[bid]?.hist || []).some(h => String(h.id ?? h.num) === String(id) && h.webOrderId)) {
    showToast(WEBSITE_SALE_LOCKED, 'warn', 5000); return;
  }
  if (!(await confirmDialog('Are you sure you want to permanently delete this entry from the ledger?', { okLabel: 'Delete entry', danger: true }))) return;
  let reopenedDebt = false;

  if (type === 'businessExpense') {
    TAX_CENTER.businessExpenses = (TAX_CENTER.businessExpenses || []).filter(e => String(e.id) !== String(id));
    saveTaxCenter();
  } else if (type === 'bookExpense') {
    const s = states[bid];
    if (s && s.expenses) {
      s.expenses = s.expenses.filter(e => String(e.id) !== String(id));
      saveState(bid);
    }
  } else if (type === 'artistPayout') {
    // These ledger rows are built from `artistPayouts` (the recorded payments),
    // not `artistTransfers` (cash the artist is still holding) — deleting from
    // the wrong array left the row on screen and removed an unrelated transfer.
    const s = states[bid];
    if (s && s.artistPayouts) {
      const gone = s.artistPayouts.find(p => String(p.id) === String(id));
      if (payoutNetted(gone) > 0.005) reopenedDebt = true;
      removeOneByKey(s.artistPayouts, id);
      settlePayoutRequests(bid);
      saveState(bid);
    }
  } else if (type === 'sale') {
    const s = states[bid];
    if (s && s.hist) {
      // A live sale is reversed exactly like Void (stock, sold, revenue,
      // channel totals, Sheets row) before the row goes; an already-voided
      // one has nothing left to reverse.
      const h = s.hist.find(x => String(x.id ?? x.num) === String(id));
      if (h && !h.voided && !h.consignmentLink && BOOKS[bid]) {
        // The void's Sheets sync names the on-screen book, so point it at this one.
        withActiveBook(bid, () => voidHistEntry(s, BOOKS[bid], h));
      }
      removeOneByKey(s.hist, id);
      saveState(bid);
    }
  } else if (type === 'shippingIncome') {
    // Shipping income is derived from the sale's shippingPaid; clear it there.
    const s = states[bid];
    const sid = String(id).replace(/-shipping-income$/, '');
    const h = s?.hist?.find(x => String(x.id ?? x.num) === sid);
    if (h) { h.shippingPaid = 0; saveState(bid); }
  }

  renderTaxCenter();
  showToast(reopenedDebt ? '✓ Entry removed — the debt it netted is owed again' : '✓ Entry removed from ledger');
}

let _tcEditTripId = null;
let _tcOpenTripName = null;

function openEditTrip(itemId) {
  const exp = (TAX_CENTER.businessExpenses || []).find(e => String(e.id) === String(itemId));
  if (!exp) return;
  _tcEditTripId = itemId;
  $('tc-edit-trip-context').textContent = `${exp.desc || 'Expense'} · ${exp.date || ''}`;
  $('tc-edit-trip-input').value = exp.trip || '';
  openM('tc-edit-trip');
  setTimeout(() => $('tc-edit-trip-input').focus(), 50);
}

function saveTripAssignment() {
  if (_tcEditTripId === null) return;
  const newTrip = ($('tc-edit-trip-input').value || '').trim();
  const exp = (TAX_CENTER.businessExpenses || []).find(e => String(e.id) === String(_tcEditTripId));
  if (!exp) return;
  exp.trip = newTrip;
  saveTaxCenter();
  closeM('tc-edit-trip');
  _tcEditTripId = null;
  renderTaxCenter();
  showToast(newTrip ? `✓ Assigned to ${newTrip}` : '✓ Removed from trip');
}

let _editingExpense = null;

function renderEditExpenseReceipts() {
  const container = $('edit-exp-receipts-preview');
  if (!container || !_editingExpense) return;
  if (!_editingExpense.files.length) {
    container.innerHTML = '<span style="color:var(--text3);font-size:var(--text-xs);">No receipts attached</span>';
    return;
  }

  container.innerHTML = _editingExpense.files.map((r, idx) => {
    let name = 'Receipt';
    let viewLink = '';
    if (typeof r === 'string' && r.startsWith('local://')) {
      const fn = r.replace('local://', '');
      const base = fn.split('/').pop();
      name = base;
      viewLink = `<a href="#" onclick="event.preventDefault(); viewLocalReceipt(${escapeHtml(JSON.stringify(fn))})" style="color:var(--gold3);text-decoration:underline;">${escapeHtml(base)}</a>`;
    } else {
      name = String(r).split('/').pop() || 'Remote Receipt';
      const href = followableUrl(r);
      // Unfollowable and unescaped before: a stored value with a quote in it
      // broke out of the attribute, and one with no usable scheme rendered a
      // link that did nothing.
      viewLink = href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="color:var(--gold3);text-decoration:underline;">${escapeHtml(name)}</a>`
        : `<span title="This receipt reference cannot be opened" style="color:var(--text3);">${escapeHtml(name)}</span>`;
    }
    return `<div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:var(--r);border:var(--stroke-hair) solid rgba(255,255,255,0.1);margin-bottom:4px;">
      <span style="font-size:var(--text-xs);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;" title="${escapeHtml(name)}">📄 ${viewLink}</span>
      <div style="display:flex;gap:4px;">
        <button class="btn tx" type="button" onclick="relinkEditExpenseReceipt(${idx})" style="padding:2px 6px;font-size:var(--text-2xs);color:var(--gold-text);" title="Change or edit this receipt link">✏️ Relink</button>
        <button class="btn tx" type="button" onclick="removeEditExpenseReceipt(${idx})" style="padding:2px 6px;font-size:var(--text-2xs);color:var(--red);" title="Remove receipt attachment">Remove</button>
      </div>
    </div>`;
  }).join('');
}

async function relinkEditExpenseReceipt(idx) {
  if (!_editingExpense) return;
  const currentPath = String(_editingExpense.files[idx] || '');
  // A receipt is either a path in the connected folder or a real URL, and the
  // two must not be confused. Stripping `local://` unconditionally and
  // re-adding it turned a cloud receipt into `local://https://…` — a reference
  // that resolves to nothing, so relinking a perfectly good cloud receipt
  // destroyed it.
  const isLocal = currentPath.startsWith('local://');
  const currentValue = isLocal ? currentPath.slice('local://'.length) : currentPath;

  const newPath = await promptDialog(
    isLocal
      ? `Enter the correct relative filename or path in your connected receipts folder:\n(e.g., "Business/2026-06-03_receipt.jpg" or "receipt_123.pdf")`
      : 'Enter the correct web address for this receipt, or a filename in your connected receipts folder.',
    currentValue,
    { title: 'Relink Receipt File', okLabel: 'Update Link', cancelLabel: 'Cancel' }
  );

  if (newPath !== null && newPath.trim()) {
    const entered = newPath.trim();
    // Keep whatever kind the owner actually typed: a web address stays a web
    // address, anything else is a path in the folder.
    _editingExpense.files[idx] = /^(https?:|data:|blob:)/i.test(entered)
      ? entered
      : `local://${entered.replace(/^local:\/\//, '')}`;
    renderEditExpenseReceipts();
    showToast('✓ Receipt link updated — click Save changes to apply', 'ok');
  }
}

function removeEditExpenseReceipt(idx) {
  if (!_editingExpense) return;
  _editingExpense.files.splice(idx, 1);
  renderEditExpenseReceipts();
}

function openEditSale(bid, itemId) {
  switchBook(bid);
  const s = states[bid];
  if (!s || !Array.isArray(s.hist)) return;
  const idx = s.hist.findIndex(h => String(h.id || h.num) === String(itemId));
  if (idx !== -1) {
    const h = s.hist[idx];
    if (h.consignmentLink) {
      const lIdx = ledgerSaleIndexForHistMirror(s, h);
      if (lIdx !== -1) {
        openEditLedger(lIdx);
        return;
      }
    }
    openEditHist(idx);
  } else {
    showToast('⚠ Sale record not found', 'err');
  }
}

// Entry point for the Tax Centre's ledger-row edit button. Artist payouts live
// on the book's dashboard, so this lands the publisher on that panel with the
// row already loaded into the payout form.
function openArtistPayoutEditor(bid, payoutId) {
  switchBook(bid);
  switchTab('dashboard');
  // switchTab repaints the dashboard, which rebuilds the payout form markup —
  // load the row afterwards or the fields would be wiped by that render.
  editArtistPayout(bid, payoutId);
}

function openEditExpense(type, bid, id) {
  let exp = null;
  if (type === 'businessExpense') {
    exp = (TAX_CENTER.businessExpenses || []).find(e => String(e.id) === String(id));
  } else if (type === 'bookExpense') {
    const s = states[bid];
    if (s && s.expenses) {
      exp = s.expenses.find(e => String(e.id) === String(id));
    }
  }
  if (!exp) {
    showToast('⚠ Expense entry not found', 'err');
    return;
  }

  // Populate dynamic category dropdown
  const catSelect = $('edit-exp-cat');
  if (catSelect) {
    catSelect.innerHTML = TC_CATEGORIES.map(c => `<option value="${c.replace(/"/g, '&quot;')}">${c}</option>`).join('');
    // Fold legacy names (e.g. "Travel & Meals") so the picker preselects the current one.
    const editCat = canonicalExpenseCategory(exp.cat, 'Other');
    if (!TC_CATEGORIES.includes(editCat)) {
      catSelect.innerHTML += `<option value="${editCat.replace(/"/g, '&quot;')}">${editCat}</option>`;
    }
    catSelect.value = editCat;
  }

  _editingExpense = {
    type,
    bid,
    id,
    files: Array.isArray(exp.receiptFiles) ? [...exp.receiptFiles] : (exp.receipt ? [exp.receipt] : [])
  };

  $('edit-exp-desc').value = exp.desc || '';
  setSelectCurrency($('edit-exp-cur'), exp.origCurrency || exp.currency || 'CAD');
  $('edit-exp-amount').value = exp.amountUnknown ? '' : (exp.origAmount != null ? exp.origAmount : (exp.amount || 0));
  $('edit-exp-date').value = exp.date || today();
  $('edit-exp-trip').value = exp.trip || '';
  $('edit-exp-file').value = '';
  syncEditExpFileName();
  if ($('edit-exp-file-preview')) $('edit-exp-file-preview').textContent = '';

  renderEditExpenseReceipts();
  openM('edit-expense');
}

// The receipt picker is a button-styled label over a visually hidden file input,
// so the chosen file's name is written beside the button here.
function syncEditExpFileName() {
  const name = $('edit-exp-file-name');
  const file = $('edit-exp-file')?.files?.[0];
  if (name) name.textContent = file ? file.name : 'No file chosen';
}
function _tcWireEditExpenseFile() {
  $('edit-exp-file')?.addEventListener('change', syncEditExpFileName);
}

async function saveExpenseEdit() {
  if (!_editingExpense) return;
  const { type, bid, id } = _editingExpense;

  const desc = ($('edit-exp-desc').value || '').trim();
  const cat = $('edit-exp-cat').value;
  const currency = $('edit-exp-cur').value || 'CAD';
  const amount = parseFloat($('edit-exp-amount').value) || 0;
  const date = $('edit-exp-date').value || today();
  const trip = ($('edit-exp-trip').value || '').trim();

  if (!desc) { showToast('⚠ Please enter a description', 'warn'); $('edit-exp-desc').focus(); return; }
  if (!amount) { showToast('⚠ Please enter an amount', 'warn'); $('edit-exp-amount').focus(); return; }

  const submitBtn = $('m-edit-expense').querySelector('.modal-footer .gold');
  const oldText = submitBtn.textContent;
  submitBtn.textContent = 'Saving...'; submitBtn.disabled = true;

  try {
    const fileInput = $('edit-exp-file');
    let newReceiptUrl = '';
    if (fileInput && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const pendingCam = getPendingWebcamReceipt();
      if (pendingCam && pendingCam.name === file.name && pendingCam.size === file.size) {
        newReceiptUrl = pendingCam.url;
      } else {
        const subfolder = type === 'bookExpense' && BOOKS[bid] ? BOOKS[bid].title : 'General';
        const localUrl = await saveReceiptToLocalFile(file, subfolder.replace(/[^a-zA-Z0-9.\-_]/g, '_'));
        if (localUrl) newReceiptUrl = localUrl;
      }
    }

    if (newReceiptUrl) {
      _editingExpense.files.push(newReceiptUrl);
    }

    // Recalculate converted CAD total at the expense's own date's rate. No rate
    // found (offline) means no CAD value yet, flagged — never a silent 1:1.
    const fxRate = await resolveExpenseRate(currency, date);
    const baseAmount = fxRate ? roundCents(amount * fxRate) : null;

    // Find and update item
    let exp = null;
    if (type === 'businessExpense') {
      exp = (TAX_CENTER.businessExpenses || []).find(e => String(e.id) === String(id));
      if (exp) {
        exp.desc = desc;
        exp.cat = cat;
        exp.currency = currency;
        exp.origCurrency = currency;
        exp.amount = amount;
        if (exp.amountUnknown) exp.amountUnknown = false;
        exp.origAmount = amount;
        exp.fxRate = fxRate || null;
        exp.baseAmount = baseAmount;
        exp.fxMissing = !fxRate;
        exp.date = date;
        exp.trip = trip;
        exp.receiptFiles = [..._editingExpense.files];
        exp.receipt = _editingExpense.files[0] || '';
        await saveTaxCenter();
      }
    } else if (type === 'bookExpense') {
      const s = states[bid];
      if (s && s.expenses) {
        exp = s.expenses.find(e => String(e.id) === String(id));
        if (exp) {
          const prevAmount = exp.amount, prevCurrency = exp.currency;
          exp.desc = desc;
          exp.cat = cat;
          exp.currency = currency;
          exp.origCurrency = currency;
          exp.amount = amount;
          exp.origAmount = amount;
          // Offline with no cached rate: keep the saved CAD value if nothing it depends on changed, instead of blanking it.
          const sameBasis = !fxRate && exp.baseAmount != null && exp.amount === prevAmount && exp.currency === prevCurrency;
          if (!sameBasis) {
            exp.fxRate = fxRate || null;
            exp.baseAmount = baseAmount;
            exp.fxMissing = !fxRate;
          }
          exp.date = date;
          exp.receiptFiles = [..._editingExpense.files];
          exp.receipt = _editingExpense.files[0] || '';
          await saveState(bid);
        }
      }
    }

    // If active modals (trip detail, category detail) are open, re-render them too
    const tripModal = $('m-tc-trip-detail');
    const catModal = $('m-tc-cat-detail');
    if (tripModal && tripModal.style.display !== 'none' && _tcOpenTripName) {
      await loadTaxCenter();
      renderTaxCenter();
      showTripDetail(_tcOpenTripName);
    } else if (catModal && catModal.style.display !== 'none') {
      const activeCatName = $('tc-cat-detail-title').textContent;
      if (activeCatName) {
        await loadTaxCenter();
        renderTaxCenter();
        showCategoryDetail(activeCatName);
      }
    } else {
      renderTaxCenter();
    }

    closeM('edit-expense');
    showToast('✓ Expense updated successfully');
  } catch (e) {
    console.error('Error saving expense edit', e);
    showToast('⚠ Error saving changes', 'err');
  } finally {
    submitBtn.textContent = oldText; submitBtn.disabled = false;
    _editingExpense = null;
    setPendingWebcamReceipt(null);
  }
}

function showTripDetail(tripName) {
  const detail = window._tcTripDetail;
  if (!detail || !detail.byName[tripName]) return;
  const { baseCurrency } = detail;
  const { items, total, count, categories } = detail.byName[tripName];
  _tcOpenTripName = tripName;

  // ⚡ Bolt Optimization: Use string comparison instead of parsing to Date for sorting "YYYY-MM-DD" formatted dates
  const sorted = items.slice().sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    return dateA > dateB ? 1 : dateA < dateB ? -1 : 0;
  });

  const catPills = Object.entries(categories || {}).map(([cat, amt]) => {
    return `<span style="background:rgba(255,255,255,0.06);border:var(--stroke-hair) solid rgba(255,255,255,0.1);padding:2px 8px;border-radius:var(--r);font-size:var(--text-xs);color:var(--text2);">${escapeHtml(cat)}: <b>-${fmt(amt, baseCurrency)}</b></span>`;
  }).join(' ');

  const rows = sorted.map(item => {
    const refCell = _localReceiptCell(item);
    const origSym = getSym(item.origCurrency || 'CAD');
    const origDisplay = `${origSym}${Number(item.origAmount || 0).toFixed(2)}`;
    return `
      <tr style="color:var(--red);">
        <td style="font-size:var(--text-sm);">${item.date || '—'}</td>
        <td style="font-size:var(--text-sm);">${escapeHtml(item.desc)}</td>
        <td style="font-size:var(--text-sm);">${escapeHtml(item.cat)}</td>
        <td style="font-size:var(--text-sm);">${refCell}</td>
        <td class="r" style="font-size:var(--text-sm);">${origDisplay}</td>
        <td class="r" style="font-weight:600;">- ${fmt(item.baseAmount, baseCurrency)}</td>
        <td style="display:flex;gap:4px;align-items:center;justify-content:flex-end;">
          <button class="btn" style="font-size:var(--text-2xs);padding:3px 8px;" onclick="openEditTrip('${item.id}')" title="Move to a different trip">Move</button>
          <button class="btn-icon" aria-label="Edit entry" onclick="openEditExpense('businessExpense', '', '${item.id}')" title="Edit entry">✏️</button>
          <button class="btn-icon" aria-label="Delete entry" onclick="removeLedgerEntry('businessExpense', '', '${item.id}')" title="Delete entry">🗑️</button>
        </td>
      </tr>`;
  }).join('');

  const rec = _tcFindTripRecord(tripName);
  const recBits = [];
  if (rec?.destination) recBits.push(`📍 ${escapeHtml(rec.destination)}`);
  if (rec?.startDate || rec?.endDate) recBits.push(`🗓 ${escapeHtml([rec.startDate, rec.endDate].filter(Boolean).join(' → '))}`);
  if (rec?.purpose) recBits.push(`🎯 ${escapeHtml(rec.purpose)}`);

  $('tc-trip-detail-title').textContent = `✈ ${tripName}`;
  $('tc-trip-detail-summary').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;">
      <div>${count} expense${count === 1 ? '' : 's'} &bull; <span style="color:var(--red-light);font-weight:bold;">Trip total: -${fmt(total, baseCurrency)}</span></div>
      ${recBits.length ? `<div style="display:flex;flex-wrap:wrap;gap:10px;font-size:var(--text-sm);color:var(--text3);">${recBits.join('<span>·</span>')}</div>` : ''}
      ${rec?.notes ? `<div style="font-size:var(--text-sm);color:var(--text3);font-style:italic;">${escapeHtml(rec.notes)}</div>` : ''}
      ${catPills ? `<div style="display:flex;flex-wrap:wrap;gap:6px;">${catPills}</div>` : ''}
    </div>
  `;
  $('tc-trip-detail-body').innerHTML = rows
    || `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:26px 12px;font-size:var(--text-sm);">
          <div style="margin-bottom:10px;">No expenses assigned to this trip yet.</div>
          <button class="btn gold" onclick="logExpenseForTrip()">➕ Log the first expense</button>
        </td></tr>`;
  openM('tc-trip-detail');
}

function renameTripPrompt() {
  if (!_tcOpenTripName) return;
  const next = (window.prompt('Rename trip', _tcOpenTripName) || '').trim();
  if (!next || next === _tcOpenTripName) return;
  let changed = 0;
  (TAX_CENTER.businessExpenses || []).forEach(e => {
    if ((e.trip || '') === _tcOpenTripName) { e.trip = next; changed++; }
  });
  // A declared trip can have zero expenses, so the record — not the expense
  // count — decides whether the rename actually happened.
  const rec = _tcFindTripRecord(_tcOpenTripName);
  if (rec) rec.name = next;
  if (TAX_CENTER.tripBudgets?.[_tcOpenTripName] != null) {
    TAX_CENTER.tripBudgets[next] = TAX_CENTER.tripBudgets[_tcOpenTripName];
    delete TAX_CENTER.tripBudgets[_tcOpenTripName];
  }
  if (changed === 0 && !rec) return;
  saveTaxCenter();
  closeM('tc-trip-detail');
  _tcOpenTripName = null;
  renderTaxCenter();
  showToast(`✓ Renamed trip (${changed} expense${changed === 1 ? '' : 's'})`);
}

function showCategoryDetail(catName) {
  const detail = window._tcCategoryDetail;
  if (!detail || !detail.byName[catName]) return;
  const { baseCurrency } = detail;
  const { items, total, count, spent, rate } = detail.byName[catName];

  // ⚡ Bolt Optimization: Use string comparison instead of parsing to Date for sorting "YYYY-MM-DD" formatted dates
  const sorted = items.slice().sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    return dateA > dateB ? -1 : dateA < dateB ? 1 : 0;
  });

  const rows = sorted.map(item => {
    // Receipt links AND the reference number together — a ref must never
    // hide the saved receipt files.
    let displayRef = item.ref != null ? String(item.ref) : '';
    let legacyReceipt = '';
    if (displayRef && displayRef.includes('local://')) {
      const match = displayRef.match(/href="([^"]+)"/);
      if (match) legacyReceipt = match[1];
      displayRef = '';
    }
    const links = _localReceiptCell(item) || (legacyReceipt ? _localReceiptCell({ receipt: legacyReceipt }) : '');
    const refCell = [
      links,
      displayRef ? `<span style="font-size:var(--text-xs);color:var(--text3);">${displayRef}</span>` : '',
      item.invoiceNum ? `<span style="font-size:var(--text-xs);color:var(--gold);">🧾 ${escapeHtml(item.invoiceNum)}</span>` : ''
    ].filter(Boolean).join('<br>');
    const origSym = getSym(item.origCurrency || 'CAD');
    const origDisplay = `${origSym}${Number(item.origAmount || 0).toFixed(2)}`;
    const moveCell = item.sourceType === 'businessExpense'
      ? `<select onchange="changeExpenseCategory('${item.itemId}', this.value)" style="font-size:var(--text-xs);padding:2px 4px;border:var(--stroke-hair) solid rgba(255,255,255,.15);border-radius:var(--r);max-width:170px;" title="Move to another category">
          ${TC_CATEGORIES.map(c => `<option value="${escapeHtml(c)}"${c === item.cat ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>`
      : '<span style="font-size:var(--text-xs);color:var(--text3);">—</span>';
    const showEdit = (item.sourceType === 'businessExpense' || item.sourceType === 'bookExpense');
    const editBtn = showEdit ? `<button class="btn-icon" aria-label="Edit entry" onclick="openEditExpense('${item.sourceType}', '${item.sourceId || ''}', '${item.itemId}')" title="Edit entry" style="margin-right:4px;">✏️</button>` : '';
    const deleteBtn = item.itemId ? `<button class="btn-icon" aria-label="Delete entry" onclick="removeLedgerEntry('${item.sourceType}', '${item.sourceId || ''}', '${item.itemId}')" title="Delete entry">🗑️</button>` : '';
    return `
      <tr style="color:var(--red);">
        <td style="font-size:var(--text-sm);">${item.date || '—'}</td>
        <td><span class="tag amber">${escapeHtml(item.type)}</span></td>
        <td style="font-size:var(--text-sm);">${escapeHtml(item.desc)}</td>
        <td style="font-size:var(--text-sm);">${refCell}</td>
        <td class="r" style="font-size:var(--text-sm);">${origDisplay}</td>
        <td class="r" style="font-weight:600;">- ${fmt(item.baseAmount, baseCurrency)}</td>
        <td>${moveCell}</td>
        <td class="r">${editBtn}${deleteBtn}</td>
      </tr>`;
  }).join('');

  $('tc-cat-detail-title').textContent = catName;
  // Rows below show what was spent; a limited category (Meals & Entertainment)
  // says up front that only part of it is deductible, so the header total
  // doesn't look like it disagrees with the rows.
  const limitNote = rate < 1
    ? ` · <span style="color:var(--text3);">Spent ${fmt(spent, baseCurrency)}, ${Math.round(rate * 100)}% deductible (CRA limit)</span>`
    : '';
  $('tc-cat-detail-summary').innerHTML = `${count} transaction${count === 1 ? '' : 's'} · <span style="color:var(--red);font-weight:bold;">${rate < 1 ? 'Deductible' : 'Total'}: - ${fmt(total, baseCurrency)}</span>${limitNote}`;
  $('tc-cat-detail-body').innerHTML = rows;
  openM('tc-cat-detail');
}

// Tax Center receipt scan. `keyId` lets a first-time user scan with the key
// still sitting unsaved in the Config box.
async function scanReceiptWithAI() {
  return _runReceiptScan({
    fileId: 'tc-exp-file', btnId: 'tc-ai-scan-btn', keyId: 'tc-api-key',
    descId: 'tc-exp-desc', dateId: 'tc-exp-date', amountId: 'tc-exp-amount',
    curId: 'tc-exp-cur', catId: 'tc-exp-cat',
    resultId: 'tc-exp-scan-read', dest: 'business'
  });
}

// Shippo label URLs can expire, so try to save a permanent copy to the local
// receipts folder. Best-effort: returns a local:// path on success, otherwise
// null so the caller keeps the original URL. May fail on CORS or no folder.

// A receipt snapped with no signal is read the moment the signal returns, as
// long as it is still the photo on the form and nothing has been typed yet —
// the scan never overwrites what the owner filled in by hand.
var _snapPendingFile = null;
function _snapReadWhenOnline(file) {
  const first = !_snapPendingFile;
  _snapPendingFile = file;
  if (!first) return;
  window.addEventListener('online', async function onBack() {
    window.removeEventListener('online', onBack);
    const pending = _snapPendingFile;
    _snapPendingFile = null;
    const attached = $('tc-exp-file')?.files?.[0];
    const untouched = !($('tc-exp-desc')?.value || '').trim() && !($('tc-exp-amount')?.value || '').trim();
    const hasKey = !!(TAX_CENTER.settings?.geminiKey || TAX_CENTER.settings?.openRouterKey?.trim());
    if (!pending || attached !== pending || !untouched || !hasKey) return;
    showToast('📶 Back online — reading your receipt…', 'ok');
    await scanReceiptWithAI();
  });
}

// ── Snap a receipt (phones) ────────────────────────────────────────────────
// One tap from Today: the phone's own camera, then the same AI scan and
// expense form as the Tax Centre, so nothing is saved until you've checked it.
function snapReceipt() {
  $('snap-receipt-input')?.click();
}

async function snapReceiptChosen(input) {
  const file = input?.files?.[0];
  if (input) input.value = ''; // the same photo can be picked again
  if (!file) return;
  switchTab('taxcenter');
  switchTaxCenterSubTab('ledger');
  const fileInput = $('tc-exp-file');
  if (!fileInput) return;
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  $('tc-exp-file-group')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  if (navigator.onLine === false) {
    showToast('📷 Photo attached. No signal — it will be read as soon as you\'re back online. Keep the app open.', 'warn', 6000);
    _snapReadWhenOnline(file);
    return;
  }
  const hasKey = !!(TAX_CENTER.settings?.geminiKey || TAX_CENTER.settings?.openRouterKey?.trim());
  if (!hasKey) {
    showToast('📷 Photo attached. To have it read automatically, add an AI key in Tax Centre → Integrations.', 'warn', 6000);
    return;
  }
  await scanReceiptWithAI();
  // The scan's own message says what it read and what to check.
  $('tc-exp-desc')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

async function submitTaxExpense() {
  const desc = ($('tc-exp-desc').value || '').trim();
  const cat = $('tc-exp-cat').value;
  const currency = $('tc-exp-cur').value || 'CAD';
  const amount = parseFloat($('tc-exp-amount').value) || 0;
  const date = $('tc-exp-date').value || today();

  if (!desc) { showToast('⚠ Please enter a description', 'warn'); $('tc-exp-desc').focus(); return; }
  if (!amount) { showToast('⚠ Please enter an amount', 'warn'); $('tc-exp-amount').focus(); return; }

  const fileInput = $('tc-exp-file');
  let receiptUrl = '';
  let receiptStorage = 'none';
  if (fileInput && fileInput.files.length > 0) {
    const file = fileInput.files[0];
    // Webcam captures are written to the local folder immediately on
    // "Use Photo", so reuse that path instead of writing the same bytes
    // a second time (which would create a duplicate file).
    const pendingCam = getPendingWebcamReceipt();
    if (pendingCam && pendingCam.name === file.name && pendingCam.size === file.size) {
      receiptUrl = pendingCam.url;
      receiptStorage = 'local';
    } else {
      const submitBtn = $('tc-submit-exp-btn');
      const oldText = submitBtn.textContent;
      submitBtn.textContent = 'Saving receipt…'; submitBtn.disabled = true;
      // Folder first, cloud second. The folder is unreachable more often than
      // it looks — permission lapses on every browser restart, and a phone or
      // a borrowed laptop has no folder at all. Before this fallback the
      // expense saved and the receipt quietly went nowhere.
      const saved = await saveReceiptBestEffort(file, 'General', { date, desc, cat, amount, currency });
      submitBtn.textContent = oldText; submitBtn.disabled = false;

      receiptUrl = saved.ref;
      receiptStorage = saved.storage;

      if (receiptStorage === 'none') {
        const proceed = await confirmDialog(
          'The receipt could not be saved to your folder or to the cloud — most likely there\'s no connection right now.\n\nLog the expense without it? You can attach the receipt later from the ledger.',
          { title: 'Receipt could not be saved', okLabel: 'Log without receipt', cancelLabel: 'Cancel' }
        );
        if (!proceed) return;
      }
    }
  }

  // Multi-currency calculation, at the rate for the expense's date. With no
  // rate to be had (offline), the expense is logged without a CAD value and
  // flagged; the Tax Centre fills it in the next time it's online. It used to
  // fall back to 1:1, so US$100 went in as CA$100 for good.
  const fxRate = await resolveExpenseRate(currency, date);
  const baseAmount = fxRate ? roundCents(amount * fxRate) : null;

  if (!TAX_CENTER.businessExpenses) TAX_CENTER.businessExpenses = [];
  const trip = ($('tc-exp-trip')?.value || '').trim();
  const entry = { id: Date.now(), desc, cat, currency, amount, fxRate: fxRate || null, baseAmount, date, ref: '', receipt: receiptUrl, trip };
  if (!fxRate) entry.fxMissing = true;
  // Stamped only on the cloud path, and it is what tells the Tax Centre how
  // long this receipt has been waiting to come home.
  if (receiptStorage === 'cloud') entry.receiptCloudAt = new Date().toISOString();
  TAX_CENTER.businessExpenses.unshift(entry);

  // If this submit came from "Confirm & log" on a pending note, that note's
  // job is done — clear it so the reminder doesn't fire again for an expense
  // that is now actually in the ledger.
  const clearedPending = _tcClearConfirmedPending();

  saveTaxCenter();
  renderTaxCenter();
  if (!fxRate) {
    // Logged, but with no CAD value yet: say so, rather than a plain "Logged".
    showToast(`✓ Logged — no ${currency} exchange rate is available right now, so its CAD value will be filled in next time you open the Tax Centre online`, 'warn', 7000);
  } else if (receiptStorage === 'cloud') {
    // Say it plainly rather than letting a "✓ Logged" imply the receipt is
    // filed where the owner expects to find it.
    showToast('✓ Logged — receipt saved to the cloud until your folder is available', 'ok', 5000);
  } else {
    showToast(clearedPending
      ? `✓ Logged — pending note cleared${trip ? ` · ${trip}` : ''}`
      : (trip ? `✓ Logged to trip: ${trip}` : '✓ Business Expense logged'));
  }
  $('tc-exp-desc').value = ''; $('tc-exp-amount').value = ''; $('tc-exp-date').value = today();
  if ($('tc-exp-trip')) $('tc-exp-trip').value = '';
  if (fileInput) fileInput.value = '';
  if (typeof window.tcExpFileChosen === 'function') window.tcExpFileChosen();
  const filePreview = $('tc-exp-file-preview');
  if (filePreview) filePreview.textContent = '';
  setPendingWebcamReceipt(null);
}

// addRecurring() used to live here, reading a five-field inline form. Both the
// add and the edit path now go through the shared editor sheet in
// src/features/taxcentre.js (openRecurringEditor / saveRecurringEditor), which
// is where the cadence, end-date and pause fields it never had are validated.

// Smart categorization listener
const TAX_CATEGORIES = {
  'squarespace': 'Software & Subscriptions',
  'shopify': 'Software & Subscriptions',
  'google': 'Software & Subscriptions',
  'hosting': 'Software & Subscriptions',
  'domain': 'Software & Subscriptions',
  'adobe': 'Software & Subscriptions',
  'meta': 'Marketing & Advertising',
  'facebook': 'Marketing & Advertising',
  'instagram': 'Marketing & Advertising',
  'ads': 'Marketing & Advertising',
  'mailchimp': 'Marketing & Advertising',
  'usps': 'Shipping & Postage',
  'fedex': 'Shipping & Postage',
  'ups': 'Shipping & Postage',
  'royal mail': 'Shipping & Postage',
  'post office': 'Shipping & Postage',
  'stamps': 'Shipping & Postage',
  'paper': 'Office Supplies',
  'ink': 'Office Supplies',
  'boxes': 'Office Supplies',
  'mailers': 'Office Supplies',
  'flight': 'Travel',
  'uber': 'Travel',
  'hotel': 'Travel',
  'dinner': 'Meals & Entertainment',
  'lunch': 'Meals & Entertainment',
  'restaurant': 'Meals & Entertainment',
  'catering': 'Meals & Entertainment',
  'accountant': 'Professional Services',
  'legal': 'Professional Services',
  'lawyer': 'Professional Services',
  'printer': 'Printing & Production',
  'printing': 'Printing & Production',
  'proof': 'Editorial & Proofreading',
  'editor': 'Editorial & Proofreading',
  'copyedit': 'Editorial & Proofreading',
  'illustration': 'Illustration & Photography',
  'illustrator': 'Illustration & Photography',
  'photo': 'Illustration & Photography',
  'photographer': 'Illustration & Photography',
  'licensing': 'Rights & Permissions',
  'rights': 'Rights & Permissions',
  'permission': 'Rights & Permissions',
  'isbn': 'ISBN, Barcodes & Cataloging',
  'barcode': 'ISBN, Barcodes & Cataloging',
  'cataloging': 'ISBN, Barcodes & Cataloging',
  'warehouse': 'Warehousing & Fulfillment',
  'fulfillment': 'Warehousing & Fulfillment',
  'packaging': 'Packaging Materials',
  'bubble wrap': 'Packaging Materials',
  'research': 'Books, Research & Reference',
  'reference': 'Books, Research & Reference',
  'museum': 'Events & Exhibitions',
  'exhibition': 'Events & Exhibitions',
  'fair': 'Events & Exhibitions',
};

function _tcWireSmartCategory() {
  const descInput = document.getElementById('tc-exp-desc');
  if (descInput) {
    descInput.addEventListener('input', (e) => {
      const val = e.target.value.toLowerCase();
      const catSelect = document.getElementById('tc-exp-cat');
      if (!catSelect) return;
      for (const keyword in TAX_CATEGORIES) {
        if (val.includes(keyword)) {
          catSelect.value = TAX_CATEGORIES[keyword];
          break;
        }
      }
    });
  }
}

// ── Tax Centre keyboard shortcuts ──────────────────────────────────────
// /      → focus Tax Centre ledger search input
// Escape → clear and blur Tax Centre ledger search
function _tcKeyboardShortcuts(e) {
  const tcPanel = $('tab-taxcentre');
  if (!tcPanel || tcPanel.style.display === 'none') return;
  const tag = (document.activeElement || {}).tagName || '';
  const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  const inModal = document.activeElement && document.activeElement.closest('.modal, .overlay');

  const ledgerSearch = $('tc-ledger-search');
  if (e.key === '/' && !inInput && !inModal && ledgerSearch) {
    e.preventDefault();
    ledgerSearch.focus();
    ledgerSearch.select();
    return;
  }
  if (e.key === 'Escape' && !inModal && ledgerSearch && document.activeElement === ledgerSearch) {
    e.preventDefault();
    ledgerSearch.value = '';
    if (typeof window.tcLedgerSearchInput === 'function') window.tcLedgerSearchInput('');
    ledgerSearch.blur();
  }
}

// ── TAX SEASON EXPORT ──
function downloadFullTaxSeasonExport() {
  const yearSelect = document.getElementById('tc-year');
  const year = yearSelect ? yearSelect.value : 'all';
  const isAllTime = (year === 'all');

  let csv = 'Lyricalmyrical Tax Season Export\n';
  csv += 'Generated on: ' + today() + '\n';
  csv += 'Tax Year: ' + (isAllTime ? 'All Time' : year) + '\n\n';

  const esc = csvCell;
  // Track books exported with no saved CAD rate (fell back to 1.0 — a silently
  // wrong tax figure). Keyed by book id so a book is listed at most once.
  const rateWarnings = new Map();
  // Foreign expenses still waiting for a CAD value count 0 here (never 1:1);
  // each is counted once in the notice so the totals aren't mistaken for final.
  const waitingExpenses = new Set();
  const getAmt = (e) => {
    if (isExpenseAwaitingRate(e)) { waitingExpenses.add(e); return 0; }
    return parseFloat(e.baseAmount || e.amountCAD || e.amount || 0);
  };
  const flagRateIfMissing = (book, cur, rawRate, hasAmount) => {
    if (hasAmount && cur && cur !== 'CAD' && !rawRate) rateWarnings.set(book.id, { title: book.title, cur });
  };

  // Section 1: Revenue by Book
  csv += '--- REVENUE BY BOOK ---\n';
  csv += 'Book Title,Gross Revenue,Net Revenue (after COGS & Royalty),Total Units Sold\n';

  BOOK_LIST.forEach(book => {
    if (isTestBook(book) || isTestBookId(book.id)) return;
    const s = states[book.id] || defaultState(book);
    // Sales + royalty are recorded in the book's native currency; convert to the
    // export's base (CAD) so they're comparable with the CAD expense figures.
    const cur = getBookCurrencyCode(book);
    const rawRate = _fxRateCache[`${cur}_CAD`];
    const hRate = rawRate || 1;

    // ⚡ Bolt Optimization: Loop Fusion - Compute sold and revenue in a single pass without intermediate array allocation
    let sold = 0;
    let revenue = 0;
    for (let i = 0; i < s.hist.length; i++) {
      const h = s.hist[i];
      if (h.voided || h.gratuity) continue;
      if (!isAllTime && (!h.date || !h.date.startsWith(year))) continue;
      sold += (h.qty || 0);
      revenue += ((h.qty || 0) * (h.price || 0));
    }

    // ⚡ Bolt Optimization: Loop Fusion - Compute expTotal in a single pass without intermediate array allocation
    let expTotal = 0;
    const expenses = s.expenses || [];
    for (let i = 0; i < expenses.length; i++) {
      const e = expenses[i];
      if (e.voided) continue;
      if (!isAllTime && (!e.date || !e.date.startsWith(year))) continue;
      expTotal += getAmt(e);
    }

    // Royalty
    let shares = 0;
    if (isAllTime) {
      const earn = calculateArtistEarnings(book.id);
      shares = (earn && typeof earn === 'object') ? (earn.totalArtistEarned || 0) : (earn || 0);
    } else {
      shares = filterArtistEarningsByYear(book.id, parseInt(year));
    }

    // expTotal is already CAD (uses each expense's stored baseAmount); convert
    // the native-currency revenue + royalty before subtracting so net is all-CAD.
    const revenueCAD = revenue * hRate;
    const sharesCAD = shares * hRate;
    const net = revenueCAD - expTotal - sharesCAD;
    flagRateIfMissing(book, cur, rawRate, revenue > 0 || shares > 0);
    csv += `${esc(book.title)},${revenueCAD.toFixed(2)},${net.toFixed(2)},${sold}\n`;
  });

  // Section 2: All Expenses & Payouts
  csv += '\n--- ALL EXPENSES & PAYOUTS ---\n';
  csv += 'Date,Book/Entity,Category,Description,Amount (CAD),Receipt Link\n';

  // 2a. Book-level expenses & payouts
  BOOK_LIST.forEach(book => {
    if (isTestBook(book) || isTestBookId(book.id)) return;
    const s = states[book.id] || defaultState(book);
    const cur = getBookCurrencyCode(book);
    const rawRate = _fxRateCache[`${cur}_CAD`];
    const hRate = rawRate || 1;

    // Book Expenses
    (s.expenses || []).filter(e => {
      if (e.voided) return false;
      if (isAllTime) return true;
      return e.date && e.date.startsWith(year);
    }).forEach(e => {
      csv += `${e.date},${esc(book.title)},${esc(e.cat)},${esc(e.desc)},${getAmt(e).toFixed(2)},${esc(e.receipt)}\n`;
    });

    // Artist Payouts — the payments actually recorded against the book.
    //
    // This used to export `artistTransfers`, which is cash the artist has
    // COLLECTED and is still holding, not money the publisher paid out. Those
    // rows are also deleted when a transfer is settled, so the export both
    // named the wrong figure and lost it as soon as it was reconciled.
    (s.artistPayouts || []).filter(p => {
      if (p.voided) return false;
      if (isAllTime) return true;
      return p.date && p.date.startsWith(year);
    }).forEach(p => {
      // `amount` is in the book's native currency — convert to CAD to match the
      // column header.
      const payoutRaw = parseFloat(p.amount || 0);
      flagRateIfMissing(book, cur, rawRate, payoutRaw > 0);
      const payoutCAD = payoutRaw * hRate;
      if (p.settlement) {
        csv += `${p.date},${esc(book.title)},"Earnings settled",${esc('Royalty credit including earnings retained from held sales; see settlement cash section for the actual payment')},${payoutCAD.toFixed(2)},""\n`;
        return;
      }
      // Only the cash is a cash outflow; a netted slice is noted so the row
      // explains itself (a fully netted payment shows 0.00 with the reason).
      const netted = payoutNetted(p);
      const desc = [p.method || 'Payment to artist',
        netted > 0.005 ? `plus ${(netted * hRate).toFixed(2)} netted against money the artist owed` : ''].filter(Boolean).join(' — ');
      csv += `${p.date},${esc(book.title)},"Artist Payout",${esc(desc)},${payoutCAD.toFixed(2)},""\n`;
    });
  });

  // 2b. Include Tax Center business expenses (General Publisher Expenses)
  const ledger = TAX_CENTER.businessExpenses || [];
  ledger.filter(l => {
    if (l.voided) return false;
    if (isAllTime) return true;
    return l.date && l.date.startsWith(year);
  }).forEach(l => {
    csv += `${l.date},"Publisher (General)",${esc(l.cat)},${esc(l.desc)},${getAmt(l).toFixed(2)},${esc(l.receipt)}\n`;
  });

  // Actual settlement transfers are separate from royalty credits and sales.
  csv += '\n--- AUTHOR SETTLEMENT CASH (NOT ADDITIONAL SALES OR EXPENSES) ---\n';
  csv += 'Date,Book,Currency,Money Held,Author Cut Kept,Remaining Earnings,Expenses Repaid,Other Debt Repaid,Overpayment Recovered,Cash Received,Cash Sent,Method\n';
  BOOK_LIST.forEach(book => {
    if (isTestBook(book) || isTestBookId(book.id)) return;
    (states[book.id]?.artistPayouts || []).forEach(p => {
      if (!p.settlement || p.voided || (!isAllTime && !p.date?.startsWith(year))) return;
      const b = p.settlement.balance;
      csv += [p.date, esc(book.title), esc(p.settlement.cur), b.heldGross, b.heldShare, b.royaltiesOwed,
        b.expensesOwed || 0, b.otherDebt, b.overpaid, b.direction === 'to-publisher' ? b.amount : 0,
        b.direction === 'to-artist' ? b.amount : 0, esc(p.method || '')].join(',') + '\n';
    });
  });

  // Section 3: FX rate warnings — surface any book exported at 1.0 because no
  // CAD rate was saved, so a wrong tax figure can't slip through unnoticed.
  if (rateWarnings.size) {
    csv += '\n--- ⚠ FX RATE WARNINGS ---\n';
    csv += `${esc('No saved CAD exchange rate for these books — their amounts above were exported UNCONVERTED (rate 1.0) and are NOT correct. Refresh FX rates (POS cart → ↻ FX Rates), then re-export.')}\n`;
    csv += 'Book Title,Currency,Rate Used\n';
    rateWarnings.forEach(w => { csv += `${esc(w.title)},${esc(w.cur)},1.00\n`; });
  }

  if (waitingExpenses.size) {
    const n = waitingExpenses.size;
    csv += '\n--- ⚠ EXPENSES WAITING FOR AN EXCHANGE RATE ---\n';
    csv += `${esc(`${n} expense${n === 1 ? ' is' : 's are'} still waiting for an exchange rate — counted as 0.00 CAD above, so the expense totals are NOT final. Open the Tax Centre while online to fill them in, then re-export.`)}\n`;
  }

  downloadCsv('﻿' + csv, `Lyrical_Tax_Season_${isAllTime ? 'AllTime' : year}_Export.csv`);

  if (waitingExpenses.size) {
    const n = waitingExpenses.size;
    showToast(`⚠ ${n} expense${n === 1 ? ' is' : 's are'} still waiting for an exchange rate — totals not final.`, 'warn', 7000);
  }
  if (rateWarnings.size) {
    const names = Array.from(rateWarnings.values()).map(w => `${w.title} (${w.cur})`).join(', ');
    showToast(`⚠ Exported, but ${rateWarnings.size} book${rateWarnings.size === 1 ? '' : 's'} had no CAD rate — shown unconverted: ${names}. Refresh FX rates and re-export.`, 'warn', 7000);
  }
}

// Called once by main.js, at the point in start-up where this code used to run
// inline: closes trip pickers on an outside click, wires the edit-expense file
// name and the smart category guess once the page has loaded, and installs the
// ledger search shortcuts.
function initTaxEntries() {
  document.addEventListener('click', _tcCloseTripPickersOnOutsideClick);
  document.addEventListener('DOMContentLoaded', _tcWireEditExpenseFile);
  document.addEventListener('DOMContentLoaded', _tcWireSmartCategory);
  document.addEventListener('keydown', _tcKeyboardShortcuts);
}

export {
  TC_CATEGORIES,
  changeExpenseCategory,
  removeLedgerEntry,
  _tcEditTripId,
  _tcOpenTripName,
  openEditTrip,
  _editingExpense,
  openEditSale,
  openArtistPayoutEditor,
  openEditExpense,
  showTripDetail,
  showCategoryDetail,
  TAX_CATEGORIES,
  initTaxEntries,
  snapReceipt,
  snapReceiptChosen,
  downloadFullTaxSeasonExport,
  exportTripCSV,
  relinkEditExpenseReceipt,
  removeEditExpenseReceipt,
  renameTripPrompt,
  renderEditExpenseReceipts,
  saveExpenseEdit,
  saveTripAssignment,
  scanReceiptWithAI,
  setTripBudgetPrompt,
  submitTaxExpense,
};
