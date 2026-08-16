// Tax Centre — the ledger view, the trips panel, category breakdowns,
// recurring expenses, and the tax-season exports.
//
// The fourth feature lifted out of src/main.js. It is deliberately a narrower
// cut than Open Call, Shipping or Big Cartel, and the reason is worth stating:
// TAX_CENTER is not this feature's state. Thirty-odd functions across main.js
// read it, so does src/features/shipping.js, and applyBackupData — which has
// nothing to do with this screen — reassigns it wholesale when a backup is
// restored. An imported binding cannot be assigned, so moving it here would
// turn that restore into a runtime TypeError, and no lint rule in this repo
// catches that.
//
// So TAX_CENTER stays in main.js and this module imports it. Mutating its
// properties is fine and is what every function here does; only rebinding is
// illegal, and the one Tax Centre function that rebinds it — loadTaxCenter —
// stays behind with it. TC_CATEGORIES stays too, because the expense editor
// shares it.
//
// What moves is the screen: rendering, filtering, paging, the trips panel and
// the exports. That is the part nothing else in the app reaches into.
import {
  $,
  BOOKS,
  BOOK_LIST,
  TAX_CENTER,
  TC_CATEGORIES,
  _fxRateCache,
  calculateFinancials,
  defaultState,
  isAuthor,
  isTestBook,
  isTestBookId,
  ensurePdfJs,
  loadTaxCenter,
  openEditSale,
  saveState,
  showToast,
  states,
  today,
  _tcEditTripId,
  _tcOpenTripName,
} from '../main.js';
import { _localReceiptCell, loadReceiptFolderHandle, resolveLocalReceiptFile, saveReceiptBestEffort } from './receipts.js';
import { openM, closeM, confirmDialog } from '../lib/modal.js';
import { renderShippingReconciliationWorklist } from './shipping.js';
import { escapeHtml } from '../lib/html.js';
import { csvRow, toCsv } from '../lib/csv.js';
import { downloadCsv } from '../lib/download.js';
import { fmt, getSym, getBookCurrencyCode, roundCents } from '../lib/money.js';
import { reconcileConsignmentMirrors } from '../lib/consignment.js';
import { buildCashFlowBuckets, cashFlowDelta, computeCashFlowMetrics } from '../lib/cashflow.js';
import { canonicalExpenseCategory } from '../lib/expense-categories.js';
import { receiptOwners, summarizeReceiptStorage, isRentExpense, isGratuityExpense, isReceiptExemptExpense } from '../lib/receipt-storage.js';
import {
  RECURRING_FREQUENCIES,
  frequencyLabel,
  frequencySuffix,
  monthlyEquivalent,
  newRecurringId,
  nextRecurringDate,
  normalizeRecurring,
  recurringDueCharges,
  recurringStatus,
  relativeDayLabel,
  summarizeRecurring,
} from '../lib/recurring.js';

async function saveTaxCenter({ rethrow = false } = {}) {
  if (isAuthor()) return;
  try {
    await window._fbSaveSettings('taxCenter', TAX_CENTER);
    return true;
  } catch (e) {
    console.error(e);
    if (rethrow) throw e;
    return false;
  }
}

/**
 * Give every subscription a stable id, in place, so the editor and the row
 * actions can address one by identity instead of by array index. Index-based
 * addressing was the source of the fuzzy desc+amount+date re-lookup in
 * removeRecurring: two tabs open, one add, and the index you clicked no longer
 * points at the row you saw. Returns true when something was assigned, so the
 * caller can persist the migration once.
 */
function _tcEnsureRecurringIds() {
  let changed = false;
  (TAX_CENTER.recurring || []).forEach(sub => {
    if (!sub.id) { sub.id = newRecurringId(); changed = true; }
  });
  return changed;
}

/** Look a subscription up by its stable id. */
function _tcFindRecurring(id) {
  return (TAX_CENTER.recurring || []).find(s => String(s.id) === String(id)) || null;
}

function processRecurringExpenses() {
  if (isAuthor() || !TAX_CENTER.recurring || TAX_CENTER.recurring.length === 0) return;
  const now = new Date();

  let modified = _tcEnsureRecurringIds();
  TAX_CENTER.recurring.forEach(sub => {
    // recurringDueCharges honours cadence, the end date and the paused flag,
    // and refuses to log a charge whose date hasn't arrived yet.
    recurringDueCharges(sub, now).forEach(charge => {
      if (!TAX_CENTER.businessExpenses) TAX_CENTER.businessExpenses = [];
      const origCur = sub.currency || 'CAD';
      const fxRate = _fxRateCache[`${origCur}_CAD`] || 1;
      const baseAmount = (parseFloat(sub.amount) || 0) * fxRate;

      TAX_CENTER.businessExpenses.unshift({
        id: Date.now() + Math.random(),
        desc: sub.desc + ' (Recurring)',
        cat: sub.cat,
        currency: origCur,
        amount: parseFloat(sub.amount) || 0,
        fxRate: fxRate,
        baseAmount: baseAmount,
        date: charge.date,
        ref: 'Auto-Injected',
        recurringId: sub.id || '',
        receipt: ''
      });

      sub.lastInjected = charge.monthKey;
      modified = true;
    });
  });

  if (modified) {
    saveTaxCenter();
    renderTaxCenter();
  }
}

function tcExpenseRowDragOver(e, row) {
  e.preventDefault();
  e.stopPropagation();
  if (row) {
    row.style.outline = '2px dashed var(--gold)';
    row.style.background = 'rgba(200, 145, 58, 0.12)';
  }
}

function tcExpenseRowDragLeave(e, row) {
  e.preventDefault();
  e.stopPropagation();
  if (row) {
    row.style.outline = '';
    row.style.background = '';
  }
}

async function tcExpenseRowDrop(e, row, sourceType, sourceId, itemId) {
  e.preventDefault();
  e.stopPropagation();
  if (row) {
    row.style.outline = '';
    row.style.background = '';
  }

  const files = e.dataTransfer?.files;
  if (!files || !files.length) return;

  const file = files[0];
  let exp = null;
  let subfolder = 'General';

  if (sourceType === 'businessExpense') {
    exp = (TAX_CENTER.businessExpenses || []).find(x => String(x.id) === String(itemId));
  } else if (sourceType === 'bookExpense') {
    const s = states[sourceId];
    if (s && s.expenses) {
      exp = s.expenses.find(x => String(x.id) === String(itemId));
      if (BOOKS[sourceId]) subfolder = BOOKS[sourceId].title.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    }
  }

  if (!exp) {
    showToast('⚠ Expense entry not found', 'err');
    return;
  }

  // Folder first, cloud second. The old fallback here invented a
  // `local://<name>` reference for a file that had never been written, so the
  // ledger showed a "View Local" link that could only ever fail to open.
  const saved = await saveReceiptBestEffort(file, subfolder);
  if (saved.storage === 'none') {
    showToast(`⚠ Could not save "${file.name}" — nothing was attached`, 'err', 5000);
    return;
  }

  if (!Array.isArray(exp.receiptFiles)) exp.receiptFiles = exp.receipt ? [exp.receipt] : [];
  exp.receiptFiles.push(saved.ref);
  exp.receipt = exp.receiptFiles[0] || '';
  if (saved.storage === 'cloud' && !exp.receiptCloudAt) exp.receiptCloudAt = new Date().toISOString();

  if (sourceType === 'businessExpense') {
    await saveTaxCenter();
  } else if (sourceType === 'bookExpense') {
    await saveState(sourceId);
  }

  renderTaxCenter();
  showToast(
    saved.storage === 'cloud'
      ? `✓ Attached "${file.name}" — saved to the cloud until your folder is available`
      : `✓ Attached receipt "${file.name}" to "${exp.desc || 'Expense'}"`,
    'ok',
    saved.storage === 'cloud' ? 5000 : undefined
  );
}

function downloadTaxReport() {
  const year = $('fin-year-selector').value;
  const fin = calculateFinancials(parseInt(year));
  const yearStr = String(year);

  let csv = 'Date,Type,Book/Source,Category,Description,Receipt URL,Revenue,COGS,Expense,Artist Payout,Net\n';

  BOOK_LIST.forEach(book => {
    if (isTestBook(book) || isTestBookId(book.id)) return;
    const s = states[book.id] || defaultState(book);
    // The sale rows below are read off the History mirrors, so re-derive them
    // from the consignment ledger first — otherwise a sale whose commission or
    // price was corrected exports at its original amount.
    reconcileConsignmentMirrors(s);

    // ⚡ Bolt Optimization: Use imperative loop to avoid array allocation from .filter()
    if (s.hist && s.hist.length > 0) {
      for (const h of s.hist) {
        if (h.voided || h.gratuity) continue;

        // ⚡ Bolt Optimization: Use string prefix matching for "YYYY-MM-DD" formatted dates to avoid expensive Date parsing inside loops
        if (h.date && h.date.startsWith(yearStr)) {
          const gross = (h.qty * h.price).toFixed(2);
          csv += csvRow([h.date, 'Order', book.title, 'Sale',
            `${h.chan} Order #${h.num}`, '', gross, 0, 0, 0, gross]) + '\n';
        }
      }
    }

    (s.expenses || []).forEach(e => {
      // ⚡ Bolt Optimization: Use string prefix matching for "YYYY-MM-DD" formatted dates to avoid expensive Date parsing inside loops
      if (e.date && e.date.startsWith(yearStr)) {
        csv += csvRow([e.date, 'Expense', book.title, e.cat, e.desc, e.receipt || '',
          0, 0, e.amount.toFixed(2), 0, -e.amount.toFixed(2)]) + '\n';
      }
    });
  });

  // Summary lines for COGS and Shares
  csv += `\nSUMMARY FOR ${year},,,,,,,,,\n`;
  fin.bookStats.forEach(bs => {
    csv += csvRow([`${year}-12-31`, 'COGS Summary', bs.title, 'COGS', 'Inventory Recovery', '',
      0, bs.cogs.toFixed(2), 0, 0, -bs.cogs.toFixed(2)]) + '\n';
    csv += csvRow([`${year}-12-31`, 'Artist Share', bs.title, 'Royalty', 'Tiered Payout', '',
      0, 0, 0, bs.shares.toFixed(2), -bs.shares.toFixed(2)]) + '\n';
  });

  downloadCsv(csv, `Lyrical_Tax_Report_${year}.csv`);
}

const TC_LEDGER_PAGE_SIZE = 25;
let _tcLedgerPage = 0;
let _tcLedgerSearch = '';
let _tcLedgerType = 'all'; // 'all' | 'sales' | 'expenses'
let _tcLedgerSearchTimer = null;

const TC_LEDGER_PREFS_KEY = 'lm-tc-ledger-prefs';
let _tcPrefsRestored = false;

function _tcSaveLedgerPrefs() {
  const yearEl = $('tc-year');
  try {
    localStorage.setItem(TC_LEDGER_PREFS_KEY, JSON.stringify({
      search: _tcLedgerSearch,
      type: _tcLedgerType,
      year: yearEl ? yearEl.value : 'all',
    }));
  } catch (e) { /* ignore quota / private-mode errors */ }
}

function _tcRestoreLedgerPrefs() {
  if (_tcPrefsRestored) return;
  _tcPrefsRestored = true;
  let p = {};
  try { p = JSON.parse(localStorage.getItem(TC_LEDGER_PREFS_KEY) || '{}') || {}; } catch (e) { p = {}; }
  if (typeof p.search === 'string') {
    _tcLedgerSearch = p.search;
    const el = $('tc-ledger-search'); if (el) el.value = p.search;
  }
  if (p.type === 'sales' || p.type === 'expenses' || p.type === 'all') {
    _tcLedgerType = p.type;
    const el = $('tc-ledger-type'); if (el) el.value = p.type;
  }
  if (typeof p.year === 'string') {
    // Apply to BOTH year selects (Cash Flow Summary + Master Ledger) so they
    // agree on the restored period. Only restore a year the dropdown offers.
    [$('tc-year'), $('tc-year-ledger')].forEach(el => {
      if (el && Array.from(el.options).some(o => o.value === p.year)) el.value = p.year;
    });
  }
}

function setTcLedgerPage(n) {
  _tcLedgerPage = n;
  renderTaxCenter();
}

function tcLedgerSearchInput(v) {
  _tcLedgerSearch = v || '';
  clearTimeout(_tcLedgerSearchTimer);
  _tcLedgerSearchTimer = setTimeout(() => { _tcLedgerPage = 0; _tcSaveLedgerPrefs(); renderTaxCenter(); }, 200);
}

function tcLedgerTypeFilter(v) {
  _tcLedgerType = (v === 'sales' || v === 'expenses') ? v : 'all';
  _tcLedgerPage = 0;
  _tcSaveLedgerPrefs();
  renderTaxCenter();
}

function tcYearChange(value) {
  const v = typeof value === 'string' ? value : 'all';
  [$('tc-year'), $('tc-year-ledger')].forEach(el => {
    if (el && Array.from(el.options).some(o => o.value === v)) el.value = v;
  });
  _tcLedgerPage = 0;
  _tcSaveLedgerPrefs();
  renderTaxCenter();
}

function tcLedgerYearChange() {
  const el = $('tc-year') || $('tc-year-ledger');
  tcYearChange(el ? el.value : 'all');
}

let _tcLedgerSpecialFilter = ''; // '' | 'missing' | 'cloud' | 'local' | 'linked' | 'label'

function tcClearLedgerFilters() {
  _tcLedgerSearch = '';
  _tcLedgerType = 'all';
  _tcLedgerSpecialFilter = '';
  _tcLedgerPage = 0;
  const sEl = $('tc-ledger-search'); if (sEl) sEl.value = '';
  const tEl = $('tc-ledger-type'); if (tEl) tEl.value = 'all';
  _tcSaveLedgerPrefs();
  renderTaxCenter();
}

function tcFilterLedgerByReceiptStorage(storageType) {
  _tcLedgerSpecialFilter = (_tcLedgerSpecialFilter === storageType) ? '' : storageType;
  _tcLedgerPage = 0;
  switchTaxCenterSubTab('ledger');
  renderTaxCenter();
  const target = $('tc-ledger-search') || $('tc-sec-ledger');
  if (target && _tcLedgerSpecialFilter) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('tc-flash-target');
    setTimeout(() => target.classList.remove('tc-flash-target'), 1500);
  }
}

function _tcApplyLedgerFilter(rows) {
  let out = rows;
  if (_tcLedgerType === 'sales') out = out.filter(r => r.isIncome);
  else if (_tcLedgerType === 'expenses') out = out.filter(r => !r.isIncome);

  if (_tcLedgerSpecialFilter) {
    if (_tcLedgerSpecialFilter === 'missing') {
      out = out.filter(r => !r.isIncome && !isReceiptExemptExpense(r) && !r.receipt && (!r.receiptFiles || !r.receiptFiles.length) && !(typeof r.ref === 'string' && (r.ref.includes('local://') || /^https?:\/\//i.test(r.ref))));
    } else if (_tcLedgerSpecialFilter === 'cloud') {
      out = out.filter(r => !r.isIncome && (r.receiptCloudAt || (typeof r.receipt === 'string' && r.receipt.startsWith('cloud://')) || (Array.isArray(r.receiptFiles) && r.receiptFiles.some(f => f && f.startsWith('cloud://')))));
    } else if (_tcLedgerSpecialFilter === 'local') {
      out = out.filter(r => !r.isIncome && ((typeof r.receipt === 'string' && r.receipt.startsWith('local://')) || (typeof r.ref === 'string' && r.ref.includes('local://')) || (Array.isArray(r.receiptFiles) && r.receiptFiles.some(f => f && f.startsWith('local://')))));
    } else if (_tcLedgerSpecialFilter === 'linked') {
      out = out.filter(r => !r.isIncome && ((typeof r.receipt === 'string' && /^https?:\/\//i.test(r.receipt) && !r.receipt.includes('shippo')) || (Array.isArray(r.receiptFiles) && r.receiptFiles.some(f => /^https?:\/\//i.test(f) && !f.includes('shippo')))));
    } else if (_tcLedgerSpecialFilter === 'label') {
      out = out.filter(r => !r.isIncome && ((typeof r.receipt === 'string' && r.receipt.includes('shippo')) || (typeof r.ref === 'string' && r.ref.includes('shippo'))));
    }
  }

  const q = _tcLedgerSearch.trim().toLowerCase();
  if (q) {
    out = out.filter(r => {
      const hay = `${r.date || ''} ${r.type || ''} ${r.desc || ''} ${r.cat || ''} ${r.ref || ''} ${r.origCurrency || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }
  return out;
}

// ── Recurring subscriptions ─────────────────────────────────────────────────
// The panel is a small ledger of its own: each row is a standing commitment,
// and the numbers people actually want off this screen are "what do these cost
// me a month" and "what lands next". Both were previously absent — the table
// listed a raw amount and the YYYY-MM of the last injection and stopped there.

/** Which lifecycle bucket the table is filtered to. */
let _tcRecurringFilter = 'all';

const REC_STATUS_META = {
  active: { cls: 'green', glyph: '●', label: 'Active' },
  scheduled: { cls: 'blue', glyph: '◷', label: 'Scheduled' },
  paused: { cls: 'gray', glyph: '❚❚', label: 'Paused' },
  ended: { cls: 'gray', glyph: '✓', label: 'Ended' },
  invalid: { cls: 'red', glyph: '⚠', label: 'Needs a date' },
};

function tcSetRecurringFilter(f) {
  _tcRecurringFilter = ['active', 'paused', 'ended'].includes(f) ? f : 'all';
  _tcRenderRecurringSubscriptions();
}

/** How many ledger expenses this subscription has posted so far. */
function _tcRecurringChargeCount(sub) {
  const legacyDesc = `${sub.desc} (Recurring)`;
  return (TAX_CENTER.businessExpenses || []).filter(e =>
    (sub.id && e.recurringId === sub.id) || (!e.recurringId && e.desc === legacyDesc)
  ).length;
}

/**
 * Jump the ledger below to just this subscription's posted charges. The whole
 * point of the "12 charges" link — the injected expenses are the evidence, and
 * they were previously three scrolls and a guessed search term away.
 */
function tcShowRecurringCharges(id) {
  const sub = _tcFindRecurring(id);
  if (!sub) return;
  const yearSel = $('tc-year-ledger') || $('tc-year');
  if (yearSel && Array.from(yearSel.options).some(o => o.value === 'all')) tcYearChange('all');
  const typeSel = $('tc-ledger-type');
  if (typeSel) typeSel.value = 'expenses';
  tcLedgerTypeFilter('expenses');
  const searchEl = $('tc-ledger-search');
  if (searchEl) searchEl.value = sub.desc;
  tcLedgerSearchInput(sub.desc);
  $('tc-ledger-search')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function _tcRecurringRowHtml(raw, now, baseCurrency) {
  const s = normalizeRecurring(raw);
  const status = recurringStatus(s, now);
  const meta = REC_STATUS_META[status] || REC_STATUS_META.active;
  const cur = s.currency || baseCurrency;
  const rate = cur === baseCurrency ? 1 : Number(_fxRateCache[`${cur}_${baseCurrency}`]) || 0;
  const perMonth = monthlyEquivalent(s);
  const inactive = status === 'paused' || status === 'ended';

  // Per-month column: converted where a rate is known, flagged with ≈ where it
  // isn't, rather than silently reporting a USD figure as if it were CAD.
  const perMonthCell = inactive
    ? '<span class="rec-dim">—</span>'
    : rate
      ? `${fmt(perMonth * rate, baseCurrency)}`
      : `<span class="rec-approx" title="No ${cur}→${baseCurrency} rate cached yet — shown unconverted.">≈ ${fmt(perMonth, cur)}</span>`;

  const next = nextRecurringDate(s, now);
  const nextCell = next
    ? `<div class="rec-next-date">${escapeHtml(next)}</div><div class="rec-next-rel">${escapeHtml(relativeDayLabel(next, now))}</div>`
    : status === 'paused'
      ? '<span class="rec-dim">Held</span>'
      : status === 'ended'
        ? `<span class="rec-dim">Ended ${escapeHtml(s.endDate || '')}</span>`
        : '<span class="rec-dim">—</span>';

  const charges = _tcRecurringChargeCount(s);
  const chargeLink = charges
    ? `<button type="button" class="rec-charge-link" onclick="tcShowRecurringCharges('${escapeHtml(s.id)}')" title="Show these ${charges} posted charges in the ledger below">${charges} charge${charges === 1 ? '' : 's'} logged →</button>`
    : '<span class="rec-dim">Nothing posted yet</span>';

  const subline = [s.vendor, s.cat].filter(Boolean).map(escapeHtml).join(' · ');

  return `
    <tr class="rec-row${inactive ? ' is-inactive' : ''}">
      <td>
        <div class="rec-name">${escapeHtml(s.desc || 'Untitled')}</div>
        <div class="rec-meta">${subline}</div>
        <div class="rec-meta">${chargeLink}</div>
        ${s.notes ? `<div class="rec-note">${escapeHtml(s.notes)}</div>` : ''}
      </td>
      <td><span class="pill gray">${escapeHtml(frequencyLabel(s.frequency))}</span>
        <div class="rec-meta">from ${escapeHtml(s.startDate || '—')}${s.endDate ? ` → ${escapeHtml(s.endDate)}` : ''}</div>
      </td>
      <td class="r rec-amount-cell">${fmt(s.amount, cur)}<span class="rec-per">${escapeHtml(frequencySuffix(s.frequency))}</span></td>
      <td class="r rec-amount-cell">${perMonthCell}</td>
      <td>${nextCell}</td>
      <td><span class="pill ${meta.cls}">${meta.glyph} ${meta.label}</span></td>
      <td class="r">
        <div class="rec-actions">
          <button class="btn sm" onclick="openRecurringEditor('${escapeHtml(s.id)}')" title="Edit this subscription">Edit</button>
          ${status === 'ended' ? '' : `<button class="btn sm" onclick="toggleRecurringPause('${escapeHtml(s.id)}')" title="${s.paused ? 'Resume billing from this month' : 'Stop posting charges without deleting the record'}">${s.paused ? 'Resume' : 'Pause'}</button>`}
          <button class="btn sm danger-btn" onclick="removeRecurring('${escapeHtml(s.id)}')" title="Delete this subscription">Remove</button>
        </div>
      </td>
    </tr>`;
}

function _tcRenderRecurringSummary(subs, summary, baseCurrency) {
  const el = $('tc-recurring-summary');
  if (!el) return;
  if (!subs.length) { el.innerHTML = ''; return; }

  const approx = summary.unconverted.length
    ? `<div class="rec-stat-note" title="No cached rate for ${summary.unconverted.join(', ')} — those lines are counted at 1:1 until a rate is fetched.">≈ excludes ${escapeHtml(summary.unconverted.join(', '))} conversion</div>`
    : '';
  const nextUp = summary.nextUp
    ? `<div class="rec-stat-val">${escapeHtml(relativeDayLabel(summary.nextUp.date))}</div>
       <div class="rec-stat-lbl">Next charge · ${escapeHtml(summary.nextUp.sub.desc || '')}</div>`
    : `<div class="rec-stat-val">—</div><div class="rec-stat-lbl">Next charge</div>`;

  el.innerHTML = `
    <div class="rec-stat">
      <div class="rec-stat-val">${fmt(summary.monthlyBase, baseCurrency)}</div>
      <div class="rec-stat-lbl">Committed per month</div>
      ${approx}
    </div>
    <div class="rec-stat">
      <div class="rec-stat-val">${fmt(summary.annualBase, baseCurrency)}</div>
      <div class="rec-stat-lbl">Annualised run rate</div>
    </div>
    <div class="rec-stat">${nextUp}</div>
    <div class="rec-stat">
      <div class="rec-stat-val">${summary.activeCount + summary.scheduledCount}</div>
      <div class="rec-stat-lbl">Live${summary.pausedCount ? ` · ${summary.pausedCount} paused` : ''}${summary.endedCount ? ` · ${summary.endedCount} ended` : ''}</div>
    </div>`;
}

function _tcRenderRecurringFilters(counts) {
  const el = $('tc-recurring-filters');
  if (!el) return;
  const total = counts.all;
  if (!total) { el.innerHTML = ''; return; }
  const tabs = [
    ['all', 'All', counts.all],
    ['active', 'Active', counts.active],
    ['paused', 'Paused', counts.paused],
    ['ended', 'Ended', counts.ended],
  ].filter(([id, , n]) => id === 'all' || n > 0);
  el.innerHTML = tabs.map(([id, label, n]) => `
    <button type="button" class="rec-filter${_tcRecurringFilter === id ? ' is-on' : ''}"
      aria-pressed="${_tcRecurringFilter === id}" onclick="tcSetRecurringFilter('${id}')">
      ${label}<span class="rec-filter-count">${n}</span>
    </button>`).join('');
}

function _tcRenderRecurringSubscriptions() {
  const recBody = $('tc-recurring-body');
  if (!recBody) return;

  const now = new Date();
  const baseCurrency = TAX_CENTER.settings?.baseCurrency || 'CAD';
  const subs = TAX_CENTER.recurring || [];

  const summary = summarizeRecurring(subs, _fxRateCache, baseCurrency, now);
  _tcRenderRecurringSummary(subs, summary, baseCurrency);
  _tcRenderRecurringFilters({
    all: subs.length,
    active: summary.activeCount + summary.scheduledCount,
    paused: summary.pausedCount,
    ended: summary.endedCount,
  });

  // Soonest charge first so the panel reads as a calendar; paused and ended
  // rows sink to the bottom where they don't compete with live commitments.
  const rows = subs
    .map(s => ({ s, status: recurringStatus(s, now), next: nextRecurringDate(s, now) }))
    .filter(r => {
      if (_tcRecurringFilter === 'all') return true;
      if (_tcRecurringFilter === 'active') return r.status === 'active' || r.status === 'scheduled' || r.status === 'invalid';
      return r.status === _tcRecurringFilter;
    })
    .sort((a, b) => {
      const rank = (r) => (r.status === 'paused' ? 1 : r.status === 'ended' ? 2 : 0);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return (a.next || '9999').localeCompare(b.next || '9999');
    });

  const wrap = $('tc-recurring-tbl-wrap');
  const empty = $('tc-recurring-empty');
  if (!subs.length) {
    if (wrap) wrap.style.display = 'none';
    if (empty) {
      empty.style.display = '';
      empty.innerHTML = `
        <div class="empty-state">
          <div class="e-icon">🔁</div>
          No recurring costs tracked yet. Add hosting, software or rent once and it
          posts itself to the ledger every period.
          <div style="margin-top:12px;">
            <button class="btn gold" onclick="openRecurringEditor()">+ Add subscription</button>
          </div>
        </div>`;
    }
    recBody.innerHTML = '';
    return;
  }
  if (wrap) wrap.style.display = '';
  if (empty) { empty.style.display = 'none'; empty.innerHTML = ''; }

  recBody.innerHTML = rows.map(r => _tcRecurringRowHtml(r.s, now, baseCurrency)).join('')
    || `<tr><td colspan="7"><div class="empty-state" style="padding:1rem;">Nothing in this view. <button type="button" class="rec-charge-link" onclick="tcSetRecurringFilter('all')">Show all →</button></div></td></tr>`;
}

function _tcRenderLedgerPagination(filteredLedger, pageStart, totalPages) {
  const pgWrap = $('tc-ledger-pagination');
  if (pgWrap) {
    if (totalPages <= 1) {
      pgWrap.innerHTML = '';
    } else {
      const from = filteredLedger.length ? pageStart + 1 : 0;
      const to = Math.min(pageStart + TC_LEDGER_PAGE_SIZE, filteredLedger.length);
      const btnStyle = 'padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;border:1px solid var(--border);background:var(--cream2);color:var(--text);';
      const activeBtnStyle = 'padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;border:1px solid var(--gold);background:var(--gold);color:var(--ink);font-weight:600;';
      // Show at most 7 page buttons around current page
      const maxBtns = 7;
      let startBtn = Math.max(0, _tcLedgerPage - Math.floor(maxBtns / 2));
      let endBtn = Math.min(totalPages - 1, startBtn + maxBtns - 1);
      if (endBtn - startBtn < maxBtns - 1) startBtn = Math.max(0, endBtn - maxBtns + 1);
      let btns = '';
      if (startBtn > 0) btns += `<button style="${btnStyle}" onclick="setTcLedgerPage(0)">1</button><span style="color:var(--text3);padding:0 4px;">…</span>`;
      for (let p = startBtn; p <= endBtn; p++) {
        btns += `<button style="${p === _tcLedgerPage ? activeBtnStyle : btnStyle}" onclick="setTcLedgerPage(${p})">${p + 1}</button>`;
      }
      if (endBtn < totalPages - 1) btns += `<span style="color:var(--text3);padding:0 4px;">…</span><button style="${btnStyle}" onclick="setTcLedgerPage(${totalPages - 1})">${totalPages}</button>`;
      pgWrap.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;flex-wrap:wrap;gap:8px;">
          <span style="font-size:12px;color:var(--text3);">Showing ${from}–${to} of ${filteredLedger.length} entries</span>
          <div style="display:flex;gap:4px;align-items:center;">
            <button style="${btnStyle}" onclick="setTcLedgerPage(${_tcLedgerPage - 1})" ${_tcLedgerPage === 0 ? 'disabled' : ''}>‹ Prev</button>
            ${btns}
            <button style="${btnStyle}" onclick="setTcLedgerPage(${_tcLedgerPage + 1})" ${_tcLedgerPage === totalPages - 1 ? 'disabled' : ''}>Next ›</button>
          </div>
        </div>`;
    }
  }
}

function _tcRenderLedgerFilterChip() {
  const filterChip = $('tc-ledger-filter-chip');
  if (filterChip) {
    const parts = [];
    if (_tcLedgerType === 'sales') parts.push('Sales only');
    else if (_tcLedgerType === 'expenses') parts.push('Expenses only');
    if (_tcLedgerSpecialFilter === 'missing') parts.push('⚠️ Missing receipts only');
    else if (_tcLedgerSpecialFilter === 'cloud') parts.push('☁️ Cloud storage receipts');
    else if (_tcLedgerSpecialFilter === 'local') parts.push('📁 Local folder receipts');
    else if (_tcLedgerSpecialFilter === 'linked') parts.push('🔗 External link receipts');
    else if (_tcLedgerSpecialFilter === 'label') parts.push('🏷️ Shipping labels only');
    const q = _tcLedgerSearch.trim();
    if (q) parts.push(`“${escapeHtml(q)}”`);
    filterChip.innerHTML = parts.length
      ? `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;background:var(--gold-bg);color:var(--gold);border:1px solid var(--gold-line);border-radius:14px;padding:3px 6px 3px 12px;">Filtered: ${parts.join(' · ')}<button onclick="tcClearLedgerFilters()" title="Clear filters" aria-label="Clear filters" style="border:none;background:transparent;color:inherit;cursor:pointer;font-size:14px;line-height:1;padding:0 4px;">✕</button></span>`
      : '';
  }
}

function _tcRenderLedgerFoot(filteredLedger, baseCurrency) {
  const footEl = $('tc-ledger-foot');
  if (footEl) {
    if (!filteredLedger.length) {
      footEl.innerHTML = '';
    } else {
      let fIncome = 0, fExpense = 0;
      for (const r of filteredLedger) {
        if (r.isIncome) fIncome += r.baseAmount || 0;
        else fExpense += r.baseAmount || 0;
      }
      const fNet = fIncome - fExpense;
      const netColor = fNet >= 0 ? 'var(--green)' : 'var(--red)';
      footEl.innerHTML = `
        <tr>
          <td colspan="8" style="padding:10px 12px;background:var(--cream2);border-top:2px solid var(--gold-line);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;font-size:13px;">
              <span style="color:var(--text3);">${filteredLedger.length} ${filteredLedger.length === 1 ? 'entry' : 'entries'}${(_tcLedgerSearch.trim() || _tcLedgerType !== 'all') ? ' (filtered)' : ''}</span>
              <div style="display:flex;gap:18px;flex-wrap:wrap;" class="num">
                <span>Income <strong style="color:var(--green);">+${fmt(fIncome, baseCurrency)}</strong></span>
                <span>Expenses <strong style="color:var(--red);">-${fmt(fExpense, baseCurrency)}</strong></span>
                <span>Net <strong style="color:${netColor};">${fmt(fNet, baseCurrency)}</strong></span>
              </div>
            </div>
          </td>
        </tr>`;
    }
  }
}

function _tcRenderLedgerTable(pageLedger, baseCurrency) {
  const ledTbody = $('tc-ledger-body');
  if (ledTbody) {
    ledTbody.innerHTML = pageLedger.map(item => {
      // Build receipt/ref cell — receipt links AND the reference number
      // together; a ref must never hide the saved receipt files.
      let displayRef = item.ref != null ? String(item.ref) : '';
      let legacyReceipt = '';
      // Legacy cleanup: if ref contains a local link, extract it
      if (displayRef && displayRef.includes('local://')) {
        const match = displayRef.match(/href="([^"]+)"/);
        if (match) legacyReceipt = match[1];
        displayRef = '';
      }
      const links = _localReceiptCell(item) || (legacyReceipt ? _localReceiptCell({ receipt: legacyReceipt }) : '');
      const refCell = [
        links,
        displayRef ? `<span style="font-size:11px;color:var(--text3);">${displayRef}</span>` : '',
        item.invoiceNum ? `<span style="font-size:11px;color:var(--gold);">🧾 ${escapeHtml(item.invoiceNum)}</span>` : ''
      ].filter(Boolean).join('<br>');

      // Show original amount in its native currency; show CAD equivalent separately
      const origSym = getSym(item.origCurrency || 'CAD');
      const origDisplay = `${origSym}${Number(item.origAmount || 0).toFixed(2)}`;
      const cadDisplay = `${item.isIncome ? '+' : '-'}${fmt(item.baseAmount, baseCurrency)}`;

      const catCell = item.sourceType === 'businessExpense'
        ? `<select class="tc-ledger-cat-select" onchange="changeExpenseCategory('${item.itemId}', this.value)" title="Change category">
              ${TC_CATEGORIES.map(c => `<option value="${c.replace(/"/g, '&quot;')}"${c === item.cat ? ' selected' : ''}>${c}</option>`).join('')}
              ${TC_CATEGORIES.includes(item.cat) ? '' : `<option value="${(item.cat || '').replace(/"/g, '&quot;')}" selected>${item.cat || ''}</option>`}
            </select>`
        : item.cat;

      let descCell = item.desc || '';
      if (item.sourceType === 'businessExpense') {
        const tripPill = item.trip
          ? `<span class="tc-ledger-trip-chip is-set" onclick="event.stopPropagation();openEditTrip('${item.itemId}')" title="Edit trip">✈ ${item.trip}</span>`
          : `<span class="tc-ledger-trip-chip is-unset" onclick="event.stopPropagation();openEditTrip('${item.itemId}')" title="Assign to a trip">+ trip</span>`;
        descCell = `<div>${item.desc || ''}</div>${tripPill}`;
      }

      return `
        <tr class="tc-ledger-row" ondragover="tcExpenseRowDragOver(event, this)" ondragleave="tcExpenseRowDragLeave(event, this)" ondrop="tcExpenseRowDrop(event, this, '${item.sourceType || ''}', '${item.sourceId || ''}', '${item.itemId || ''}')">
            <td style="font-size:12px;">${item.date || '—'}</td>
            <td><span class="tag ${item.isIncome ? 'green' : 'amber'}">${item.type}</span></td>
            <td style="font-size:12px;">${descCell}</td>
            <td style="font-size:12px;">${catCell}</td>
            <td style="font-size:12px;">${refCell}</td>
            <td class="r" style="font-size:12px;color:var(--text3);">${origDisplay}</td>
            <td class="r tc-ledger-amt ${item.isIncome ? 'in' : 'out'}">${cadDisplay}</td>
            <td class="r">
              ${(item.sourceType === 'businessExpense' || item.sourceType === 'bookExpense')
          ? `<button class="edit-btn" aria-label="Edit entry" onclick="openEditExpense('${item.sourceType}', '${item.sourceId || ''}', '${item.itemId}')" title="Edit entry">✎</button>`
          : (item.sourceType === 'sale'
            ? `<button class="edit-btn" aria-label="Edit entry" onclick="openEditSale('${item.sourceId || ''}', '${item.itemId}')" title="Edit entry">✎</button>`
            : (item.sourceType === 'artistPayout'
              ? `<button class="edit-btn" aria-label="Edit entry" onclick="openEditArtistPayout('${item.sourceId || ''}', '${item.itemId}')" title="Edit entry">✎</button>`
              : ''
            )
          )
        }
              ${item.itemId ? `<button class="edit-btn" aria-label="Delete entry" onclick="removeLedgerEntry('${item.sourceType}', '${item.sourceId || ''}', '${item.itemId}')" title="Delete entry" style="opacity:1;color:var(--red);">✕</button>` : ''}
            </td>
        </tr>`;
    }).join('') || `<tr><td colspan="8"><div class="empty-state" style="padding:1rem;">${(_tcLedgerSearch.trim() || _tcLedgerType !== 'all') ? 'No entries match your filter' : 'No data for selected period'}</div></td></tr>`;
  }
}

// Rank-based dot colors for the category breakdown — matches the hues already
// used for trip category bars (TC_TRIP_CAT_COLORS) so the two "which bucket
// is this" visual languages stay consistent. Only the top few ranks get a
// distinct hue; the long tail shares a single muted dot.
const TC_CATEGORY_RANK_DOTS = ['var(--gold3)', '#f43f5e', '#6366f1', '#14b8a6'];

function _tcRenderCategoryPanel(allLedger, baseCurrency) {
  const catBody = $('tc-category-body');
  const catFoot = $('tc-category-foot');
  if (catBody) {
    const expenses = allLedger.filter(item => !item.isIncome);
    const catSummary = {};
    expenses.forEach(ex => {
      const c = ex.cat || 'Uncategorized';
      if (!catSummary[c]) catSummary[c] = { total: 0, count: 0, items: [] };
      catSummary[c].total += ex.baseAmount;
      catSummary[c].count++;
      catSummary[c].items.push(ex);
    });
    const catList = Object.keys(catSummary).map(c => ({ name: c, ...catSummary[c] })).sort((a, b) => b.total - a.total);

    // Stash by index so the detail modal can read transactions without escaping issues.
    window._tcCategoryDetail = {
      baseCurrency,
      byName: catSummary
    };

    const grandTotal = catList.reduce((sum, c) => sum + c.total, 0);
    const totalTxns = catList.reduce((sum, c) => sum + c.count, 0);

    catBody.innerHTML = catList.map((c, i) => {
      const pct = grandTotal > 0 ? (c.total / grandTotal) * 100 : 0;
      // Clamp so a real-but-tiny share (e.g. 0.04%) still renders a sliver instead of vanishing.
      const barWidth = pct > 0 ? Math.max(pct, 1.5) : 0;
      // A category worth $11 out of $31k rounds to "0.0%", which reads as an
      // error rather than a rounding artifact — say "<0.1%" instead.
      const pctLabel = pct >= 10 ? `${pct.toFixed(0)}%` : (pct > 0 && pct < 0.1 ? '&lt;0.1%' : `${pct.toFixed(1)}%`);
      const dotColor = TC_CATEGORY_RANK_DOTS[i] || 'var(--text4)';
      const txnLabel = `${c.count} transaction${c.count === 1 ? '' : 's'}`;
      // The row carries the click for a fat mouse/touch target, but the
      // keyboard path and the accessible name live on a real <button> in the
      // first cell — putting role="button" on the <tr> would strip the row out
      // of the table semantics screen readers rely on to read the other cells.
      return `
          <tr onclick="showCategoryDetail(this.dataset.cat)" data-cat="${escapeHtml(c.name)}" style="cursor:pointer;" title="${escapeHtml(c.name)} — ${txnLabel}, ${pctLabel} of total deductible spend">
            <td><span class="tc-cat-name"><span class="con-group-dot" style="background:${dotColor};"></span><button type="button" class="tc-cat-link" onclick="event.stopPropagation();showCategoryDetail('${escapeHtml(c.name).replace(/'/g, '&#39;')}')">${escapeHtml(c.name)}</button></span></td>
            <td class="r">${c.count}</td>
            <td class="r">
              <span class="tc-cat-pct" role="img" aria-label="${pctLabel} of total">
                <span class="con-row-progress"><span class="con-row-progress-bar" style="width:${barWidth}%;"></span></span>
                <span class="tc-cat-pct-label" aria-hidden="true">${pctLabel}</span>
              </span>
            </td>
            <td class="r" style="font-weight:bold;color:var(--red);">- ${fmt(c.total, baseCurrency)}<span class="tc-cat-chevron" aria-hidden="true">›</span></td>
          </tr>
      `;
    }).join('') || `<tr><td colspan="4"><div class="empty-state" style="padding:1rem;">No deductible expenses recorded</div></td></tr>`;

    if (catFoot) {
      catFoot.innerHTML = catList.length ? `
        <tr class="tc-cat-foot-row">
          <td>${catList.length} categor${catList.length === 1 ? 'y' : 'ies'}</td>
          <td class="r">${totalTxns}</td>
          <td class="r tc-cat-foot-pct">100%</td>
          <td class="r" style="color:var(--red);">- ${fmt(grandTotal, baseCurrency)}</td>
        </tr>
      ` : '';
    }
  }
}

let _tcTripsViewMode = localStorage.getItem('tc_trips_view_mode') || 'cards';

function tcSetTripsView(mode) {
  _tcTripsViewMode = mode === 'table' ? 'table' : 'cards';
  try { localStorage.setItem('tc_trips_view_mode', _tcTripsViewMode); } catch (e) {}
  const cardsBtn = $('tc-trips-btn-cards');
  const tableBtn = $('tc-trips-btn-table');
  const cardsView = $('tc-trip-cards-view');
  const tableView = $('tc-trip-table-view');

  if (cardsBtn && tableBtn && cardsView && tableView) {
    if (_tcTripsViewMode === 'cards') {
      cardsBtn.classList.add('active');
      tableBtn.classList.remove('active');
      cardsView.style.display = 'block';
      tableView.style.display = 'none';
    } else {
      tableBtn.classList.add('active');
      cardsBtn.classList.remove('active');
      tableView.style.display = 'block';
      cardsView.style.display = 'none';
    }
  }
}

const TC_TRIP_CAT_COLORS = {
  'Travel & Transit': 'var(--gold, #c8913a)',
  'Lodging & Hotel': '#6366f1',
  'Meals & Entertainment': '#f43f5e',
  'Booths & Fairs': '#14b8a6',
  'Supplies & Printing': '#a855f7',
  'Other': '#a8a29e'
};

// ── DECLARED TRIPS ────────────────────────────────────────────────────────
// A trip used to exist only as a side effect of typing a name onto an expense,
// so there was no way to create one up front. TAX_CENTER.trips holds the
// declared records (name + destination + dates + purpose + notes); expenses
// still carry the trip *name*, so the two stay joinable by name and every
// pre-existing trip keeps working with no migration.
function _tcTripRecords() {
  if (!Array.isArray(TAX_CENTER.trips)) TAX_CENTER.trips = [];
  return TAX_CENTER.trips;
}

function _tcFindTripRecord(name) {
  const key = (name || '').trim().toLowerCase();
  if (!key) return null;
  return _tcTripRecords().find(t => (t.name || '').trim().toLowerCase() === key) || null;
}

// Meta line for a trip card / detail header: destination and planned dates.
function _tcTripRecordMeta(rec) {
  if (!rec) return '';
  const bits = [];
  if (rec.destination) bits.push(`📍 ${escapeHtml(rec.destination)}`);
  if (rec.startDate || rec.endDate) {
    const span = rec.startDate && rec.endDate && rec.startDate !== rec.endDate
      ? `${rec.startDate} → ${rec.endDate}`
      : (rec.startDate || rec.endDate);
    bits.push(`🗓 ${escapeHtml(span)}`);
  }
  if (rec.purpose) bits.push(`🎯 ${escapeHtml(rec.purpose)}`);
  return bits.join(' &nbsp;·&nbsp; ');
}

function _tcEmptyTripBucket(rec) {
  return {
    total: 0,
    count: 0,
    latestDate: (rec && (rec.endDate || rec.startDate)) || '',
    minDate: (rec && rec.startDate) || '',
    maxDate: (rec && rec.endDate) || '',
    items: [],
    categories: {},
    record: rec || null,
  };
}

function _tcGetTripsSummaryAll() {
  const tripSummary = {};
  _tcTripRecords().forEach(rec => {
    const name = (rec.name || '').trim();
    if (!name) return;
    tripSummary[name] = _tcEmptyTripBucket(rec);
  });
  (TAX_CENTER.businessExpenses || []).forEach(e => {
    const t = (e.trip || '').trim();
    if (!t) return;
    const eCur = e.currency || 'CAD';
    const eBase = e.baseAmount != null ? e.baseAmount : (e.amount || 0) * (_fxRateCache[`${eCur}_CAD`] || 1);
    const cat = e.cat || 'Other';
    if (!tripSummary[t]) {
      tripSummary[t] = { total: 0, count: 0, latestDate: '', items: [], categories: {} };
    }
    tripSummary[t].total += eBase;
    tripSummary[t].count++;
    if (!tripSummary[t].categories[cat]) tripSummary[t].categories[cat] = 0;
    tripSummary[t].categories[cat] += eBase;
    if (e.date && (!tripSummary[t].latestDate || e.date > tripSummary[t].latestDate)) {
      tripSummary[t].latestDate = e.date;
    }
    tripSummary[t].items.push({ ...e, baseAmount: eBase, origCurrency: eCur, origAmount: e.amount || 0 });
  });
  return tripSummary;
}

function tcRenderQuickTripChips() {
  const chipsContainer = $('tc-trip-quick-chips');
  if (!chipsContainer) return;

  const tripSummary = _tcGetTripsSummaryAll();
  const sortedTrips = Object.keys(tripSummary)
    .map(name => ({ name, ...tripSummary[name] }))
    .sort((a, b) => {
      // ⚡ Bolt Optimization: Replace slow localeCompare with string inequality for ISO dates
      const dA = a.latestDate || '';
      const dB = b.latestDate || '';
      return dA > dB ? -1 : (dA < dB ? 1 : 0);
    })
    .slice(0, 5);

  if (sortedTrips.length === 0) {
    chipsContainer.innerHTML = '';
    return;
  }

  const currentVal = ($('tc-exp-trip')?.value || '').trim();
  const chipsHtml = sortedTrips.map(t => {
    const isActive = currentVal.toLowerCase() === t.name.toLowerCase();
    return `<button type="button" class="tc-trip-chip ${isActive ? 'is-active' : ''}" onclick="tcSelectTripOption('tc-exp-trip', '${t.name.replace(/'/g, "\\'")}')">
      ✈ ${escapeHtml(t.name)} <span class="count-pill">${t.count}</span>
    </button>`;
  }).join('');

  chipsContainer.innerHTML = chipsHtml;
}

function tcUpdateTripSelectedPreview() {
  const input = $('tc-exp-trip');
  const preview = $('tc-trip-selected-preview');
  if (!input || !preview) return;

  const val = (input.value || '').trim();
  if (!val) {
    preview.style.display = 'none';
    preview.innerHTML = '';
    return;
  }

  const summary = _tcGetTripsSummaryAll();
  const tripInfo = summary[val];
  const baseCurrency = TAX_CENTER.settings?.baseCurrency || 'CAD';

  if (tripInfo) {
    preview.style.display = 'flex';
    preview.innerHTML = `
      <span>✈ <b>Active Trip:</b> ${escapeHtml(val)} &bull; ${tripInfo.count} expense${tripInfo.count === 1 ? '' : 's'} logged (<span style="color:var(--red-light);font-weight:700;">-${fmt(tripInfo.total, baseCurrency)}</span>)</span>
      <button class="clear-btn" type="button" onclick="tcClearSelectedTrip('tc-exp-trip')" title="Clear trip assignment">✕ Clear</button>
    `;
  } else {
    preview.style.display = 'flex';
    preview.innerHTML = `
      <span>✨ <b>New Trip:</b> ${escapeHtml(val)} (will be created on save)</span>
      <button class="clear-btn" type="button" onclick="tcClearSelectedTrip('tc-exp-trip')" title="Clear trip assignment">✕ Clear</button>
    `;
  }
}

function tcClearSelectedTrip(inputId) {
  const input = $(inputId);
  if (input) {
    input.value = '';
    if (inputId === 'tc-exp-trip') {
      tcUpdateTripSelectedPreview();
      tcRenderQuickTripChips();
    }
  }
}

function tcOpenTripDropdown(inputId) {
  tcFilterTripDropdown(inputId);
  const menu = $(`${inputId}-menu`);
  if (menu) menu.classList.add('is-open');
}

function tcCloseTripDropdown(inputId) {
  const menu = $(`${inputId}-menu`);
  if (menu) menu.classList.remove('is-open');
}

function tcToggleTripDropdown(inputId) {
  const menu = $(`${inputId}-menu`);
  if (menu) {
    if (menu.classList.contains('is-open')) {
      tcCloseTripDropdown(inputId);
    } else {
      tcOpenTripDropdown(inputId);
    }
  }
}

function tcFilterTripDropdown(inputId) {
  const input = $(inputId);
  const menu = $(`${inputId}-menu`);
  if (!input || !menu) return;

  const filterText = (input.value || '').trim().toLowerCase();
  const summary = _tcGetTripsSummaryAll();
  const baseCurrency = TAX_CENTER.settings?.baseCurrency || 'CAD';

  const allNames = Object.keys(summary).sort();
  const matched = allNames.filter(name => name.toLowerCase().includes(filterText));

  let html = matched.map(name => {
    const t = summary[name];
    const safeName = name.replace(/'/g, "\\'");
    return `<div class="tc-trip-option" onclick="tcSelectTripOption('${inputId}', '${safeName}')">
      <div class="tc-trip-option-main">
        <span>✈</span>
        <span class="tc-trip-option-name">${escapeHtml(name)}</span>
      </div>
      <div class="tc-trip-option-meta">
        <span class="tc-trip-option-count">${t.count} item${t.count === 1 ? '' : 's'}</span>
        <span class="tc-trip-option-amount">-${fmt(t.total, baseCurrency)}</span>
      </div>
    </div>`;
  }).join('');

  if (filterText && !allNames.some(name => name.toLowerCase() === filterText)) {
    const typedEsc = input.value.trim().replace(/'/g, "\\'");
    html += `<div class="tc-trip-create-option" onclick="tcSelectTripOption('${inputId}', '${typedEsc}')">
      ➕ Add new trip: "${escapeHtml(input.value.trim())}"
    </div>`;
  }

  if (!html) {
    html = `<div style="padding:10px 12px;font-size:12px;color:var(--text3);text-align:center;">No existing trips. Type a name to create one!</div>`;
  }

  menu.innerHTML = html;
  menu.classList.add('is-open');
}

function tcSelectTripOption(inputId, tripName) {
  const input = $(inputId);
  if (input) {
    input.value = tripName;
    tcCloseTripDropdown(inputId);
    if (inputId === 'tc-exp-trip') {
      tcUpdateTripSelectedPreview();
      tcRenderQuickTripChips();
    }
  }
}

// ── PENDING / TO-CONFIRM EXPENSES ─────────────────────────────────────────
// Costs the publisher knows about but cannot log yet: the amount is unknown,
// the receipt has not arrived, the date is not fixed. They live in their own
// array and are NEVER read by the ledger, the category totals or any tax
// export — a pending note is a reminder, not a transaction, and letting one
// reach a deductible total would be a reporting error. Confirming one moves it
// into businessExpenses through the normal expense form, which is the only
// path that computes an FX rate and a base amount.
let _tcPendingEditingId = null;
// Set when the expense form was pre-filled from a pending note, so a successful
// submit clears the note it came from instead of leaving a duplicate reminder.
let _tcConfirmingPendingId = null;

function _tcPendingList() {
  if (!Array.isArray(TAX_CENTER.pendingExpenses)) TAX_CENTER.pendingExpenses = [];
  return TAX_CENTER.pendingExpenses;
}

function _tcFindPending(id) {
  return _tcPendingList().find(p => String(p.id) === String(id)) || null;
}

/** Whole days from today to an ISO date; negative is in the past. */
function _tcDaysUntil(isoDate, todayStr = today()) {
  if (!isoDate) return null;
  const a = Date.parse(`${todayStr}T00:00:00`);
  const b = Date.parse(`${isoDate}T00:00:00`);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** Reminder state for one pending note: drives its badge and sort position. */
function _tcPendingDue(item, todayStr = today()) {
  const days = _tcDaysUntil(item?.remindOn, todayStr);
  if (days === null) return { state: 'none', days: null, label: 'No reminder' };
  if (days < 0) return { state: 'overdue', days, label: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue` };
  if (days === 0) return { state: 'today', days, label: 'Due today' };
  if (days <= 7) return { state: 'soon', days, label: `In ${days} day${days === 1 ? '' : 's'}` };
  return { state: 'later', days, label: `In ${days} days` };
}

const _TC_DUE_ORDER = {
  overdue: 0,
  today: 1,
  soon: 2,
  later: 3,
  none: 4,
};

/** Pending notes, most urgent first; undated notes sink to the bottom. */
function _tcSortedPending(todayStr = today()) {
  return _tcPendingList()
    .map(item => ({ item, due: _tcPendingDue(item, todayStr) }))
    .sort((a, b) => {
      const rank = _TC_DUE_ORDER[a.due.state] - _TC_DUE_ORDER[b.due.state];
      if (rank !== 0) return rank;
      if (a.due.days !== null && b.due.days !== null && a.due.days !== b.due.days) return a.due.days - b.due.days;
      const dA = a.item.expectedDate || '';
      const dB = b.item.expectedDate || '';
      return dA > dB ? 1 : dA < dB ? -1 : 0;
    });
}

function _tcSetPendingError(msg) {
  const box = $('tc-pending-err');
  if (!box) return;
  box.textContent = msg || '';
  box.style.display = msg ? 'block' : 'none';
}

function tcPendingValidate() {
  const ok = !!($('tc-pending-desc')?.value || '').trim();
  if (ok) _tcSetPendingError('');
  return ok;
}

/** Quick reminder chips: days from today, or null to clear the field. */
function tcPendingRemindIn(days) {
  const el = $('tc-pending-remind');
  if (!el) return;
  if (days === null || days === undefined) { el.value = ''; return; }
  const d = new Date(`${today()}T00:00:00`);
  d.setDate(d.getDate() + days);
  el.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function openPendingExpense(id, prefillTrip) {
  const item = id ? _tcFindPending(id) : null;
  _tcPendingEditingId = item ? item.id : null;

  const catSelect = $('tc-pending-cat');
  if (catSelect && !catSelect.options.length) {
    catSelect.innerHTML = TC_CATEGORIES.map(c => `<option value="${c.replace(/"/g, '&quot;')}">${escapeHtml(c)}</option>`).join('');
  }

  const set = (elId, val) => { const el = $(elId); if (el) el.value = val ?? ''; };
  set('tc-pending-desc', item?.desc);
  set('tc-pending-cat', item?.cat || 'Other');
  set('tc-pending-cur', item?.currency || TAX_CENTER.settings?.baseCurrency || 'CAD');
  set('tc-pending-amount', item?.estAmount || '');
  set('tc-pending-date', item?.expectedDate);
  set('tc-pending-remind', item?.remindOn);
  set('tc-pending-trip', item?.trip ?? (typeof prefillTrip === 'string' ? prefillTrip : ''));
  set('tc-pending-note', item?.note);
  _tcSetPendingError('');

  const heading = $('tc-pending-heading');
  if (heading) heading.textContent = item ? 'Edit pending expense' : 'Note a pending expense';
  const saveBtn = $('tc-pending-save');
  if (saveBtn) saveBtn.textContent = item ? 'Save changes' : 'Save note';
  const delBtn = $('tc-pending-delete');
  if (delBtn) delBtn.style.display = item ? '' : 'none';

  closeM('tc-trip-detail');
  openM('tc-pending');
  setTimeout(() => $('tc-pending-desc')?.focus(), 50);
}

async function savePendingExpense() {
  const desc = ($('tc-pending-desc')?.value || '').trim();
  if (!desc) {
    _tcSetPendingError('Give the note a description — that is the part you need to recognise it later.');
    $('tc-pending-desc')?.focus();
    return;
  }

  const amountRaw = ($('tc-pending-amount')?.value || '').trim();
  const estAmount = amountRaw ? parseFloat(amountRaw) : 0;
  if (amountRaw && (isNaN(estAmount) || estAmount < 0)) {
    _tcSetPendingError('The estimated amount has to be a positive number, or blank.');
    return;
  }

  const record = {
    id: _tcPendingEditingId || Date.now(),
    desc,
    cat: $('tc-pending-cat')?.value || 'Other',
    currency: $('tc-pending-cur')?.value || 'CAD',
    estAmount: estAmount > 0 ? estAmount : 0,
    expectedDate: ($('tc-pending-date')?.value || '').trim(),
    remindOn: ($('tc-pending-remind')?.value || '').trim(),
    trip: ($('tc-pending-trip')?.value || '').trim(),
    note: ($('tc-pending-note')?.value || '').trim(),
    created: _tcFindPending(_tcPendingEditingId)?.created || today(),
  };

  const list = _tcPendingList();
  const idx = list.findIndex(p => String(p.id) === String(record.id));
  if (idx >= 0) list[idx] = record;
  else list.unshift(record);

  const wasEditing = !!_tcPendingEditingId;
  _tcPendingEditingId = null;
  closeM('tc-pending');
  await saveTaxCenter();
  renderTaxCenter();
  showToast(wasEditing ? '✓ Pending note updated' : '✓ Noted — it will wait here until you confirm it');
}

async function deletePendingExpense(id) {
  const targetId = id ?? _tcPendingEditingId;
  const item = _tcFindPending(targetId);
  if (!item) return;
  if (!(await confirmDialog(`Delete the pending note “${item.desc}”?`, { okLabel: 'Delete note', danger: true }))) return;

  TAX_CENTER.pendingExpenses = _tcPendingList().filter(p => String(p.id) !== String(targetId));
  if (String(_tcPendingEditingId) === String(targetId)) _tcPendingEditingId = null;
  closeM('tc-pending');
  await saveTaxCenter();
  renderTaxCenter();
  showToast('✓ Pending note deleted');
}

/** Push a reminder out by N days from today, from the list row. */
async function snoozePendingExpense(id, days = 7) {
  const item = _tcFindPending(id);
  if (!item) return;
  const d = new Date(`${today()}T00:00:00`);
  d.setDate(d.getDate() + days);
  item.remindOn = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await saveTaxCenter();
  renderTaxCenter();
  showToast(`✓ Reminder moved to ${item.remindOn}`);
}

// Confirming does not write an expense itself: it pre-fills the logger with
// whatever the note knows and lets the normal submit path do the FX maths and
// the receipt handling. submitTaxExpense clears the note on success.
function confirmPendingExpense(id) {
  const item = _tcFindPending(id);
  if (!item) return;
  _tcConfirmingPendingId = item.id;

  const set = (elId, val) => { const el = $(elId); if (el) el.value = val ?? ''; };
  set('tc-exp-desc', item.desc);
  set('tc-exp-cat', item.cat || 'Other');
  set('tc-exp-cur', item.currency || 'CAD');
  set('tc-exp-amount', item.estAmount || '');
  set('tc-exp-date', item.expectedDate || today());
  if ($('tc-exp-trip')) tcSelectTripOption('tc-exp-trip', item.trip || '');

  closeM('tc-pending');
  const card = $('tc-expense-form-card');
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('tc-flash-target');
    setTimeout(() => card.classList.remove('tc-flash-target'), 1600);
  }
  setTimeout(() => $(item.estAmount ? 'tc-exp-amount' : 'tc-exp-desc')?.focus(), 400);
  showToast('Confirm the details and log it — the note clears itself once saved');
}

/** Called by submitTaxExpense after a successful save. */
function _tcClearConfirmedPending() {
  if (_tcConfirmingPendingId === null) return null;
  const item = _tcFindPending(_tcConfirmingPendingId);
  TAX_CENTER.pendingExpenses = _tcPendingList().filter(p => String(p.id) !== String(_tcConfirmingPendingId));
  _tcConfirmingPendingId = null;
  return item;
}

function _tcRenderPendingPanel() {
  const list = $('tc-pending-list');
  const countEl = $('tc-pending-count');
  if (!list) return;

  const rows = _tcSortedPending();
  const dueNow = rows.filter(r => r.due.state === 'overdue' || r.due.state === 'today').length;

  if (countEl) {
    countEl.textContent = rows.length ? `${rows.length}${dueNow ? ` · ${dueNow} due` : ''}` : '';
    countEl.className = `tc-pending-count${dueNow ? ' is-due' : ''}${rows.length ? '' : ' is-empty'}`;
  }

  if (!rows.length) {
    list.innerHTML = `<div class="tc-pending-empty">
      <div class="tc-pending-empty-icon">🕑</div>
      <div class="tc-pending-empty-title">Nothing pending</div>
      <div class="tc-pending-empty-sub">Waiting on an invoice, or spent something you can't total yet? Note it here so it doesn't get lost before tax time.</div>
    </div>`;
    return;
  }

  const cur = TAX_CENTER.settings?.baseCurrency || 'CAD';
  const estTotal = rows.reduce((sum, r) => {
    const amt = Number(r.item.estAmount) || 0;
    if (!amt) return sum;
    return sum + amt * (_fxRateCache[`${(r.item.currency || 'CAD')}_${cur}`] || _fxRateCache[`${(r.item.currency || 'CAD')}_CAD`] || 1);
  }, 0);
  const withoutAmount = rows.filter(r => !Number(r.item.estAmount)).length;

  const body = rows.map(({ item, due }) => {
    const safeId = String(item.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const amount = Number(item.estAmount)
      ? `<span class="tc-pending-amt">~${getSym(item.currency || 'CAD')}${Number(item.estAmount).toFixed(2)}</span>`
      : `<span class="tc-pending-amt is-unknown">Amount unknown</span>`;
    const bits = [
      item.cat ? escapeHtml(item.cat) : '',
      item.expectedDate ? `📅 ${escapeHtml(item.expectedDate)}` : '',
      item.trip ? `✈ ${escapeHtml(item.trip)}` : '',
    ].filter(Boolean).join(' &nbsp;·&nbsp; ');

    return `<div class="tc-pending-row tc-due-${due.state}">
      <div class="tc-pending-main">
        <div class="tc-pending-top">
          <span class="tc-pending-desc">${escapeHtml(item.desc)}</span>
          <span class="tc-due-badge tc-due-${due.state}">${item.remindOn ? '⏰ ' : ''}${escapeHtml(due.label)}</span>
        </div>
        ${bits ? `<div class="tc-pending-meta">${bits}</div>` : ''}
        ${item.note ? `<div class="tc-pending-note">${escapeHtml(item.note)}</div>` : ''}
      </div>
      <div class="tc-pending-right">
        ${amount}
        <div class="tc-pending-actions">
          <button class="btn gold" onclick="confirmPendingExpense('${safeId}')" title="Pre-fill the expense form from this note">✓ Confirm &amp; log</button>
          <button class="btn tag" onclick="snoozePendingExpense('${safeId}', 7)" title="Push the reminder out a week">⏰ +1w</button>
          <button class="btn-icon" aria-label="Edit note" onclick="openPendingExpense('${safeId}')" title="Edit note">✏️</button>
          <button class="btn-icon" aria-label="Delete note" onclick="deletePendingExpense('${safeId}')" title="Delete note">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');

  const foot = `<div class="tc-pending-foot">
    <span>${rows.length} pending note${rows.length === 1 ? '' : 's'}${withoutAmount ? ` · ${withoutAmount} without an amount` : ''}</span>
    ${estTotal > 0 ? `<span>Estimated, not yet in your ledger: <b>${fmt(estTotal, cur)}</b></span>` : ''}
  </div>`;

  list.innerHTML = body + foot;
}

// ── CREATE / EDIT A TRIP ──────────────────────────────────────────────────
// _tcTripEditingName is null for a brand-new trip and holds the original name
// while editing, so a rename can carry the assigned expenses across with it.
let _tcTripEditingName = null;

function _tcSetTripFormError(msg) {
  const box = $('tc-new-trip-err');
  if (!box) return;
  box.textContent = msg || '';
  box.style.display = msg ? 'block' : 'none';
}

function _tcFillTripForm(rec) {
  const set = (id, val) => { const el = $(id); if (el) el.value = val ?? ''; };
  set('tc-new-trip-name', rec?.name);
  set('tc-new-trip-dest', rec?.destination);
  set('tc-new-trip-start', rec?.startDate);
  set('tc-new-trip-end', rec?.endDate);
  set('tc-new-trip-purpose', rec?.purpose);
  set('tc-new-trip-notes', rec?.notes);
  const budget = rec?.name ? (TAX_CENTER.tripBudgets?.[rec.name] || '') : '';
  set('tc-new-trip-budget', budget);
  _tcSetTripFormError('');
}

function openNewTrip(prefillName) {
  _tcTripEditingName = null;
  _tcFillTripForm(prefillName ? { name: prefillName } : null);
  const heading = $('tc-new-trip-heading');
  if (heading) heading.textContent = 'Create a business trip';
  const saveBtn = $('tc-new-trip-save');
  if (saveBtn) saveBtn.textContent = 'Create trip';
  const delBtn = $('tc-new-trip-delete');
  if (delBtn) delBtn.style.display = 'none';
  openM('tc-new-trip');
  setTimeout(() => $('tc-new-trip-name')?.focus(), 50);
}

// Opens the same form against the trip currently shown in the detail modal.
function openEditTripDetails(tripName) {
  const name = (tripName || _tcOpenTripName || '').trim();
  if (!name) return;
  _tcTripEditingName = name;
  _tcFillTripForm(_tcFindTripRecord(name) || { name });
  const heading = $('tc-new-trip-heading');
  if (heading) heading.textContent = 'Edit trip details';
  const saveBtn = $('tc-new-trip-save');
  if (saveBtn) saveBtn.textContent = 'Save changes';
  const delBtn = $('tc-new-trip-delete');
  if (delBtn) delBtn.style.display = '';
  closeM('tc-trip-detail');
  openM('tc-new-trip');
  setTimeout(() => $('tc-new-trip-name')?.focus(), 50);
}

// Live validation on the name field: blank and duplicate names are the only
// two ways this form can be wrong, so say so before the user hits Save.
function tcNewTripValidate() {
  const name = ($('tc-new-trip-name')?.value || '').trim();
  const saveBtn = $('tc-new-trip-save');
  let err = '';
  if (!name) {
    err = '';
  } else {
    const clash = _tcFindTripRecord(name);
    if (clash && (clash.name || '').trim().toLowerCase() !== (_tcTripEditingName || '').trim().toLowerCase()) {
      err = `A trip called "${clash.name}" already exists.`;
    }
  }
  _tcSetTripFormError(err);
  if (saveBtn) saveBtn.disabled = !!err;
  return !err && !!name;
}

async function saveNewTrip() {
  const name = ($('tc-new-trip-name')?.value || '').trim();
  if (!name) {
    _tcSetTripFormError('Give the trip a name — that is what expenses get grouped under.');
    $('tc-new-trip-name')?.focus();
    return;
  }
  if (!tcNewTripValidate()) return;

  const startDate = ($('tc-new-trip-start')?.value || '').trim();
  const endDate = ($('tc-new-trip-end')?.value || '').trim();
  if (startDate && endDate && endDate < startDate) {
    _tcSetTripFormError('The end date falls before the start date.');
    return;
  }

  const rec = {
    id: _tcTripEditingName ? (_tcFindTripRecord(_tcTripEditingName)?.id || Date.now()) : Date.now(),
    name,
    destination: ($('tc-new-trip-dest')?.value || '').trim(),
    startDate,
    endDate,
    purpose: ($('tc-new-trip-purpose')?.value || '').trim(),
    notes: ($('tc-new-trip-notes')?.value || '').trim(),
    created: _tcFindTripRecord(_tcTripEditingName || name)?.created || today(),
  };

  const records = _tcTripRecords();
  const existingIdx = records.findIndex(t => (t.name || '').trim().toLowerCase() === (_tcTripEditingName || name).trim().toLowerCase());
  if (existingIdx >= 0) records[existingIdx] = rec;
  else records.push(rec);

  // A rename has to follow the expenses, or the trip's spend silently detaches.
  let moved = 0;
  if (_tcTripEditingName && _tcTripEditingName !== name) {
    (TAX_CENTER.businessExpenses || []).forEach(e => {
      if ((e.trip || '').trim() === _tcTripEditingName) { e.trip = name; moved++; }
    });
    if (TAX_CENTER.tripBudgets?.[_tcTripEditingName] != null) {
      TAX_CENTER.tripBudgets[name] = TAX_CENTER.tripBudgets[_tcTripEditingName];
      delete TAX_CENTER.tripBudgets[_tcTripEditingName];
    }
  }

  const budgetRaw = ($('tc-new-trip-budget')?.value || '').trim();
  const budget = parseFloat(budgetRaw);
  if (!TAX_CENTER.tripBudgets) TAX_CENTER.tripBudgets = {};
  if (budgetRaw && !isNaN(budget) && budget > 0) TAX_CENTER.tripBudgets[name] = budget;
  else delete TAX_CENTER.tripBudgets[name];

  const wasEditing = _tcTripEditingName;
  _tcTripEditingName = null;
  closeM('tc-new-trip');
  await saveTaxCenter();
  renderTaxCenter();

  if (wasEditing) {
    showToast(moved ? `✓ Trip updated (${moved} expense${moved === 1 ? '' : 's'} moved)` : '✓ Trip updated');
  } else {
    showToast(`✓ Trip "${name}" created — assign expenses to it when you log them`);
    // Pre-select the fresh trip in the expense logger so the next thing the
    // user types lands on it.
    tcSelectTripOption('tc-exp-trip', name);
  }
}

async function deleteTripRecord() {
  const name = _tcTripEditingName;
  if (!name) return;
  const assigned = (TAX_CENTER.businessExpenses || []).filter(e => (e.trip || '').trim() === name).length;
  const msg = assigned
    ? `Delete the trip "${name}"? The ${assigned} expense${assigned === 1 ? '' : 's'} assigned to it stay in your ledger but lose the trip grouping.`
    : `Delete the trip "${name}"?`;
  if (!(await confirmDialog(msg, { okLabel: 'Delete trip', danger: true }))) return;

  TAX_CENTER.trips = _tcTripRecords().filter(t => (t.name || '').trim().toLowerCase() !== name.trim().toLowerCase());
  (TAX_CENTER.businessExpenses || []).forEach(e => { if ((e.trip || '').trim() === name) e.trip = ''; });
  if (TAX_CENTER.tripBudgets) delete TAX_CENTER.tripBudgets[name];

  _tcTripEditingName = null;
  closeM('tc-new-trip');
  await saveTaxCenter();
  renderTaxCenter();
  showToast(`✓ Trip "${name}" deleted`);
}

// Jump from a trip straight into the expense logger with the trip pre-filled.
// Without this, a freshly created trip tells you to go assign an expense and
// then leaves you to scroll up and retype its name — the one place the whole
// flow could still lose the connection it just made.
function logExpenseForTrip(tripName) {
  const name = (tripName || _tcOpenTripName || '').trim();
  if (!name) return;
  // A different entry point into the same form — not a pending confirmation —
  // so any confirm-flow link from an earlier, abandoned edit no longer applies.
  _tcConfirmingPendingId = null;
  closeM('tc-trip-detail');
  tcSelectTripOption('tc-exp-trip', name);

  const card = $('tc-expense-form-card');
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // A brief ring so it is obvious *which* card the page just jumped to.
    card.classList.add('tc-flash-target');
    setTimeout(() => card.classList.remove('tc-flash-target'), 1600);
  }
  setTimeout(() => $('tc-exp-desc')?.focus(), 400);
  showToast(`Logging to “${name}” — fill in the expense below`);
}

// ── PRINTABLE TRIP REPORT ─────────────────────────────────────────────────
// A standalone document (its own stylesheet, no app chrome) printed from a
// popup, matching how invoices and the sales tracker already print. Remote
// receipt URLs embed as thumbnails; local:// receipts live in the publisher's
// own folder and can't be read from a detached document, so they are listed
// by filename instead of silently printing as broken images.
function _tcTripReportReceipts(items) {
  const refs = [];
  items.forEach(item => {
    const files = (Array.isArray(item.receiptFiles) && item.receiptFiles.length)
      ? item.receiptFiles
      : (item.receipt ? [item.receipt] : []);
    files.forEach(r => {
      if (typeof r !== 'string' || !r) return;
      const meta = { desc: item.desc || '', date: item.date || '' };
      if (r.startsWith('local://')) {
        const path = r.replace('local://', '');
        refs.push({ ...meta, source: 'local', path, name: path.split('/').pop() });
      } else if (/^https?:\/\//i.test(r)) {
        refs.push({ ...meta, source: 'remote', url: r, name: r.split('/').pop().split('?')[0] || 'receipt' });
      }
    });
  });
  return refs;
}

/** True when a filename/URL looks like a PDF rather than an image. */
function _tcIsPdfName(name) {
  return /\.pdf(?:$|[?#])/i.test(name || '');
}

function _tcBlobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error || new Error('read failed'));
    fr.readAsDataURL(blob);
  });
}

// Rasterise a PDF receipt's pages to PNG data URLs. A printed <embed>/<iframe>
// of a PDF renders blank in every engine, so the only way to actually SHOW a
// PDF receipt on the page is to draw it. pdf.js is fetched on demand and this
// rejects offline, which the caller downgrades to a filename listing.
async function _tcPdfToImages(blob, maxPages = 3) {
  const pdfjsLib = await ensurePdfJs();
  const buf = await blob.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];
  const count = Math.min(doc.numPages, maxPages);
  for (let n = 1; n <= count; n++) {
    const page = await doc.getPage(n);
    // 1.8× gives a thumbnail that still reads when printed at ~30% width.
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    pages.push({ dataUrl: canvas.toDataURL('image/png'), page: n, total: doc.numPages });
  }
  return pages;
}

// Turn every receipt reference into something printable. Local files are read
// through the connected folder handle; remote ones are fetched so they can be
// inlined as data URLs (a remote <img> often fails to load in time for the
// print dialog, and a cross-origin PDF can't be rasterised any other way).
// Anything that can't be resolved comes back in `missing` with a reason, so
// the report says why instead of silently dropping a receipt.
async function _tcResolveReceiptImages(refs) {
  const resolved = [];
  const missing = [];
  if (!refs.length) return { resolved, missing };

  let dirHandle = null;
  let folderReason = 'receipt folder not connected';
  if (refs.some(r => r.source === 'local')) {
    try { dirHandle = await loadReceiptFolderHandle(); } catch (e) { dirHandle = null; }
    // A stored handle can still be un-permissioned after a browser restart, so
    // ask once here rather than failing every file with a misleading reason.
    if (dirHandle?.queryPermission) {
      try {
        let perm = await dirHandle.queryPermission({ mode: 'read' });
        if (perm !== 'granted' && dirHandle.requestPermission) {
          perm = await dirHandle.requestPermission({ mode: 'read' });
        }
        if (perm !== 'granted') { dirHandle = null; folderReason = 'folder access not granted'; }
      } catch (e) { /* older engines without the permission API — just try the read */ }
    }
  }

  for (const ref of refs) {
    try {
      let blob = null;
      if (ref.source === 'local') {
        if (!dirHandle) { missing.push({ ...ref, reason: folderReason }); continue; }
        blob = await resolveLocalReceiptFile(dirHandle, ref.path);
      } else {
        const res = await fetch(ref.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        blob = await res.blob();
      }

      const isPdf = _tcIsPdfName(ref.name) || (blob.type || '').includes('pdf');
      if (isPdf) {
        const pages = await _tcPdfToImages(blob);
        if (!pages.length) throw new Error('no pages rendered');
        pages.forEach(p => resolved.push({
          ...ref,
          dataUrl: p.dataUrl,
          pageLabel: p.total > 1 ? `page ${p.page} of ${p.total}` : '',
        }));
      } else {
        resolved.push({ ...ref, dataUrl: await _tcBlobToDataUrl(blob) });
      }
    } catch (e) {
      missing.push({ ...ref, reason: _tcIsPdfName(ref.name) ? 'PDF could not be rendered' : 'file could not be read' });
    }
  }
  return { resolved, missing };
}

async function exportTripPDF(tripName) {
  const name = (tripName || _tcOpenTripName || '').trim();
  const detail = window._tcTripDetail;
  if (!name || !detail || !detail.byName || !detail.byName[name]) {
    showToast('⚠ Trip details not found', 'warn');
    return;
  }

  // The window has to open in the click's own turn — a window.open() after an
  // await is treated as an unsolicited popup and blocked. It holds a placeholder
  // while the receipts are read, then gets the finished document written into it.
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) {
    showToast('Pop-up blocked — allow pop-ups to print the trip report', 'warn');
    return;
  }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Trip report — ${escapeHtml(name)}</title></head>
    <body style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;padding:40px;color:#6b635c;">
    Preparing the trip report and its receipts…</body></html>`);
  win.document.close();

  const { baseCurrency } = detail;
  const { items, total, count, categories } = detail.byName[name];
  const rec = _tcFindTripRecord(name);
  const budget = TAX_CENTER.tripBudgets?.[name] || 0;

  const sorted = items.slice().sort((a, b) => {
    const dA = a.date || '';
    const dB = b.date || '';
    return dA > dB ? 1 : dA < dB ? -1 : 0;
  });

  const metaRows = [
    rec?.destination ? ['Destination', rec.destination] : null,
    (rec?.startDate || rec?.endDate) ? ['Dates', [rec.startDate, rec.endDate].filter(Boolean).join(' – ')] : null,
    rec?.purpose ? ['Business purpose', rec.purpose] : null,
    ['Expenses', `${count} item${count === 1 ? '' : 's'}`],
    ['Reporting currency', baseCurrency],
  ].filter(Boolean).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('');

  let budgetLine = '';
  if (budget > 0) {
    const over = total > budget;
    const delta = Math.abs(total - budget);
    budgetLine = `<div class="budget ${over ? 'over' : 'under'}">
      Budget ${fmt(budget, baseCurrency)} &nbsp;·&nbsp;
      ${over ? `Over by ${fmt(delta, baseCurrency)}` : `${fmt(delta, baseCurrency)} remaining`}
    </div>`;
  }

  const catRows = Object.entries(categories || {})
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => `<tr>
      <td>${escapeHtml(cat)}</td>
      <td class="r">${total > 0 ? ((amt / total) * 100).toFixed(1) : '0.0'}%</td>
      <td class="r">${fmt(amt, baseCurrency)}</td>
    </tr>`).join('') || '<tr><td colspan="3" class="empty">No expenses assigned to this trip.</td></tr>';

  const expenseRows = sorted.map(item => `<tr>
      <td>${escapeHtml(item.date || '—')}</td>
      <td>${escapeHtml(item.desc || '')}</td>
      <td>${escapeHtml(item.cat || '')}</td>
      <td class="r">${escapeHtml(getSym(item.origCurrency || 'CAD'))}${Number(item.origAmount || 0).toFixed(2)}</td>
      <td class="r">${fmt(item.baseAmount, baseCurrency)}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="empty">No expenses assigned to this trip yet.</td></tr>';

  // Receipts are read/rasterised before the document is written, so the print
  // window opens with every image already inlined as a data URL.
  const refs = _tcTripReportReceipts(sorted);
  let resolved = [];
  let missing = [];
  if (refs.length) {
    showToast(`Preparing ${refs.length} receipt${refs.length === 1 ? '' : 's'} for the report…`);
    ({ resolved, missing } = await _tcResolveReceiptImages(refs));
  }

  const thumbs = resolved.map(r => `<figure class="thumb">
      <img src="${r.dataUrl}" alt="${escapeHtml(r.desc || r.name)}">
      <figcaption>${escapeHtml([r.date, r.desc, r.pageLabel].filter(Boolean).join(' · '))}</figcaption>
    </figure>`).join('');
  const missingList = missing.length
    ? `<div class="local-note"><b>${missing.length} receipt${missing.length === 1 ? '' : 's'} could not be shown:</b>
        ${missing.map(m => `${escapeHtml(m.name)} (${escapeHtml(m.reason)})`).join(', ')}</div>`
    : '';
  const receiptsSection = (thumbs || missingList)
    ? `<h2>Receipts</h2>${thumbs ? `<div class="thumbs">${thumbs}</div>` : ''}${missingList}`
    : '';

  const printedOn = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Trip report — ${escapeHtml(name)}</title>
  <style>
    @page { size: letter portrait; margin: 0.55in; }
    * { box-sizing: border-box; }
    html, body { background: #fff; color: #14110e; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; }
    .head { border-bottom: 2px solid #14110e; padding-bottom: 12px; margin-bottom: 18px; }
    .eyebrow { font-size: 8.5pt; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: #8a5815; }
    h1 { margin: 6px 0 2px; font-size: 21pt; font-weight: 800; letter-spacing: -.01em; }
    .sub { font-size: 9.5pt; color: #6b635c; }
    .totals { display: flex; align-items: baseline; gap: 12px; margin: 16px 0 6px; }
    .totals .amount { font-size: 20pt; font-weight: 800; }
    .totals .label { font-size: 9pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #6b635c; }
    .budget { display: inline-block; font-size: 9.5pt; font-weight: 700; padding: 4px 10px; border-radius: 999px; margin-bottom: 14px; }
    .budget.under { background: #e7f4ea; color: #1f6b36; }
    .budget.over { background: #fbe9e6; color: #97281a; }
    h2 { font-size: 11pt; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #8a5815; margin: 22px 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e3ddd3; vertical-align: top; }
    thead th { font-size: 8.5pt; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #6b635c; border-bottom: 1.5px solid #14110e; }
    td.r, th.r { text-align: right; }
    td.empty { text-align: center; color: #6b635c; font-style: italic; }
    tfoot td { font-weight: 800; border-top: 1.5px solid #14110e; border-bottom: none; }
    .meta th { width: 34%; font-weight: 700; color: #6b635c; }
    .notes { margin-top: 10px; padding: 10px 12px; background: #faf7f1; border-left: 3px solid #c8913a; font-size: 9.5pt; }
    .thumbs { display: flex; flex-wrap: wrap; gap: 10px; }
    .thumb { margin: 0; width: 30%; }
    .thumb img { width: 100%; border: 1px solid #e3ddd3; border-radius: 4px; }
    .thumb figcaption { font-size: 8pt; color: #6b635c; margin-top: 3px; }
    .local-note { margin-top: 10px; font-size: 9pt; color: #6b635c; }
    .foot { margin-top: 26px; padding-top: 10px; border-top: 1px solid #e3ddd3; font-size: 8.5pt; color: #6b635c; }
    @media print { .thumb { break-inside: avoid; } tr { break-inside: avoid; } }
  </style>
  </head><body>
    <div class="head">
      <div class="eyebrow">Business trip report</div>
      <h1>${escapeHtml(name)}</h1>
      <div class="sub">Lyricalmyrical Books &nbsp;·&nbsp; prepared ${escapeHtml(printedOn)}</div>
    </div>

    <div class="totals">
      <div class="amount">${fmt(total, baseCurrency)}</div>
      <div class="label">Total deductible spend</div>
    </div>
    ${budgetLine}

    <h2>Trip details</h2>
    <table class="meta"><tbody>${metaRows}</tbody></table>
    ${rec?.notes ? `<div class="notes">${escapeHtml(rec.notes)}</div>` : ''}

    <h2>Spend by tax category</h2>
    <table>
      <thead><tr><th>Tax category</th><th class="r">Share</th><th class="r">Total (${escapeHtml(baseCurrency)})</th></tr></thead>
      <tbody>${catRows}</tbody>
      <tfoot><tr><td>Total</td><td class="r"></td><td class="r">${fmt(total, baseCurrency)}</td></tr></tfoot>
    </table>

    <h2>Expenses</h2>
    <table>
      <thead><tr><th>Date</th><th>Description</th><th>Tax category</th><th class="r">Original</th><th class="r">${escapeHtml(baseCurrency)}</th></tr></thead>
      <tbody>${expenseRows}</tbody>
      <tfoot><tr><td colspan="4">Total</td><td class="r">${fmt(total, baseCurrency)}</td></tr></tfoot>
    </table>

    ${receiptsSection}

    <div class="foot">Amounts converted to ${escapeHtml(baseCurrency)} at the rate stored with each expense. Generated by Lyrical Inventory.</div>
  </body></html>`;

  if (win.closed) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // Images are inline data URLs, so they only need a paint before printing.
  setTimeout(() => { try { win.print(); } catch (e) { } }, resolved.length ? 600 : 350);
  showToast('✓ Trip report ready — use “Save as PDF” in the print dialog');
}

function _tcRenderTripsPanel(selectedYear, baseCurrency) {
  const tripBody = $('tc-trip-body');
  const cardsGrid = $('tc-trip-cards-grid');
  const statsBar = $('tc-trip-stats-bar');

  const tripSummary = {};
  // Declared trips show up even with zero expenses — that is the whole point of
  // being able to create one before you have spent anything on it. A trip with
  // dates outside the selected year is filtered out like its expenses would be.
  _tcTripRecords().forEach(rec => {
    const name = (rec.name || '').trim();
    if (!name) return;
    if (selectedYear !== 'all') {
      const years = [rec.startDate, rec.endDate, rec.created].filter(Boolean).map(d => String(d).substring(0, 4));
      if (years.length && !years.includes(selectedYear)) return;
    }
    tripSummary[name] = _tcEmptyTripBucket(rec);
  });
  (TAX_CENTER.businessExpenses || []).forEach(e => {
    const eYear = e.date ? e.date.substring(0, 4) : '';
    if (selectedYear !== 'all' && eYear !== selectedYear) return;
    const t = (e.trip || '').trim();
    if (!t) return;
    const eCur = e.currency || 'CAD';
    const eBase = e.baseAmount != null ? e.baseAmount : (e.amount || 0) * (_fxRateCache[`${eCur}_CAD`] || 1);
    const cat = e.cat || 'Other';
    if (!tripSummary[t]) tripSummary[t] = { total: 0, count: 0, items: [], categories: {}, minDate: '', maxDate: '' };
    tripSummary[t].total += eBase;
    tripSummary[t].count++;
    if (!tripSummary[t].categories[cat]) tripSummary[t].categories[cat] = 0;
    tripSummary[t].categories[cat] += eBase;

    if (e.date) {
      if (!tripSummary[t].minDate || e.date < tripSummary[t].minDate) tripSummary[t].minDate = e.date;
      if (!tripSummary[t].maxDate || e.date > tripSummary[t].maxDate) tripSummary[t].maxDate = e.date;
    }

    tripSummary[t].items.push({ ...e, baseAmount: eBase, origCurrency: eCur, origAmount: e.amount || 0 });
  });

  window._tcTripDetail = { baseCurrency, byName: tripSummary };

  const tripList = Object.keys(tripSummary)
    .map(t => ({ name: t, ...tripSummary[t] }))
    .sort((a, b) => b.total - a.total);

  // Render Stats Bar
  if (statsBar) {
    const totalTrips = tripList.length;
    const totalSpent = tripList.reduce((sum, t) => sum + t.total, 0);
    const topTrip = tripList[0];
    const avgSpent = totalTrips > 0 ? totalSpent / totalTrips : 0;

    statsBar.innerHTML = `
      <div class="tc-trip-stat-card">
        <div class="tc-trip-stat-val">${totalTrips}</div>
        <div class="tc-trip-stat-lbl">Active Business Trips</div>
      </div>
      <div class="tc-trip-stat-card">
        <div class="tc-trip-stat-val" style="color:var(--red-light);">${fmt(totalSpent, baseCurrency)}</div>
        <div class="tc-trip-stat-lbl">Total Trip Portfolio Spend</div>
      </div>
      <div class="tc-trip-stat-card">
        <div class="tc-trip-stat-val">${topTrip ? escapeHtml(topTrip.name) : '—'}</div>
        <div class="tc-trip-stat-lbl">Highest Spend Event ${topTrip ? `(${fmt(topTrip.total, baseCurrency)})` : ''}</div>
      </div>
      <div class="tc-trip-stat-card">
        <div class="tc-trip-stat-val">${fmt(avgSpent, baseCurrency)}</div>
        <div class="tc-trip-stat-lbl">Average Spend per Trip</div>
      </div>
    `;
  }

  // Render Visual Cards Grid
  if (cardsGrid) {
    if (tripList.length === 0) {
      cardsGrid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:40px 20px;background:rgba(28,25,23,0.82);border:1px dashed rgba(255,255,255,0.1);border-radius:12px;">
          <div style="font-size:28px;margin-bottom:8px;color:var(--on-inverse);">✈</div>
          <div style="font-size:14px;font-weight:600;color:var(--on-inverse);margin-bottom:4px;">No business trips logged yet</div>
          <div style="font-size:12px;color:var(--on-inverse-2);max-width:380px;margin:0 auto 14px;">Create a trip (e.g. "Toronto Book Fair") and every travel, lodging and booth expense you assign to it totals here, ready for your tax return.</div>
          <button class="btn gold" onclick="openNewTrip()">✈ Create your first trip</button>
        </div>
      `;
    } else {
      cardsGrid.innerHTML = tripList.map(t => {
        const catEntries = Object.entries(t.categories);
        const catSegs = catEntries.map(([cat, amt]) => {
          const pct = t.total > 0 ? ((amt / t.total) * 100).toFixed(1) : '0.0';
          const color = TC_TRIP_CAT_COLORS[cat] || 'var(--gold)';
          return `<div class="tc-trip-cat-seg" style="width:${pct}%;background:${color};" title="${escapeHtml(cat)}: ${fmt(amt, baseCurrency)} (${pct}%)"></div>`;
        }).join('');

        const dateSpan = t.minDate && t.maxDate
          ? (t.minDate === t.maxDate ? t.minDate : `${t.minDate} &rarr; ${t.maxDate}`)
          : (t.count === 0 ? 'Dates not set' : 'Multiple Dates');
        const recMeta = _tcTripRecordMeta(t.record ?? _tcFindTripRecord(t.name));

        const targetBudget = TAX_CENTER.tripBudgets?.[t.name] || 0;
        let budgetHtml = '';
        if (targetBudget > 0) {
          const pct = Math.min(100, Math.round((t.total / targetBudget) * 100));
          const isOver = t.total > targetBudget;
          const barColor = isOver ? 'var(--red, #a63a2b)' : pct > 85 ? 'var(--gold2, #e5a93f)' : 'var(--green-light, #3ba75c)';
          const badgeText = isOver
            ? `⚠️ OVER BUDGET (+${fmt(t.total - targetBudget, baseCurrency)})`
            : `🎯 ${pct}% of ${fmt(targetBudget, baseCurrency)} budget`;
          budgetHtml = `
            <div style="margin-bottom:12px;font-size:11px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;font-weight:600;color:${isOver ? 'var(--red, #a63a2b)' : 'var(--text2)'};">
                <span>${badgeText}</span>
              </div>
              <div style="height:5px;background:var(--cream3, #e5ddd0);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;transition:width 0.3s ease;"></div>
              </div>
            </div>
          `;
        }

        const safeName = t.name.replace(/'/g, "\\'");
        return `
          <div class="tc-trip-card" onclick="showTripDetail('${safeName}')">
            <div>
              <div class="tc-trip-card-head">
                <h4 class="tc-trip-card-title">✈ ${escapeHtml(t.name)}</h4>
                <div class="tc-trip-card-total">${t.count === 0 ? '<span class="tc-trip-badge-new">Planned</span>' : `-${fmt(t.total, baseCurrency)}`}</div>
              </div>
              <div class="tc-trip-card-meta">
                <span>📅 ${dateSpan}</span>
                <span>•</span>
                <span>📄 ${t.count} expense${t.count === 1 ? '' : 's'}</span>
              </div>
              ${recMeta ? `<div class="tc-trip-card-meta tc-trip-card-submeta">${recMeta}</div>` : ''}
              ${t.count === 0
                ? `<div class="tc-trip-card-empty">No expenses assigned yet — pick this trip when you log one.</div>`
                : `<div class="tc-trip-cat-bar" aria-label="Category breakdown bar">${catSegs}</div>`}
              ${budgetHtml}
            </div>
            <div class="tc-trip-card-foot">
              <span style="color:var(--text3);font-size:11px;">Click to view expenses & breakdown</span>
              <span style="color:var(--gold-text, #8a5815);font-weight:700;">View Details &rarr;</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Render Table View
  if (tripBody) {
    tripBody.innerHTML = tripList.map(t => `
        <tr onclick="showTripDetail(this.dataset.trip)" data-trip="${escapeHtml(t.name)}" style="cursor:pointer;" title="Click to view ${t.count} expense${t.count === 1 ? '' : 's'}">
          <td style="color:var(--gold);text-decoration:underline;">✈ ${escapeHtml(t.name)}</td>
          <td class="r">${t.count}</td>
          <td class="r" style="font-weight:bold;color:var(--red);">${t.count === 0 ? '<span style="color:var(--text3);font-weight:600;">Planned</span>' : `- ${fmt(t.total, baseCurrency)}`}</td>
        </tr>
    `).join('') || `<tr><td colspan="3" style="text-align:center;color:var(--text3);">No trips yet — press <b>✈ New trip</b> above to create one.</td></tr>`;
  }

  // Sync current view mode toggle button states
  tcSetTripsView(_tcTripsViewMode);

  // Render quick chips for expense logger input
  tcRenderQuickTripChips();
  tcUpdateTripSelectedPreview();
}

function _tcBuildLedger(selectedYear) {
  let totalGrossSales = 0;
  let totalOperatingExpenses = 0;
  let allLedger = [];

  Object.keys(BOOKS).forEach(bid => {
    if (bid.toLowerCase().includes('test') || BOOKS[bid]?.title?.toLowerCase()?.includes('test')) return;
    const s = states[bid] || defaultState(BOOKS[bid]);
    const b = BOOKS[bid];
    const cur = getBookCurrencyCode(b);
    // Re-derive consignment Sale mirrors from their canonical ledger rows, so a
    // sale corrected in the Consignment tab reports its NEW amount here (and in
    // the CSV export built from these rows) rather than the amount it was first
    // recorded at, and so an invoice rename reaches the Receipt/Ref column.
    reconcileConsignmentMirrors(s);

    // Determine conversion to CAD for sales
    const hRate = _fxRateCache[`${cur}_CAD`] || 1;

    // Add sales to ledger
    // ⚡ Bolt Optimization: Use imperative loop to avoid array allocation from .filter()
    if (s.hist && s.hist.length > 0) {
      for (const h of s.hist) {
        if (h.artistPending && !h.voided) continue;

        const hYear = h.date ? h.date.substring(0, 4) : '';
        if (selectedYear !== 'all' && hYear !== selectedYear) continue;

        const unitPrice = h.price ?? h.unitPrice ?? 0;
        const amt = h.voided ? 0 : (unitPrice * (h.qty || 1));
        const baseAmt = amt * hRate;
        totalGrossSales += baseAmt;

        allLedger.push({
          date: h.date,
          type: 'Sale',
          desc: `${b.title} (Qty: ${h.qty || 1})`,
          cat: 'Income',
          ref: h.num,
          invoiceNum: h.consignmentLink ? (h.invoiceNum || '') : '',
          origCurrency: cur,
          origAmount: amt,
          baseAmount: baseAmt,
          qty: h.qty || 1,
          voided: !!h.voided,
          hasRateError: !hRate,
          isIncome: true,
          sourceType: 'sale',
          sourceId: bid,
          itemId: h.id || h.num
        });

        const shippingIncome = h.voided ? 0 : (Number(h.shippingPaid) || 0);
        if (shippingIncome > 0) {
          const shippingBase = roundCents(shippingIncome * hRate);
          totalGrossSales = roundCents(totalGrossSales + shippingBase);
          allLedger.push({
            date: h.date,
            type: 'Shipping income',
            desc: `Customer shipping paid (${b.title})`,
            cat: 'Income',
            ref: h.num,
            origCurrency: cur,
            origAmount: shippingIncome,
            baseAmount: shippingBase,
            qty: 0,
            voided: false,
            hasRateError: !hRate,
            isIncome: true,
            sourceType: 'shippingIncome',
            sourceId: bid,
            itemId: `${h.id || h.num}-shipping-income`,
          });
        }
      }
    }

    // Add book specific expenses
    (s.expenses || []).forEach(e => {
      const eYear = e.date ? e.date.substring(0, 4) : '';
      if (selectedYear !== 'all' && eYear !== selectedYear) return;

      // Use stored origCurrency/origAmount for display, and stored baseAmount to avoid double-conversion.
      // Fallback for legacy entries that don't have baseAmount stored.
      const displayOrigCur = e.origCurrency || e.currency || 'CAD';
      const displayOrigAmt = e.origAmount != null ? e.origAmount : (e.amount || 0);
      const bookCur = e.currency || 'CAD';

      let eBase;
      if (e.baseAmount != null) {
        // Pre-calculated at submission time — no double conversion
        eBase = e.baseAmount;
      } else {
        // Legacy entry: calculate once now
        const eRate = _fxRateCache[`${bookCur}_CAD`] || 1;
        eBase = (e.amount || 0) * eRate;
      }

      totalOperatingExpenses += eBase;

      allLedger.push({
        date: e.date,
        type: 'Expense',
        desc: e.desc + ` (${b.title})`,
        cat: canonicalExpenseCategory(e.cat, 'Project Expense'),
        ref: e.shippingOrderNumber ? `${e.ref || ''} · ${e.shippingOrderNumber}` : e.ref || '',
        receipt: e.receipt || '',
        origCurrency: displayOrigCur,
        origAmount: displayOrigAmt,
        baseAmount: eBase,
        hasRateError: false,
        isIncome: false,
        sourceType: 'bookExpense',
        sourceId: bid,
        itemId: e.id
      });
    });

    // Add artist payments
    // ⚡ Bolt Optimization: Use imperative loop to avoid array allocation from .filter()
    if (s.artistTransfers && s.artistTransfers.length > 0) {
      for (const t of s.artistTransfers) {
        if (!t.paid) continue;

        const tDate = t.paidDate || t.date || '';
        const tYear = tDate ? tDate.substring(0, 4) : '';
        if (selectedYear !== 'all' && tYear !== selectedYear) continue;

        const tBase = (t.total || 0) * hRate;
        allLedger.push({
          date: tDate,
          type: 'Expense',
          desc: `Artist Payout (${b.title})`,
          cat: 'Artist Royalties',
          ref: t.num,
          origCurrency: cur,
          origAmount: t.total || 0,
          baseAmount: tBase,
          hasRateError: !hRate,
          isIncome: false,
          sourceType: 'artistPayout',
          sourceId: bid,
          itemId: t.id || t.num
        });
      }
    }
  });

  (TAX_CENTER.businessExpenses || []).forEach(e => {
    const eYear = e.date ? e.date.substring(0, 4) : '';
    if (selectedYear !== 'all' && eYear !== selectedYear) return;

    const eCur = e.currency || 'CAD';
    // Use stored baseAmount when available to avoid re-conversion
    const eBase = e.baseAmount != null
      ? e.baseAmount
      : e.fxMissing
        ? 0
        : (e.amount || 0) * (_fxRateCache[`${eCur}_CAD`] || 1);

    totalOperatingExpenses += eBase;

    allLedger.push({
      date: e.date,
      type: 'Business Exp.',
      desc: e.desc,
      cat: canonicalExpenseCategory(e.cat),
      ref: e.ref || '',
      receipt: e.receipt || '',
      receiptFiles: e.receiptFiles || [],
      origCurrency: eCur,
      origAmount: e.amount || 0,
      baseAmount: eBase,
      hasRateError: !!e.fxMissing,
      isIncome: false,
      sourceType: 'businessExpense',
      itemId: e.id,
      trip: e.trip || ''
    });
  });

  return { totalGrossSales, totalOperatingExpenses, allLedger };
}

function _tcRenderStatusHeaders() {
  if ($('tc-api-key') && TAX_CENTER.settings?.geminiKey) $('tc-api-key').value = TAX_CENTER.settings.geminiKey;
  if ($('stripe-fees-key') && TAX_CENTER.settings?.stripeKey) $('stripe-fees-key').value = TAX_CENTER.settings.stripeKey;
  const _stripeStatusEl = $('stripe-fees-status');
  if (_stripeStatusEl && !_stripeStatusEl.textContent && TAX_CENTER.settings?.stripeFeesLastImportAt) {
    const last = new Date(TAX_CENTER.settings.stripeFeesLastImportAt);
    if (!isNaN(last)) {
      const days = Math.floor((Date.now() - last.getTime()) / 86400000);
      const ago = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
      _stripeStatusEl.textContent = `Fees last inserted into ledger ${ago} (${last.toISOString().slice(0, 10)}). Fetch again to refresh.`;
    }
  }
  if ($('tc-shippo-key') && TAX_CENTER.settings?.shippoKey) $('tc-shippo-key').value = TAX_CENTER.settings.shippoKey;
  const _shippoStatusEl = $('tc-shippo-status');
  if (_shippoStatusEl && TAX_CENTER.settings?.shippoLastImportAt) {
    const last = new Date(TAX_CENTER.settings.shippoLastImportAt);
    if (!isNaN(last)) {
      const days = Math.floor((Date.now() - last.getTime()) / 86400000);
      const ago = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
      _shippoStatusEl.textContent = `Last synced ${ago} (${last.toISOString().slice(0, 10)}). Imports non-refunded transaction rates as Shipping & Postage expenses.`;
    }
  }

  // Update the receipt storage status shown inline next to the Receipt
  // input on Log Business Expense.
  loadReceiptFolderHandle().then(async handle => {
    const inlineStatus = $('tc-exp-storage-status');
    const inlineAuthBtn = $('tc-exp-storage-auth-btn');
    const setInline = (text, color, showAuth) => {
      if (inlineStatus) {
        inlineStatus.innerHTML = text;
        inlineStatus.style.color = color || 'var(--text3)';
      }
      if (inlineAuthBtn) inlineAuthBtn.style.display = showAuth ? '' : 'none';
    };
    if (!handle) {
      setInline('Storage: <strong>Cloud</strong> — receipts are kept safely online until you pick a folder to file them in', 'var(--text3)', false);
      _tcRenderReceiptStorage();
      return;
    }
    const perm = typeof handle.queryPermission === 'function'
      ? await handle.queryPermission({ mode: 'readwrite' })
      : 'prompt';
    if (perm === 'granted') {
      // Says what will actually be created: the chosen folder, then a year and
      // a category. It used to claim "receipts/General", which was both an
      // extra folder level and a stray one.
      setInline(`Saving to: <strong>${escapeHtml(handle.name)}</strong> › ${new Date().getFullYear()} › category`, 'var(--green)', false);
    } else {
      setInline(`⚠ Access needed for folder: <strong>${escapeHtml(handle.name)}</strong> — receipts go to the cloud until you allow it`, 'var(--amber)', true);
    }
    _tcRenderReceiptStorage();
  }).catch(e => {
    // A browser with no IndexedDB (private mode) or no folder API rejects here.
    // The backlog prompt is the one thing that must still render — it is what
    // tells the owner receipts are piling up somewhere other than their folder.
    console.warn('Receipt folder status unavailable', e);
    _tcRenderReceiptStorage();
  });
}

/**
 * Where the receipts live, stated neutrally.
 *
 * This used to nag: "40 receipts waiting to be filed, the oldest 95 days,
 * anything past 14 days is worth bringing down now." That framing came from
 * treating the local folder as the real home and the cloud as a queue to drain.
 * With the cloud as the permanent home, receipts held there are simply stored,
 * and the only thing worth flagging is an expense with no receipt at all — the
 * one an accountant will actually ask about.
 *
 * The folder-unreachable banner and the offline-copies readout are rendered by
 * main.js, which owns the folder handle and the cache.
 */
export const DISMISSED_NOTICES_KEY = 'lm-dismissed-receipt-notices';

export function getDismissedReceiptNotices() {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_NOTICES_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

function isReceiptNoticeDismissed(key) {
  const map = getDismissedReceiptNotices();
  return !!map[key];
}

function dismissReceiptNotice(key) {
  try {
    const map = getDismissedReceiptNotices();
    map[key] = true;
    localStorage.setItem(DISMISSED_NOTICES_KEY, JSON.stringify(map));
    _tcRenderReceiptStorage();
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast('Notice dismissed', 'ok', 3000);
    }
  } catch (e) {
    console.error('Failed to dismiss notice', e);
  }
}

function resetDismissedReceiptNotices() {
  try {
    localStorage.removeItem(DISMISSED_NOTICES_KEY);
    _tcRenderReceiptStorage();
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast('✓ Dismissed notices restored', 'ok', 3000);
    }
  } catch (e) {
    console.error('Failed to reset notices', e);
  }
}

function _tcRenderReceiptStorage() {
  const el = $('tc-cloud-backlog');
  const viewBtn = $('tc-view-cloud-btn');
  const exportBtn = $('tc-export-receipts-btn');
  const resetBtn = $('tc-reset-notices-btn');
  if (!el) return;

  const owners = receiptOwners(TAX_CENTER.businessExpenses, states, BOOKS);
  const s = summarizeReceiptStorage(owners.map(o => o.exp));

  if (viewBtn) viewBtn.style.display = s.cloudFiles ? '' : 'none';
  if (exportBtn) exportBtn.style.display = s.totalFiles ? '' : 'none';

  const countBadge = $('tc-vault-gallery-count');
  if (countBadge) countBadge.textContent = String(s.totalFiles || 0);

  if (!s.totalFiles && !s.withoutReceipts) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  const isSelected = (type) => _tcLedgerSpecialFilter === type ? ' is-selected-filter' : '';

  // Stat grid tiles
  const tiles = [];
  tiles.push(`
    <div class="tc-receipt-tile${isSelected('local')}" role="button" tabindex="0" onclick="tcFilterLedgerByReceiptStorage('local')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();tcFilterLedgerByReceiptStorage('local');}" title="Click to filter ledger to expenses stored in your local folder">
      <div class="tc-tile-icon">📁</div>
      <div class="tc-tile-body">
        <div class="tc-tile-num">${s.localFiles}</div>
        <div class="tc-tile-label">Local Folder</div>
      </div>
    </div>
  `);

  tiles.push(`
    <div class="tc-receipt-tile ${s.cloudFiles ? 'is-active' : ''}${isSelected('cloud')}" role="button" tabindex="0" onclick="tcFilterLedgerByReceiptStorage('cloud')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();tcFilterLedgerByReceiptStorage('cloud');}" title="Click to filter ledger to expenses saved in cloud backup">
      <div class="tc-tile-icon">☁️</div>
      <div class="tc-tile-body">
        <div class="tc-tile-num">${s.cloudFiles}</div>
        <div class="tc-tile-label">Cloud Backup</div>
      </div>
    </div>
  `);

  if (s.linkedFiles) {
    tiles.push(`
      <div class="tc-receipt-tile${isSelected('linked')}" role="button" tabindex="0" onclick="tcFilterLedgerByReceiptStorage('linked')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();tcFilterLedgerByReceiptStorage('linked');}" title="Click to filter ledger to expenses with external receipt links">
        <div class="tc-tile-icon">🔗</div>
        <div class="tc-tile-body">
          <div class="tc-tile-num">${s.linkedFiles}</div>
          <div class="tc-tile-label">External Links</div>
        </div>
      </div>
    `);
  }

  if (s.withoutReceipts) {
    tiles.push(`
      <div class="tc-receipt-tile is-warning${isSelected('missing')}" role="button" tabindex="0" onclick="tcFilterLedgerByReceiptStorage('missing')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();tcFilterLedgerByReceiptStorage('missing');}" title="Click to filter ledger to expenses missing receipts">
        <div class="tc-tile-icon">⚠️</div>
        <div class="tc-tile-body">
          <div class="tc-tile-num">${s.withoutReceipts}</div>
          <div class="tc-tile-label">No Receipt</div>
        </div>
      </div>
    `);
  }

  if (s.linkOnlyExpenses) {
    tiles.push(`
      <div class="tc-receipt-tile is-notice${isSelected('label')}" role="button" tabindex="0" onclick="tcFilterLedgerByReceiptStorage('label')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();tcFilterLedgerByReceiptStorage('label');}" title="Click to filter ledger to expenses with shipping labels only">
        <div class="tc-tile-icon">🏷️</div>
        <div class="tc-tile-body">
          <div class="tc-tile-num">${s.linkOnlyExpenses}</div>
          <div class="tc-tile-label">Label Only</div>
        </div>
      </div>
    `);
  }

  // Actionable advisory alerts (dismissible)
  const notices = [];
  const dismissed = getDismissedReceiptNotices();

  if (s.withoutReceipts && !dismissed.missing) {
    notices.push(`
      <div class="tc-receipt-alert is-warn" id="tc-notice-missing">
        <span class="tc-alert-glyph">⚠️</span>
        <div class="tc-alert-info">
          <strong>${s.withoutReceipts} expense${s.withoutReceipts === 1 ? '' : 's'} without a receipt attached.</strong>
          <span>Attach digital receipts or supplier invoices to maintain full audit compliance for tax filing.</span>
        </div>
        <button class="tc-alert-dismiss" type="button" onclick="dismissReceiptNotice('missing')" title="Dismiss this notice" aria-label="Dismiss notice">✕</button>
      </div>
    `);
  }
  if (s.linkOnlyExpenses && !dismissed.shippo) {
    notices.push(`
      <div class="tc-receipt-alert is-info" id="tc-notice-shippo">
        <span class="tc-alert-glyph">🏷️</span>
        <div class="tc-alert-info">
          <strong>${s.linkOnlyExpenses} expense${s.linkOnlyExpenses === 1 ? ' has' : 's have'} only a shipping label link.</strong>
          <span>A shipping label confirms a parcel was sent, not that you paid for it. Import your Shippo invoices or receipts for official proof of payment.</span>
        </div>
        <button class="tc-alert-dismiss" type="button" onclick="dismissReceiptNotice('shippo')" title="Dismiss this notice" aria-label="Dismiss notice">✕</button>
      </div>
    `);
  }

  if (resetBtn) {
    resetBtn.style.display = (dismissed.missing || dismissed.shippo) ? '' : 'none';
  }

  el.className = (s.withoutReceipts || s.linkOnlyExpenses) ? 'tc-cloud-backlog is-stale' : 'tc-cloud-backlog';
  el.innerHTML = `<div class="tc-receipt-stat-grid">${tiles.join('')}</div>`
    + (notices.length ? `<div class="tc-receipt-alert-stack">${notices.join('')}</div>` : '');
  el.style.display = '';
}

let activeTaxCenterSubTab = 'ledger';

function switchTaxCenterSubTab(subTabName) {
  activeTaxCenterSubTab = subTabName || 'ledger';
  const subTabs = ['ledger', 'receipts', 'integrations'];
  subTabs.forEach(tab => {
    const btn = document.getElementById('btn-tctab-' + tab);
    const sec = document.getElementById('tc-sec-' + tab);
    if (btn && sec) {
      if (tab === activeTaxCenterSubTab) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        btn.setAttribute('tabindex', '0');
        sec.style.display = '';
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
        btn.setAttribute('tabindex', '-1');
        sec.style.display = 'none';
      }
    }
  });
  if (activeTaxCenterSubTab === 'receipts') {
    if (_tcVaultViewMode === 'gallery') {
      _tcRenderReceiptGallery();
    } else {
      _tcRenderReceiptStorage();
    }
  }
}

function tcSubNavKeydown(e) {
  const subTabs = ['ledger', 'receipts', 'integrations'];
  const currentIdx = subTabs.indexOf(activeTaxCenterSubTab);
  if (currentIdx === -1) return;

  let nextIdx = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    nextIdx = (currentIdx + 1) % subTabs.length;
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    nextIdx = (currentIdx - 1 + subTabs.length) % subTabs.length;
  } else if (e.key === 'Home') {
    nextIdx = 0;
  } else if (e.key === 'End') {
    nextIdx = subTabs.length - 1;
  }

  if (nextIdx !== -1) {
    e.preventDefault();
    const nextTab = subTabs[nextIdx];
    switchTaxCenterSubTab(nextTab);
    const targetBtn = document.getElementById('btn-tctab-' + nextTab);
    if (targetBtn) targetBtn.focus();
  }
}

// ── Tax Season Pre-Flight Audit Modal ───────────────────────────────────────
function openTaxSeasonPreflightModal() {
  const yearSelect = $('tc-year') || $('tc-year-ledger');
  const year = yearSelect ? yearSelect.value : 'all';
  const isAllTime = (year === 'all');
  const baseCurrency = TAX_CENTER.settings?.baseCurrency || 'CAD';

  const { totalGrossSales, totalOperatingExpenses, allLedger } = _tcBuildLedger(year);

  // Check 1: Missing receipts (excluding rent / lease payments and gratuity copies which are exempt)
  const expenseEntries = allLedger.filter(r => !r.isIncome);
  const missingReceipts = expenseEntries.filter(r => !isReceiptExemptExpense(r) && !r.receipt && (!r.receiptFiles || !r.receiptFiles.length) && !(typeof r.ref === 'string' && (r.ref.includes('local://') || /^https?:\/\//i.test(r.ref)))).length;

  // Check 2: Foreign currency rate fallback warnings
  const rateWarnings = [];
  BOOK_LIST.forEach(book => {
    if (isTestBook(book) || isTestBookId(book.id)) return;
    const cur = getBookCurrencyCode(book);
    if (cur && cur !== 'CAD' && !_fxRateCache[`${cur}_CAD`]) {
      rateWarnings.push({ title: book.title, cur });
    }
  });
  const hasRateErrors = allLedger.some(r => r.hasRateError) || rateWarnings.length > 0;

  // Check 3: Pending notes
  const pendingList = _tcPendingList();
  const pendingInYear = isAllTime ? pendingList.length : pendingList.filter(p => !p.expectedDate || p.expectedDate.startsWith(year)).length;

  // Compute readiness score (0 - 100)
  let score = 100;
  if (missingReceipts > 0) score -= Math.min(25, missingReceipts * 3);
  if (hasRateErrors) score -= 20;
  if (pendingInYear > 0) score -= Math.min(15, pendingInYear * 5);
  score = Math.max(20, Math.min(100, score));

  const scoreColor = score >= 90 ? 'var(--green)' : score >= 70 ? 'var(--gold)' : 'var(--red)';
  const scoreBadge = score === 100 ? '✓ 100% Audit Ready' : `${score}% Audit Ready`;

  const container = $('tc-preflight-content');
  if (container) {
    container.innerHTML = `
      <div style="background:var(--surface-sunken);border:1px solid var(--border-default);border-radius:var(--r2);padding:14px 16px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
          <div>
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text3);font-weight:700;">Tax Reporting Period</span>
            <div style="font-size:16px;font-weight:700;color:var(--text1);">${isAllTime ? 'All Time (Full Historical Export)' : `Calendar Year ${escapeHtml(year)}`}</div>
          </div>
          <div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:${scoreColor};background:var(--cream2);border:1px solid ${scoreColor};padding:4px 12px;border-radius:99px;">
            ${scoreBadge}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;font-size:12px;padding-top:10px;border-top:1px solid var(--border-subtle);">
          <div><span style="color:var(--text3);">Gross Sales:</span><br><strong style="color:var(--green);font-family:'DM Mono',monospace;">+${fmt(totalGrossSales, baseCurrency)}</strong></div>
          <div><span style="color:var(--text3);">Operating Exp:</span><br><strong style="color:var(--red);font-family:'DM Mono',monospace;">-${fmt(totalOperatingExpenses, baseCurrency)}</strong></div>
          <div><span style="color:var(--text3);">Net Cash Flow:</span><br><strong style="color:var(--gold);font-family:'DM Mono',monospace;">${fmt(totalGrossSales - totalOperatingExpenses, baseCurrency)}</strong></div>
        </div>
      </div>

      <div class="tc-preflight-checklist" style="display:flex;flex-direction:column;gap:10px;">
        <div class="tc-preflight-item" style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:var(--r2);background:${hasRateErrors ? 'rgba(180,40,40,.08)' : 'var(--cream2)'};border:1px solid ${hasRateErrors ? 'var(--red)' : 'var(--border)'};">
          <span style="font-size:16px;line-height:1.2;">${hasRateErrors ? '⚠️' : '✓'}</span>
          <div style="flex:1;font-size:12px;">
            <strong>${hasRateErrors ? 'Foreign Currency Exchange Rates Incomplete' : 'Foreign Currency Rates Verified'}</strong>
            <div style="color:var(--text2);margin-top:2px;">${hasRateErrors ? `${rateWarnings.length || 'Some'} book(s) or entries use fallback 1.0 FX rate. Refresh rates to ensure tax totals match CRA/IRS filings.` : 'All foreign transactions properly converted to CAD base currency.'}</div>
          </div>
        </div>

        <div class="tc-preflight-item" style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:var(--r2);background:${missingReceipts > 0 ? 'rgba(180,120,20,.08)' : 'var(--cream2)'};border:1px solid ${missingReceipts > 0 ? 'var(--amber)' : 'var(--border)'};">
          <span style="font-size:16px;line-height:1.2;">${missingReceipts > 0 ? '⚠️' : '✓'}</span>
          <div style="flex:1;font-size:12px;">
            <strong>${missingReceipts > 0 ? `${missingReceipts} expense(s) without attached receipts` : 'All eligible expenses have proof-of-payment attached'}</strong>
            <div style="color:var(--text2);margin-top:2px;">${missingReceipts > 0 ? 'Digital receipts or supplier invoices are recommended for audit compliance (rent/lease payments exempt).' : 'Complete paper trail ready for tax archiving (rent/lease payments verified via bank records).'}</div>
          </div>
          ${missingReceipts > 0 ? `<button class="btn sm tag" onclick="tcJumpToFixPreflightIssues()" type="button" style="white-space:nowrap;">Inspect →</button>` : ''}
        </div>

        <div class="tc-preflight-item" style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:var(--r2);background:${pendingInYear > 0 ? 'var(--gold-bg)' : 'var(--cream2)'};border:1px solid ${pendingInYear > 0 ? 'var(--gold-line)' : 'var(--border)'};">
          <span style="font-size:16px;line-height:1.2;">${pendingInYear > 0 ? 'ℹ️' : '✓'}</span>
          <div style="flex:1;font-size:12px;">
            <strong>${pendingInYear > 0 ? `${pendingInYear} pending expense note(s) in review` : 'No unconfirmed pending notes'}</strong>
            <div style="color:var(--text2);margin-top:2px;">${pendingInYear > 0 ? 'Pending notes are kept out of ledger totals until confirmed.' : 'All known expenses are logged into the ledger.'}</div>
          </div>
        </div>
      </div>
    `;
  }

  const fixBtn = $('tc-preflight-fix-btn');
  if (fixBtn) fixBtn.style.display = missingReceipts > 0 ? '' : 'none';

  openM('tc-preflight');
}

function tcJumpToFixPreflightIssues() {
  closeM('tc-preflight');
  tcFilterLedgerByReceiptStorage('missing');
}

function executeFullTaxSeasonExport() {
  closeM('tc-preflight');
  if (typeof window.downloadFullTaxSeasonExportDirect === 'function') {
    window.downloadFullTaxSeasonExportDirect();
  } else if (typeof window.downloadFullTaxSeasonExport === 'function') {
    window.downloadFullTaxSeasonExport();
  }
}

// ── Receipts Vault Visual Gallery & Lightbox ────────────────────────────────
let _tcVaultViewMode = 'overview';
let _tcGallerySearch = '';
let _tcGalleryCategory = 'all';
let _tcGalleryPage = 0;
const TC_GALLERY_PAGE_SIZE = 12;

function tcSetVaultView(mode) {
  _tcVaultViewMode = mode === 'gallery' ? 'gallery' : 'overview';
  const btnOverview = $('btn-vault-view-overview');
  const btnGallery = $('btn-vault-view-gallery');
  const secOverview = $('tc-vault-overview-view');
  const secGallery = $('tc-vault-gallery-view');

  if (btnOverview && btnGallery && secOverview && secGallery) {
    if (_tcVaultViewMode === 'gallery') {
      btnGallery.classList.add('active');
      btnOverview.classList.remove('active');
      secGallery.style.display = '';
      secOverview.style.display = 'none';
      _tcRenderReceiptGallery();
    } else {
      btnOverview.classList.add('active');
      btnGallery.classList.remove('active');
      secOverview.style.display = '';
      secGallery.style.display = 'none';
      _tcRenderReceiptStorage();
    }
  }
}

function tcGallerySearchInput(v) {
  _tcGallerySearch = (v || '').trim().toLowerCase();
  _tcGalleryPage = 0;
  _tcRenderReceiptGallery();
}

function tcGalleryFilterChange() {
  const catSel = $('tc-gallery-category');
  _tcGalleryCategory = catSel ? catSel.value : 'all';
  _tcGalleryPage = 0;
  _tcRenderReceiptGallery();
}

function _tcAllReceiptItems() {
  const items = [];
  const baseCurrency = TAX_CENTER.settings?.baseCurrency || 'CAD';

  // Business Expenses
  (TAX_CENTER.businessExpenses || []).forEach(e => {
    const files = (Array.isArray(e.receiptFiles) && e.receiptFiles.length) ? e.receiptFiles : (e.receipt ? [e.receipt] : []);
    files.forEach(ref => {
      if (!ref || typeof ref !== 'string') return;
      items.push({
        sourceType: 'businessExpense',
        id: e.id,
        desc: e.desc || 'Expense',
        date: e.date || '',
        cat: e.cat || 'Other',
        amount: e.baseAmount != null ? e.baseAmount : (e.amount || 0),
        currency: baseCurrency,
        origAmount: e.amount || 0,
        origCurrency: e.currency || 'CAD',
        receiptRef: ref,
        trip: e.trip || ''
      });
    });
  });

  // Book Expenses
  Object.keys(BOOKS).forEach(bid => {
    if (isTestBookId(bid)) return;
    const s = states[bid];
    if (!s || !s.expenses) return;
    const bTitle = BOOKS[bid]?.title || '';
    s.expenses.forEach(e => {
      const files = (Array.isArray(e.receiptFiles) && e.receiptFiles.length) ? e.receiptFiles : (e.receipt ? [e.receipt] : []);
      files.forEach(ref => {
        if (!ref || typeof ref !== 'string') return;
        items.push({
          sourceType: 'bookExpense',
          bookId: bid,
          id: e.id,
          desc: `${e.desc || 'Expense'} (${bTitle})`,
          date: e.date || '',
          cat: e.cat || 'Project Expense',
          amount: e.baseAmount != null ? e.baseAmount : (e.amount || 0),
          currency: baseCurrency,
          origAmount: e.origAmount != null ? e.origAmount : (e.amount || 0),
          origCurrency: e.origCurrency || e.currency || 'CAD',
          receiptRef: ref,
          trip: ''
        });
      });
    });
  });

  // Sort latest date first
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return items;
}

function _tcRenderReceiptGallery() {
  const grid = $('tc-gallery-grid');
  const countBadge = $('tc-vault-gallery-count');
  if (!grid) return;

  const allItems = _tcAllReceiptItems();
  if (countBadge) countBadge.textContent = String(allItems.length);

  // Populate category select options if empty
  const catSel = $('tc-gallery-category');
  if (catSel && catSel.options.length <= 1) {
    const cats = Array.from(new Set(allItems.map(i => i.cat).filter(Boolean))).sort();
    catSel.innerHTML = '<option value="all">All Categories</option>' + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  }

  // Filter items
  let filtered = allItems;
  if (_tcGalleryCategory && _tcGalleryCategory !== 'all') {
    filtered = filtered.filter(i => i.cat === _tcGalleryCategory);
  }
  if (_tcGallerySearch) {
    filtered = filtered.filter(i => `${i.desc} ${i.cat} ${i.trip} ${i.date} ${i.receiptRef}`.toLowerCase().includes(_tcGallerySearch));
  }

  const baseCurrency = TAX_CENTER.settings?.baseCurrency || 'CAD';
  const totalPages = Math.max(1, Math.ceil(filtered.length / TC_GALLERY_PAGE_SIZE));
  if (_tcGalleryPage >= totalPages) _tcGalleryPage = totalPages - 1;
  if (_tcGalleryPage < 0) _tcGalleryPage = 0;

  const pageStart = _tcGalleryPage * TC_GALLERY_PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + TC_GALLERY_PAGE_SIZE);

  window._tcGalleryRenderedItems = filtered;

  if (pageItems.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:40px 20px;">
      <div class="e-icon">🗂</div>
      <div>${_tcGallerySearch || _tcGalleryCategory !== 'all' ? 'No receipts match your search filter' : 'No receipts attached yet. Drop receipts when logging expenses.'}</div>
    </div>`;
    const pg = $('tc-gallery-pagination');
    if (pg) pg.innerHTML = '';
    return;
  }

  grid.innerHTML = pageItems.map((item, idx) => {
    const isPdf = _tcIsPdfName(item.receiptRef);
    const globalIdx = pageStart + idx;
    const isCloud = item.receiptRef.startsWith('cloud://');
    const isLocal = item.receiptRef.startsWith('local://');
    const storageBadge = isCloud
      ? '<span class="pill blue" style="font-size:10px;">☁️ Cloud</span>'
      : isLocal
        ? '<span class="pill green" style="font-size:10px;">📁 Local</span>'
        : '<span class="pill gray" style="font-size:10px;">🔗 Link</span>';

    const thumbHtml = isPdf
      ? `<div class="tc-gallery-pdf-badge"><span style="font-size:28px;">📄</span><span style="font-size:10px;font-weight:700;margin-top:4px;">PDF DOCUMENT</span></div>`
      : `<div class="tc-gallery-img-thumb"><span style="font-size:28px;">🧾</span></div>`;

    return `
      <div class="tc-gallery-card" role="button" tabindex="0" onclick="openReceiptLightbox(${globalIdx})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openReceiptLightbox(${globalIdx});}" title="Click to preview receipt: ${escapeHtml(item.desc)}">
        <div class="tc-gallery-thumb-wrap">
          ${thumbHtml}
          <div class="tc-gallery-card-badges">
            ${storageBadge}
          </div>
        </div>
        <div class="tc-gallery-card-body">
          <div class="tc-gallery-card-title">${escapeHtml(item.desc)}</div>
          <div class="tc-gallery-card-meta">
            <span>📅 ${escapeHtml(item.date || '—')}</span>
            <span>•</span>
            <span style="color:var(--red);font-weight:700;">-${fmt(item.amount, baseCurrency)}</span>
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px;">${escapeHtml(item.cat)}</div>
        </div>
      </div>
    `;
  }).join('');

  // Render pagination controls
  const pgWrap = $('tc-gallery-pagination');
  if (pgWrap) {
    if (totalPages <= 1) {
      pgWrap.innerHTML = '';
    } else {
      pgWrap.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--text3);">
          <span>Showing ${pageStart + 1}–${Math.min(pageStart + TC_GALLERY_PAGE_SIZE, filtered.length)} of ${filtered.length} receipts</span>
          <div style="display:flex;gap:6px;">
            <button class="btn sm" type="button" onclick="setTcGalleryPage(${_tcGalleryPage - 1})" ${_tcGalleryPage === 0 ? 'disabled' : ''}>‹ Prev</button>
            <span style="padding:4px 8px;font-family:'DM Mono',monospace;">${_tcGalleryPage + 1} / ${totalPages}</span>
            <button class="btn sm" type="button" onclick="setTcGalleryPage(${_tcGalleryPage + 1})" ${_tcGalleryPage === totalPages - 1 ? 'disabled' : ''}>Next ›</button>
          </div>
        </div>
      `;
    }
  }
}

function setTcGalleryPage(p) {
  _tcGalleryPage = p;
  _tcRenderReceiptGallery();
}

// Lightbox state
let _tcLightboxState = {
  items: [],
  index: 0,
  zoom: 1,
  rotate: 0,
};

async function openReceiptLightbox(index) {
  const items = window._tcGalleryRenderedItems || _tcAllReceiptItems();
  if (!items || !items[index]) return;

  _tcLightboxState = {
    items,
    index,
    zoom: 1,
    rotate: 0,
  };

  openM('tc-receipt-lightbox');
  await _tcRenderLightboxContent();
}

async function _tcRenderLightboxContent() {
  const { items, index, zoom, rotate } = _tcLightboxState;
  const item = items[index];
  if (!item) return;

  const titleEl = $('tc-lightbox-title');
  const metaEl = $('tc-lightbox-meta');
  const counterEl = $('tc-lightbox-counter');
  if (titleEl) titleEl.textContent = item.desc || 'Receipt Preview';
  if (metaEl) {
    metaEl.innerHTML = `
      <span>📅 ${escapeHtml(item.date || '—')}</span> &nbsp;·&nbsp;
      <span>🏷️ ${escapeHtml(item.cat || '')}</span> &nbsp;·&nbsp;
      <strong style="color:var(--red);font-family:'DM Mono',monospace;">-${fmt(item.amount, item.currency || 'CAD')}</strong>
    `;
  }
  if (counterEl) counterEl.textContent = `${index + 1} / ${items.length}`;

  const prevBtn = $('tc-lightbox-prev-btn');
  const nextBtn = $('tc-lightbox-next-btn');
  if (prevBtn) prevBtn.disabled = (index <= 0);
  if (nextBtn) nextBtn.disabled = (index >= items.length - 1);

  const imgEl = $('tc-lightbox-img');
  const canvasEl = $('tc-lightbox-canvas');
  const loadEl = $('tc-lightbox-loading');
  const extLink = $('tc-lightbox-open-external');
  const viewport = $('tc-lightbox-viewport');

  if (viewport) {
    viewport.style.transform = `scale(${zoom}) rotate(${rotate}deg)`;
  }

  if (loadEl) loadEl.style.display = 'block';
  if (imgEl) imgEl.style.display = 'none';
  if (canvasEl) canvasEl.style.display = 'none';

  const ref = item.receiptRef;
  const isPdf = _tcIsPdfName(ref);

  try {
    let resolvedUrl = '';
    let blob = null;

    if (ref.startsWith('local://')) {
      const path = ref.replace('local://', '');
      const handle = await loadReceiptFolderHandle();
      if (handle) {
        blob = await resolveLocalReceiptFile(handle, path);
        if (blob) resolvedUrl = URL.createObjectURL(blob);
      }
    } else if (ref.startsWith('cloud://')) {
      if (typeof window._fbGetCloudReceiptUrl === 'function') {
        resolvedUrl = await window._fbGetCloudReceiptUrl(ref);
      }
    } else if (/^https?:\/\//i.test(ref)) {
      resolvedUrl = ref;
    }

    if (extLink) {
      extLink.href = resolvedUrl || '#';
      extLink.style.display = resolvedUrl ? '' : 'none';
    }

    if (isPdf) {
      if (!blob && resolvedUrl) {
        const res = await fetch(resolvedUrl);
        blob = await res.blob();
      }
      if (blob) {
        const pdfjsLib = await ensurePdfJs();
        const buf = await blob.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        const page = await doc.getPage(1);
        const vp = page.getViewport({ scale: 1.5 });
        if (canvasEl) {
          canvasEl.width = vp.width;
          canvasEl.height = vp.height;
          await page.render({ canvasContext: canvasEl.getContext('2d'), viewport: vp }).promise;
          canvasEl.style.display = 'block';
        }
        if (loadEl) loadEl.style.display = 'none';
      } else {
        throw new Error('PDF file could not be retrieved');
      }
    } else if (resolvedUrl) {
      if (imgEl) {
        imgEl.src = resolvedUrl;
        imgEl.onload = () => {
          if (loadEl) loadEl.style.display = 'none';
          imgEl.style.display = 'block';
        };
        imgEl.onerror = () => {
          if (loadEl) {
            loadEl.style.display = 'block';
            loadEl.innerHTML = '<div class="e-icon">⚠️</div><div>Image preview could not be displayed</div>';
          }
        };
      }
    } else {
      throw new Error('No receipt resource available');
    }
  } catch (err) {
    if (loadEl) {
      loadEl.style.display = 'block';
      loadEl.innerHTML = `<div class="e-icon">⚠️</div><div>Could not load preview (${escapeHtml(err.message || 'File offline')})</div>`;
    }
  }
}

function tcLightboxZoom(delta) {
  _tcLightboxState.zoom = Math.max(0.5, Math.min(3.0, _tcLightboxState.zoom + delta));
  const viewport = $('tc-lightbox-viewport');
  if (viewport) viewport.style.transform = `scale(${_tcLightboxState.zoom}) rotate(${_tcLightboxState.rotate}deg)`;
}

function tcLightboxRotate() {
  _tcLightboxState.rotate = (_tcLightboxState.rotate + 90) % 360;
  const viewport = $('tc-lightbox-viewport');
  if (viewport) viewport.style.transform = `scale(${_tcLightboxState.zoom}) rotate(${_tcLightboxState.rotate}deg)`;
}

function tcLightboxReset() {
  _tcLightboxState.zoom = 1;
  _tcLightboxState.rotate = 0;
  const viewport = $('tc-lightbox-viewport');
  if (viewport) viewport.style.transform = `scale(1) rotate(0deg)`;
}

function tcLightboxNav(dir) {
  const newIndex = _tcLightboxState.index + dir;
  if (newIndex >= 0 && newIndex < _tcLightboxState.items.length) {
    _tcLightboxState.index = newIndex;
    _tcLightboxState.zoom = 1;
    _tcLightboxState.rotate = 0;
    _tcRenderLightboxContent();
  }
}

function renderTaxCenter() {
  if (isAuthor()) return;
  // Preserve active subtab state
  switchTaxCenterSubTab(activeTaxCenterSubTab);
  // Restore the saved ledger view (year + search + type) before reading the year.
  _tcRestoreLedgerPrefs();
  _tcRenderStatusHeaders();

  const baseCurrency = TAX_CENTER.settings?.baseCurrency || 'CAD';
  const yearSelect = $('tc-year');
  const selectedYear = yearSelect ? yearSelect.value : 'all';

  const { totalGrossSales, totalOperatingExpenses, allLedger } = _tcBuildLedger(selectedYear);

  const netCashFlow = totalGrossSales - totalOperatingExpenses;

  // Render the redesigned Cash Flow Summary card (headline stats + deltas +
  // secondary KPIs + monthly mini-chart + FX-staleness banner). Pass the
  // already-built ledger so the chart and counts never re-iterate or drift.
  _tcRenderCashFlowSummary({
    selectedYear, baseCurrency, allLedger,
    totalGrossSales, totalOperatingExpenses, netCashFlow,
  });

  // Trips panel + autocomplete suggestions
  _tcRenderTripsPanel(selectedYear, baseCurrency);

  _tcRenderPendingPanel();

  _tcRenderCategoryPanel(allLedger, baseCurrency);

  // ⚡ Bolt Optimization: Use string comparison instead of parsing to Date for sorting "YYYY-MM-DD" formatted dates
  allLedger.sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    return dateA > dateB ? -1 : dateA < dateB ? 1 : 0;
  });

  // Apply the search + type filter; everything below (pagination, totals footer,
  // CSV export) operates on this filtered view. Stash it so the CSV export covers
  // the WHOLE filtered year — not just the visible page.
  const filteredLedger = _tcApplyLedgerFilter(allLedger);
  window._tcLedgerExport = { rows: filteredLedger, baseCurrency };

  // Clamp page to valid range
  const totalPages = Math.max(1, Math.ceil(filteredLedger.length / TC_LEDGER_PAGE_SIZE));
  if (_tcLedgerPage >= totalPages) _tcLedgerPage = totalPages - 1;
  if (_tcLedgerPage < 0) _tcLedgerPage = 0;
  const pageStart = _tcLedgerPage * TC_LEDGER_PAGE_SIZE;
  const pageLedger = filteredLedger.slice(pageStart, pageStart + TC_LEDGER_PAGE_SIZE);

  _tcRenderLedgerTable(pageLedger, baseCurrency);

  // Filtered totals footer — reacts to the year + search + type filter.
  _tcRenderLedgerFoot(filteredLedger, baseCurrency);

  // Active-filter chip (search + type) — makes it obvious why the table shows
  // fewer rows than the year-scoped summary cards, with one-click reset.
  _tcRenderLedgerFilterChip();

  // Pagination controls
  _tcRenderLedgerPagination(filteredLedger, pageStart, totalPages);

  _tcRenderRecurringSubscriptions();

  // Keep BOTH year selects in agreement with the period that was just rendered,
  // regardless of which control triggered the change (or a restored pref).
  [$('tc-year'), $('tc-year-ledger')].forEach(el => {
    if (el && el.value !== selectedYear &&
      Array.from(el.options).some(o => o.value === selectedYear)) {
      el.value = selectedYear;
    }
  });
  renderShippingReconciliationWorklist();
}

function _tcSvgEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _tcDeltaChip(delta, prevYear, goodWhenUp) {
  if (!delta) return '';
  if (delta.kind === 'new') {
    return `<span class="cf-chip-new" title="No activity in ${prevYear}">new</span>`;
  }
  const up = delta.dir === 'up';
  const flat = delta.dir === 'flat';
  const arrow = flat ? '→' : up ? '▲' : '▼';
  // For income/net: up = good (green). For expenses: up = bad (red).
  const good = flat ? null : (goodWhenUp ? up : !up);
  const cls = good === null ? 'cf-chip-flat' : good ? 'cf-chip-up' : 'cf-chip-down';
  const pct = Math.abs(delta.pct);
  const pctStr = pct >= 100 ? Math.round(pct) : pct.toFixed(pct < 10 ? 1 : 0);
  return `<span class="${cls}" title="vs ${prevYear}">${arrow} ${pctStr}% <span class="cf-chip-vs">vs ${prevYear}</span></span>`;
}

function _tcRenderCashFlowSummary(ctx) {
  const { selectedYear, baseCurrency, allLedger,
    totalGrossSales, totalOperatingExpenses, netCashFlow } = ctx;

  // ---- Headline values + colours -----------------------------------------
  const salesEl = $('tc-sales');
  const expEl = $('tc-expenses');
  const netEl = $('tc-net');
  if (salesEl) salesEl.textContent = fmt(totalGrossSales, baseCurrency);
  if (expEl) expEl.textContent = fmt(totalOperatingExpenses, baseCurrency);
  if (netEl) netEl.textContent = fmt(netCashFlow, baseCurrency);

  // Net is green when in the black, red when underwater (previously always green).
  const netCard = $('tc-net-card');
  if (netCard) {
    netCard.classList.remove('cf-income', 'cf-expense');
    netCard.classList.add(netCashFlow >= 0 ? 'cf-income' : 'cf-expense');
  }

  // ---- Secondary KPI metrics for the selected period ----------------------
  const sources = { books: BOOKS, states, taxCenter: TAX_CENTER, fxRateCache: _fxRateCache };
  const cur = computeCashFlowMetrics(sources, selectedYear);
  const artistPayouts = cur.artistPayouts;
  const netAfterPayouts = netCashFlow - artistPayouts;
  const profitMargin = totalGrossSales > 0 ? (netCashFlow / totalGrossSales) * 100 : null;
  const avgSale = cur.txnCount > 0 ? totalGrossSales / cur.txnCount : null;

  // ---- Period-over-period deltas (single year only) -----------------------
  const salesDeltaEl = $('tc-sales-delta');
  const expDeltaEl = $('tc-expenses-delta');
  const netDeltaEl = $('tc-net-delta');
  if (selectedYear !== 'all' && /^\d{4}$/.test(selectedYear)) {
    const prevYear = String(Number(selectedYear) - 1);
    const prev = computeCashFlowMetrics(sources, prevYear);
    const prevNet = prev.grossSales - prev.operatingExpenses;
    if (salesDeltaEl) salesDeltaEl.innerHTML = _tcDeltaChip(cashFlowDelta(cur.grossSales, prev.grossSales), prevYear, true);
    if (expDeltaEl) expDeltaEl.innerHTML = _tcDeltaChip(cashFlowDelta(cur.operatingExpenses, prev.operatingExpenses), prevYear, false);
    if (netDeltaEl) netDeltaEl.innerHTML = _tcDeltaChip(cashFlowDelta(netCashFlow, prevNet), prevYear, true);
  } else {
    if (salesDeltaEl) salesDeltaEl.innerHTML = '';
    if (expDeltaEl) expDeltaEl.innerHTML = '';
    if (netDeltaEl) netDeltaEl.innerHTML = '';
  }

  // ---- Secondary KPI chips row --------------------------------------------
  const kpisEl = $('tc-cf-kpis');
  if (kpisEl) {
    const marginCls = profitMargin == null ? '' : profitMargin >= 0 ? 'cf-kpi-good' : 'cf-kpi-bad';
    const napCls = netAfterPayouts >= 0 ? 'cf-kpi-good' : 'cf-kpi-bad';
    const chip = (label, value, valCls = '', title = '') =>
      `<div class="cf-kpi"${title ? ` title="${_tcSvgEsc(title)}"` : ''}>
        <div class="cf-kpi-val ${valCls}">${value}</div>
        <div class="cf-kpi-label">${label}</div>
      </div>`;
    kpisEl.innerHTML = [
      chip('Profit Margin', profitMargin == null ? '—' : `${profitMargin.toFixed(1)}%`, marginCls, 'Net cash flow ÷ gross sales'),
      chip('Transactions', String(cur.txnCount), '', 'Number of sales in this period'),
      chip('Avg Sale', avgSale == null ? '—' : fmt(avgSale, baseCurrency), '', 'Gross sales ÷ transactions'),
      chip('Artist Payouts', fmt(artistPayouts, baseCurrency), 'cf-kpi-muted', 'Paid to artists — excluded from operating expenses'),
      chip('Net After Payouts', fmt(netAfterPayouts, baseCurrency), napCls, 'Net cash flow minus artist payouts'),
    ].join('');
  }

  // ---- FX rate-staleness banner -------------------------------------------
  const fxEl = $('tc-fx-warning');
  if (fxEl) {
    const stale = (allLedger || []).filter(r => r.hasRateError).length;
    if (stale > 0) {
      fxEl.innerHTML =
        `<div class="cf-fx-warn" role="status">
          <span class="cf-fx-ic" aria-hidden="true">⚠</span>
          <span>${stale} transaction${stale === 1 ? '' : 's'} used a fallback exchange rate (1.0) — totals may be inaccurate. Refresh FX rates and reload.</span>
        </div>`;
    } else {
      fxEl.innerHTML = '';
    }
  }

  // ---- Monthly / yearly mini bar chart (inline SVG) -----------------------
  const chartEl = $('tc-cf-chart');
  if (chartEl) {
    chartEl.innerHTML = _tcBuildCashFlowChart(allLedger, selectedYear, baseCurrency);
    _tcRenderSelectedCashFlowBucket();
  }
}

function _tcCashFlowBucketRows(key) {
  const data = window._tcCashFlowChartDetail || {};
  const monthly = data.selectedYear !== 'all' && data.selectedYear;
  return (data.ledger || []).filter((item) => {
    if (item.sourceType === 'artistPayout') return false;
    const date = item.date || '';
    const itemKey = monthly ? date.substring(0, 7) : date.substring(0, 4);
    return itemKey === key;
  });
}

function _tcRenderSelectedCashFlowBucket() {
  const data = window._tcCashFlowChartDetail || {};
  const detailEl = $('tc-cf-chart-detail');
  if (!detailEl) return;
  const buckets = data.buckets || [];
  const key = data.selectedKey || '';
  const bucket = buckets.find((b) => b.key === key);
  if (!bucket) {
    detailEl.innerHTML = '<div class="cf-chart-hint">Click a month or year to see its income and expense breakdown.</div>';
    return;
  }

  const rows = _tcCashFlowBucketRows(key).sort((a, b) => {
    // ⚡ Bolt Optimization: Replace slow localeCompare with string inequality for ISO dates
    const dA = a.date || '';
    const dB = b.date || '';
    return dA < dB ? -1 : (dA > dB ? 1 : 0);
  });
  const expenseRows = rows.filter((r) => !r.isIncome);
  const incomeRows = rows.filter((r) => r.isIncome);
  const activeType = data.detailType === 'income' || data.detailType === 'expenses' ? data.detailType : 'all';
  const visibleRows = activeType === 'income'
    ? incomeRows
    : activeType === 'expenses'
      ? expenseRows
      : rows;
  const total = (items) => items.reduce((sum, item) => sum + (Number(item.baseAmount) || 0), 0);
  const fmtSigned = (item) => `${item.isIncome ? '+' : '-'}${fmt(item.baseAmount || 0, data.baseCurrency || 'CAD')}`;
  const typeButton = (type, label, count) => `
    <button
      class="cf-detail-filter ${activeType === type ? 'is-active' : ''}"
      type="button"
      aria-pressed="${activeType === type ? 'true' : 'false'}"
      onclick="tcSetCashFlowDetailType('${type}')">
      ${_tcSvgEsc(label)} <span>${count}</span>
    </button>`;
  const rowHtml = (item) => `
    <tr>
      <td>${_tcSvgEsc(item.date || '—')}</td>
      <td>${_tcSvgEsc(item.desc || item.type || 'Transaction')}</td>
      <td>${_tcSvgEsc(item.cat || (item.isIncome ? 'Income' : 'Expense'))}</td>
      <td class="r ${item.isIncome ? 'cf-detail-income' : 'cf-detail-expense'}">${_tcSvgEsc(fmtSigned(item))}</td>
    </tr>`;
  const label = data.selectedYear === 'all' ? bucket.label : `${bucket.label} ${data.selectedYear}`;
  detailEl.innerHTML = `
    <div class="cf-detail-card">
      <div class="cf-detail-head">
        <div>
          <div class="cf-detail-kicker">Selected period</div>
          <strong>${_tcSvgEsc(label)}</strong>
        </div>
        <button class="btn tiny ghost" type="button" onclick="tcClearCashFlowBucket()">Clear</button>
      </div>
      <div class="cf-detail-totals">
        <span><b>Income</b>${_tcSvgEsc(fmt(total(incomeRows), data.baseCurrency || 'CAD'))}</span>
        <span><b>Expenses</b>${_tcSvgEsc(fmt(total(expenseRows), data.baseCurrency || 'CAD'))}</span>
        <span><b>Net</b>${_tcSvgEsc(fmt((bucket.income || 0) - (bucket.expense || 0), data.baseCurrency || 'CAD'))}</span>
      </div>
      <div class="cf-detail-filters" aria-label="Filter selected period transactions">
        ${typeButton('all', 'All', rows.length)}
        ${typeButton('income', 'Income only', incomeRows.length)}
        ${typeButton('expenses', 'Expenses only', expenseRows.length)}
      </div>
      <table class="cf-detail-table">
        <thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="r">Amount</th></tr></thead>
        <tbody>${visibleRows.length ? visibleRows.map(rowHtml).join('') : '<tr><td colspan="4">No transactions match this filter.</td></tr>'}</tbody>
      </table>
    </div>`;
}

function tcSelectCashFlowBucket(key) {
  if (!window._tcCashFlowChartDetail) return;
  window._tcCashFlowChartDetail.selectedKey = key;
  window._tcCashFlowChartDetail.detailType = 'all';
  _tcRenderSelectedCashFlowBucket();
}

function tcSetCashFlowDetailType(type) {
  if (!window._tcCashFlowChartDetail) return;
  window._tcCashFlowChartDetail.detailType = type === 'income' || type === 'expenses' ? type : 'all';
  _tcRenderSelectedCashFlowBucket();
}

function tcClearCashFlowBucket() {
  if (!window._tcCashFlowChartDetail) return;
  window._tcCashFlowChartDetail.selectedKey = '';
  window._tcCashFlowChartDetail.detailType = 'all';
  _tcRenderSelectedCashFlowBucket();
}

function _tcBuildCashFlowChart(allLedger, selectedYear, baseCurrency) {
  const buckets = buildCashFlowBuckets(allLedger, selectedYear);
  const hasData = buckets.some(b => b.income > 0 || b.expense > 0);
  if (!buckets.length || !hasData) return '';

  const W = 720, H = 200;
  const padL = 8, padR = 8, padTop = 14, padBottom = 26;
  const plotW = W - padL - padR;
  const plotH = H - padTop - padBottom;
  const baseY = padTop + plotH;
  const max = Math.max(1, ...buckets.map(b => Math.max(b.income, b.expense)));
  const n = buckets.length;
  const groupW = plotW / n;
  const barGap = Math.min(4, groupW * 0.08);
  const barW = Math.max(2, (groupW - barGap * 3) / 2);

  window._tcCashFlowChartDetail = {
    ledger: allLedger || [],
    buckets,
    selectedYear,
    baseCurrency,
    selectedKey: window._tcCashFlowChartDetail?.selectedKey || '',
    detailType: window._tcCashFlowChartDetail?.detailType || 'all',
  };
  if (!buckets.some((b) => b.key === window._tcCashFlowChartDetail.selectedKey)) {
    window._tcCashFlowChartDetail.selectedKey = '';
  }

  let bars = '';
  let labels = '';
  buckets.forEach((b, i) => {
    const gx = padL + i * groupW;
    const incH = (b.income / max) * plotH;
    const expH = (b.expense / max) * plotH;
    const x1 = gx + barGap;
    const x2 = x1 + barW + barGap;
    if (b.income > 0) {
      bars += `<rect class="cf-chart-bar" tabindex="0" role="button" aria-label="View ${_tcSvgEsc(b.label)} cash flow details" onclick="tcSelectCashFlowBucket('${_tcSvgEsc(b.key)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();tcSelectCashFlowBucket('${_tcSvgEsc(b.key)}')}" x="${x1.toFixed(1)}" y="${(baseY - incH).toFixed(1)}" width="${barW.toFixed(1)}" height="${incH.toFixed(1)}" rx="2" fill="url(#income-grad)"><title>${_tcSvgEsc(b.label)} income: ${_tcSvgEsc(fmt(b.income, baseCurrency))}</title></rect>`;
    }
    if (b.expense > 0) {
      bars += `<rect class="cf-chart-bar" tabindex="0" role="button" aria-label="View ${_tcSvgEsc(b.label)} cash flow details" onclick="tcSelectCashFlowBucket('${_tcSvgEsc(b.key)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();tcSelectCashFlowBucket('${_tcSvgEsc(b.key)}')}" x="${x2.toFixed(1)}" y="${(baseY - expH).toFixed(1)}" width="${barW.toFixed(1)}" height="${expH.toFixed(1)}" rx="2" fill="url(#expense-grad)"><title>${_tcSvgEsc(b.label)} expenses: ${_tcSvgEsc(fmt(b.expense, baseCurrency))}</title></rect>`;
    }
    labels += `<text x="${(gx + groupW / 2).toFixed(1)}" y="${(H - 8).toFixed(1)}" text-anchor="middle" class="cf-chart-axis">${_tcSvgEsc(b.label)}</text>`;
  });

  const title = selectedYear === 'all' ? 'Income vs expenses by year' : `Income vs expenses by month — ${selectedYear}`;
  return `
    <div class="cf-chart-head">
      <span class="cf-chart-title">${_tcSvgEsc(title)}</span>
      <span class="cf-legend">
        <span class="cf-legend-item"><span class="cf-legend-dot" style="background:linear-gradient(135deg, var(--green-light), var(--green));"></span>Income</span>
        <span class="cf-legend-item"><span class="cf-legend-dot" style="background:linear-gradient(135deg, var(--red-light), var(--red));"></span>Expenses</span>
      </span>
    </div>
    <svg class="cf-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${_tcSvgEsc(title)}">
      <defs>
        <linearGradient id="income-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="var(--green-light, #3ba75c)"/>
          <stop offset="100%" stop-color="var(--green, #1e5631)"/>
        </linearGradient>
        <linearGradient id="expense-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="var(--red-light, #e05e4d)"/>
          <stop offset="100%" stop-color="var(--red, #a63a2b)"/>
        </linearGradient>
      </defs>
      <line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" class="cf-chart-base"/>
      ${bars}
      ${labels}
    </svg>
    <div id="tc-cf-chart-detail" class="cf-chart-detail" aria-live="polite"></div>`;
}

async function openEditArtistPayout(bid, itemId) {
  const s = states[bid];
  if (!s || !Array.isArray(s.artistTransfers)) return;
  const t = s.artistTransfers.find(x => String(x.id || x.num) === String(itemId));
  if (!t) {
    showToast('⚠ Payout record not found', 'err');
    return;
  }

  const proceed = await confirmDialog(
    `Artist payouts are automatically generated from recorded sales.\n\n` +
    `To edit the details of this payout (like amount or qty), you should edit the corresponding sale entry (#${t.num}).\n\n` +
    `Would you like to open the edit screen for sale #${t.num} now?`,
    { okLabel: 'Edit corresponding sale', cancelLabel: 'Cancel', title: 'Edit Artist Payout' }
  );
  if (proceed) {
    openEditSale(bid, t.num);
  }
}

async function saveTaxCenterSettings() {
  const btn = $('tc-save-config-btn');
  const oldText = btn.textContent;
  btn.textContent = 'Saving...'; btn.disabled = true;

  const geminiKey = document.getElementById('tc-api-key').value.trim();

  try {
    await loadTaxCenter();
    if (!TAX_CENTER.settings) TAX_CENTER.settings = {};
    TAX_CENTER.settings.geminiKey = geminiKey;
    await saveTaxCenter();
    showToast('✓ Settings saved to Firebase');
  } catch (e) {
    console.error(e);
    showToast('⚠ Failed to save settings', 'err');
  }

  btn.textContent = oldText; btn.disabled = false;
}

// ── Recurring subscription editor ───────────────────────────────────────────
// One modal serves both "add" and "edit"; _tcEditingRecurring holds the id of
// the record being edited, or '' while adding.

let _tcEditingRecurring = '';

/**
 * Open the add/edit sheet. Called with no argument to add, or with a
 * subscription id to edit that record.
 */
function openRecurringEditor(id = '') {
  const record = id ? _tcFindRecurring(id) : null;
  if (id && !record) {
    showToast('⚠ Subscription not found', 'err');
    return;
  }
  const sub = record ? normalizeRecurring(record) : null;
  _tcEditingRecurring = id ? String(id) : '';

  const catSel = $('rec-edit-cat');
  if (catSel) {
    catSel.innerHTML = TC_CATEGORIES.map(c => `<option value="${c.replace(/"/g, '&quot;')}">${c}</option>`).join('');
    // A record saved under a category that has since been retired keeps it
    // rather than being silently reassigned to Other on the next save.
    if (sub?.cat && !TC_CATEGORIES.includes(sub.cat)) {
      catSel.innerHTML += `<option value="${sub.cat.replace(/"/g, '&quot;')}">${sub.cat}</option>`;
    }
    catSel.value = sub?.cat || 'Software & Subscriptions';
  }
  const freqSel = $('rec-edit-freq');
  if (freqSel) {
    freqSel.innerHTML = RECURRING_FREQUENCIES
      .map(f => `<option value="${f.id}">${f.label}</option>`).join('');
    freqSel.value = sub?.frequency || 'monthly';
  }

  $('rec-edit-desc').value = sub?.desc || '';
  $('rec-edit-vendor').value = sub?.vendor || '';
  $('rec-edit-cur').value = sub?.currency || 'CAD';
  $('rec-edit-amount').value = sub ? sub.amount : '';
  $('rec-edit-start').value = sub?.startDate || today();
  $('rec-edit-end').value = sub?.endDate || '';
  $('rec-edit-notes').value = sub?.notes || '';
  const pausedEl = $('rec-edit-paused');
  if (pausedEl) pausedEl.checked = !!sub?.paused;

  const title = $('rec-edit-title');
  if (title) title.textContent = id ? 'Edit subscription' : 'Add a recurring subscription';
  const saveBtn = $('rec-edit-save');
  if (saveBtn) saveBtn.textContent = id ? 'Save changes' : 'Add subscription';
  const histEl = $('rec-edit-history');
  if (histEl) {
    histEl.innerHTML = sub
      ? `Posted ${_tcRecurringChargeCount(sub)} charge(s) so far · last period logged: ${escapeHtml(sub.lastInjected || 'none')}`
      : 'Charges are posted to the ledger automatically, from the start date onward.';
  }

  openM('rec-edit');
  updateRecurringPreview();
}

/**
 * Live read-out under the form: cadence, monthly equivalent, annual run rate
 * and the next charge date, recomputed from the fields as they're typed.
 * The old inline form gave no feedback at all until after the record saved.
 */
function updateRecurringPreview() {
  const el = $('rec-edit-preview');
  if (!el) return;
  const draft = _tcReadRecurringForm();
  const baseCurrency = TAX_CENTER.settings?.baseCurrency || 'CAD';
  if (!draft.amount || !draft.startDate) {
    el.innerHTML = '<span class="rec-dim">Enter an amount and a start date to see the running cost.</span>';
    return;
  }
  const rate = draft.currency === baseCurrency ? 1 : Number(_fxRateCache[`${draft.currency}_${baseCurrency}`]) || 0;
  const perMonth = monthlyEquivalent(draft);
  const money = rate
    ? `${fmt(perMonth * rate, baseCurrency)}/mo · ${fmt(perMonth * rate * 12, baseCurrency)}/yr`
    : `≈ ${fmt(perMonth, draft.currency)}/mo · ${fmt(perMonth * 12, draft.currency)}/yr (no ${draft.currency}→${baseCurrency} rate cached)`;

  const next = nextRecurringDate({ ...draft, lastInjected: '' });
  const status = recurringStatus(draft);
  const when = draft.paused
    ? 'Paused — nothing will post until you resume.'
    : status === 'ended'
      ? `Ended ${escapeHtml(draft.endDate)} — no further charges.`
      : next ? `Next charge ${escapeHtml(next)} (${escapeHtml(relativeDayLabel(next))}).` : 'No upcoming charge.';

  // Backfill warning: a start date in the past means the ledger gets every
  // missed period at once on save. Better said here than discovered after.
  const missed = recurringDueCharges({ ...draft, lastInjected: _tcEditingRecurring ? (_tcFindRecurring(_tcEditingRecurring)?.lastInjected || '') : '' }).length;
  const backfill = missed
    ? `<div class="rec-preview-warn">⚠ ${missed} past charge${missed === 1 ? '' : 's'} will be posted to the ledger immediately.</div>`
    : '';

  el.innerHTML = `<div class="rec-preview-money">${money}</div>
    <div class="rec-preview-when">${escapeHtml(frequencyLabel(draft.frequency))} · ${when}</div>${backfill}`;
}

/** Read the editor fields into a subscription-shaped draft. */
function _tcReadRecurringForm() {
  return normalizeRecurring({
    desc: ($('rec-edit-desc')?.value || '').trim(),
    vendor: ($('rec-edit-vendor')?.value || '').trim(),
    cat: $('rec-edit-cat')?.value || 'Other',
    currency: $('rec-edit-cur')?.value || 'CAD',
    amount: parseFloat($('rec-edit-amount')?.value) || 0,
    startDate: $('rec-edit-start')?.value || '',
    endDate: $('rec-edit-end')?.value || '',
    frequency: $('rec-edit-freq')?.value || 'monthly',
    paused: !!$('rec-edit-paused')?.checked,
    notes: ($('rec-edit-notes')?.value || '').trim(),
  });
}

async function saveRecurringEditor() {
  const draft = _tcReadRecurringForm();
  if (!draft.desc) { showToast('⚠ Give the subscription a description', 'warn'); $('rec-edit-desc')?.focus(); return; }
  if (!(draft.amount > 0)) { showToast('⚠ Enter an amount above zero', 'warn'); $('rec-edit-amount')?.focus(); return; }
  if (!draft.startDate) { showToast('⚠ Pick a start date', 'warn'); $('rec-edit-start')?.focus(); return; }
  if (draft.endDate && draft.endDate < draft.startDate) {
    showToast('⚠ The end date is before the start date', 'warn'); $('rec-edit-end')?.focus(); return;
  }

  const btn = $('rec-edit-save');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    await loadTaxCenter();
    if (!TAX_CENTER.recurring) TAX_CENTER.recurring = [];
    _tcEnsureRecurringIds();

    if (_tcEditingRecurring) {
      const existing = _tcFindRecurring(_tcEditingRecurring);
      if (!existing) {
        showToast('⚠ That subscription was removed elsewhere', 'err');
        closeM('rec-edit');
        return;
      }
      // lastInjected is deliberately preserved: editing the price of a
      // subscription must not re-post periods the ledger already has.
      Object.assign(existing, draft, { id: existing.id, lastInjected: existing.lastInjected || '' });
    } else {
      const clash = TAX_CENTER.recurring.find(s =>
        (s.desc || '').toLowerCase() === draft.desc.toLowerCase() && !s.paused);
      if (clash && !(await confirmDialog(
        `"${draft.desc}" is already tracked as a recurring cost (${fmt(clash.amount, clash.currency || 'CAD')} ${frequencyLabel(clash.frequency)}).\n\nAdd a second one anyway? Both will post charges to the ledger.`,
        { title: 'Possible duplicate', okLabel: 'Add anyway' }))) {
        return;
      }
      TAX_CENTER.recurring.push({ ...draft, id: newRecurringId(), lastInjected: '' });
    }

    await saveTaxCenter();
    // Post anything the new/changed schedule already owes, then repaint — so
    // adding a subscription that started in March lands its back-charges now.
    processRecurringExpenses();
    await saveTaxCenter();
    closeM('rec-edit');
    renderTaxCenter();
    showToast(_tcEditingRecurring ? '✓ Subscription updated' : '✓ Subscription added');
    _tcEditingRecurring = '';
  } catch (e) {
    console.error(e);
    showToast('⚠ Could not save the subscription', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

/**
 * Pause or resume without deleting. Resuming rolls `lastInjected` forward to
 * the month before this one, so the ledger doesn't get a lump of back-charges
 * for a period the subscription was explicitly not billing.
 */
async function toggleRecurringPause(id) {
  await loadTaxCenter();
  _tcEnsureRecurringIds();
  const sub = _tcFindRecurring(id);
  if (!sub) { showToast('⚠ Subscription not found', 'err'); return; }

  if (sub.paused) {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
    if ((sub.lastInjected || '') < prevKey) sub.lastInjected = prevKey;
    sub.paused = false;
  } else {
    sub.paused = true;
  }

  await saveTaxCenter();
  if (!sub.paused) processRecurringExpenses();
  await saveTaxCenter();
  renderTaxCenter();
  showToast(sub.paused ? '⏸ Subscription paused' : '▶ Subscription resumed');
}

async function removeRecurring(id) {
  await loadTaxCenter();
  _tcEnsureRecurringIds();

  // Older callers passed the array index; ids are strings like 'rec_…', so a
  // numeric argument can still be resolved positionally for one release.
  let sub = _tcFindRecurring(id);
  if (!sub && typeof id === 'number') sub = (TAX_CENTER.recurring || [])[id] || null;
  if (!sub) { showToast('⚠ Subscription not found', 'err'); return; }

  const posted = _tcRecurringChargeCount(sub);
  const ok = await confirmDialog(
    `Remove "${sub.desc}" from recurring costs?\n\n` +
    (posted
      ? `The ${posted} charge${posted === 1 ? '' : 's'} it already posted stay in the ledger — only the schedule stops.`
      : 'Nothing has been posted from it yet.') +
    `\n\nTo stop it temporarily and keep the record, use Pause instead.`,
    { title: 'Remove subscription', okLabel: 'Remove', danger: true }
  );
  if (!ok) return;

  const at = TAX_CENTER.recurring.indexOf(sub);
  if (at !== -1) TAX_CENTER.recurring.splice(at, 1);
  await saveTaxCenter();
  renderTaxCenter();
  showToast('✓ Subscription removed');
}

function downloadTaxLedgerCSV() {
  // Build straight from the filtered ledger data (stashed by renderTaxCenter),
  // NOT the paginated DOM — so the export covers the entire filtered year, all
  // columns. renderTaxCenter() always runs when the Tax Center is visible, but
  // call it once here as a safety net if the stash is missing.
  if (!window._tcLedgerExport) renderTaxCenter();
  const exportData = window._tcLedgerExport || { rows: [], baseCurrency: 'CAD' };
  const { rows: data, baseCurrency } = exportData;

  if (!data.length) { showToast('Nothing to export for this filter'); return; }

  const rows = [['Date', 'Type', 'Description', 'Category', 'Receipt/Ref', 'Orig Currency', 'Amount (Orig)', `Amount (${baseCurrency})`]];
  for (const r of data) {
    // Sign the base-currency column so totals sum correctly in a spreadsheet.
    const signedBase = (r.isIncome ? 1 : -1) * Number(r.baseAmount || 0);
    rows.push([
      r.date || '',
      r.type || '',
      r.desc || '',
      r.cat || '',
      [r.ref || '', r.invoiceNum ? `Invoice ${r.invoiceNum}` : ''].filter(Boolean).join(' · '),
      r.origCurrency || '',
      Number(r.origAmount || 0).toFixed(2),
      signedBase.toFixed(2),
    ]);
  }

  // BOM + CRLF preserved: this file is opened directly in Excel, where the BOM
  // is what keeps a `·` or an accented description from arriving as mojibake.
  downloadCsv(toCsv(rows, { bom: true, eol: '\r\n' }), `Tax_Ledger_${today()}.csv`);
}
export {
  saveTaxCenter,
  processRecurringExpenses,
  tcExpenseRowDragOver,
  tcExpenseRowDragLeave,
  tcExpenseRowDrop,
  downloadTaxReport,
  _tcSaveLedgerPrefs,
  _tcRestoreLedgerPrefs,
  setTcLedgerPage,
  tcLedgerSearchInput,
  tcLedgerTypeFilter,
  tcYearChange,
  tcLedgerYearChange,
  tcClearLedgerFilters,
  _tcApplyLedgerFilter,
  _tcRenderRecurringSubscriptions,
  _tcRenderLedgerPagination,
  _tcRenderLedgerFilterChip,
  _tcRenderLedgerFoot,
  _tcRenderLedgerTable,
  _tcRenderCategoryPanel,
  tcSetTripsView,
  _tcGetTripsSummaryAll,
  tcRenderQuickTripChips,
  tcUpdateTripSelectedPreview,
  tcClearSelectedTrip,
  tcOpenTripDropdown,
  tcCloseTripDropdown,
  tcToggleTripDropdown,
  tcFilterTripDropdown,
  tcSelectTripOption,
  _tcTripRecords,
  _tcFindTripRecord,
  openNewTrip,
  openEditTripDetails,
  tcNewTripValidate,
  saveNewTrip,
  deleteTripRecord,
  logExpenseForTrip,
  openPendingExpense,
  tcPendingValidate,
  tcPendingRemindIn,
  savePendingExpense,
  deletePendingExpense,
  snoozePendingExpense,
  confirmPendingExpense,
  _tcClearConfirmedPending,
  _tcPendingList,
  _tcRenderPendingPanel,
  exportTripPDF,
  _tcTripReportReceipts,
  _tcIsPdfName,
  _tcBlobToDataUrl,
  _tcPdfToImages,
  _tcResolveReceiptImages,
  _tcRenderTripsPanel,
  _tcBuildLedger,
  _tcRenderStatusHeaders,
  renderTaxCenter,
  _tcSvgEsc,
  _tcDeltaChip,
  _tcRenderCashFlowSummary,
  _tcCashFlowBucketRows,
  _tcRenderSelectedCashFlowBucket,
  tcSelectCashFlowBucket,
  tcSetCashFlowDetailType,
  tcClearCashFlowBucket,
  _tcBuildCashFlowChart,
  openEditArtistPayout,
  saveTaxCenterSettings,
  openRecurringEditor,
  saveRecurringEditor,
  updateRecurringPreview,
  toggleRecurringPause,
  tcSetRecurringFilter,
  tcShowRecurringCharges,
  removeRecurring,
  downloadTaxLedgerCSV,
  dismissReceiptNotice,
  resetDismissedReceiptNotices,
  isReceiptNoticeDismissed,
  switchTaxCenterSubTab,
  tcSubNavKeydown,
  tcFilterLedgerByReceiptStorage,
  openTaxSeasonPreflightModal,
  tcJumpToFixPreflightIssues,
  executeFullTaxSeasonExport,
  tcSetVaultView,
  tcGallerySearchInput,
  tcGalleryFilterChange,
  _tcRenderReceiptGallery,
  setTcGalleryPage,
  openReceiptLightbox,
  tcLightboxZoom,
  tcLightboxRotate,
  tcLightboxReset,
  tcLightboxNav,
  _tcAllReceiptItems,
};
