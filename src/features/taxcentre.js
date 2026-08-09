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
  _localReceiptCell,
  calculateFinancials,
  confirmDialog,
  defaultState,
  isAuthor,
  isTestBook,
  isTestBookId,
  loadReceiptFolderHandle,
  loadTaxCenter,
  openM,
  closeM,
  openEditSale,
  saveReceiptToLocalFile,
  saveState,
  showToast,
  states,
  today,
  _tcEditTripId,
  _tcOpenTripName,
} from '../main.js';
import { renderShippingReconciliationWorklist } from './shipping.js';
import { escapeHtml } from '../lib/html.js';
import { csvRow, toCsv } from '../lib/csv.js';
import { downloadCsv } from '../lib/download.js';
import { fmt, getSym, getBookCurrencyCode, roundCents } from '../lib/money.js';
import { reconcileConsignmentInvoiceLinks } from '../lib/consignment.js';
import { buildCashFlowBuckets, cashFlowDelta, computeCashFlowMetrics } from '../lib/cashflow.js';

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

function processRecurringExpenses() {
  if (isAuthor() || !TAX_CENTER.recurring || TAX_CENTER.recurring.length === 0) return;
  const now = new Date();
  const _currentMonthStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  let modified = false;
  TAX_CENTER.recurring.forEach(sub => {
    const startDate = sub.startDate || today();
    const start = new Date(startDate);
    const startDay = start.getDate();

    // Start checking from the month of startDate
    let checkDate = new Date(start.getFullYear(), start.getMonth(), 1);
    const todayMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    while (checkDate <= todayMonth) {
      const mStr = checkDate.getFullYear() + '-' + String(checkDate.getMonth() + 1).padStart(2, '0');

      // Inject if this month is after lastInjected (YYYY-MM comparison)
      if (mStr > (sub.lastInjected || '')) {
        const lastDayInMonth = new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 0).getDate();
        const injectionDay = Math.min(startDay, lastDayInMonth);
        const injectionDateStr = checkDate.getFullYear() + '-' +
          String(checkDate.getMonth() + 1).padStart(2, '0') + '-' +
          String(injectionDay).padStart(2, '0');

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
          date: injectionDateStr,
          ref: 'Auto-Injected',
          receipt: ''
        });

        sub.lastInjected = mStr;
        modified = true;
      }

      // Advance by one month
      checkDate.setMonth(checkDate.getMonth() + 1);
    }
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

  const localUrl = await saveReceiptToLocalFile(file, subfolder);
  const targetUrl = localUrl || `local://${file.name}`;

  if (!Array.isArray(exp.receiptFiles)) exp.receiptFiles = exp.receipt ? [exp.receipt] : [];
  exp.receiptFiles.push(targetUrl);
  exp.receipt = exp.receiptFiles[0] || '';

  if (sourceType === 'businessExpense') {
    await saveTaxCenter();
  } else if (sourceType === 'bookExpense') {
    await saveState(sourceId);
  }

  renderTaxCenter();
  showToast(`✓ Attached receipt "${file.name}" to "${exp.desc || 'Expense'}"`, 'ok');
}

function downloadTaxReport() {
  const year = $('fin-year-selector').value;
  const fin = calculateFinancials(parseInt(year));
  const yearStr = String(year);

  let csv = 'Date,Type,Book/Source,Category,Description,Receipt URL,Revenue,COGS,Expense,Artist Payout,Net\n';

  BOOK_LIST.forEach(book => {
    if (isTestBook(book) || isTestBookId(book.id)) return;
    const s = states[book.id] || defaultState(book);

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

function tcClearLedgerFilters() {
  _tcLedgerSearch = '';
  _tcLedgerType = 'all';
  _tcLedgerPage = 0;
  const sEl = $('tc-ledger-search'); if (sEl) sEl.value = '';
  const tEl = $('tc-ledger-type'); if (tEl) tEl.value = 'all';
  _tcSaveLedgerPrefs();
  renderTaxCenter();
}

function _tcApplyLedgerFilter(rows) {
  let out = rows;
  if (_tcLedgerType === 'sales') out = out.filter(r => r.isIncome);
  else if (_tcLedgerType === 'expenses') out = out.filter(r => !r.isIncome);
  const q = _tcLedgerSearch.trim().toLowerCase();
  if (q) {
    out = out.filter(r => {
      const hay = `${r.date || ''} ${r.type || ''} ${r.desc || ''} ${r.cat || ''} ${r.ref || ''} ${r.origCurrency || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }
  return out;
}

function _tcRenderRecurringSubscriptions() {
  const recBody = $('tc-recurring-body');
  if (recBody) {
    recBody.innerHTML = (TAX_CENTER.recurring || []).map((sub, i) => `
        <tr>
            <td>${escapeHtml(sub.desc)}</td>
            <td>${escapeHtml(sub.cat)}</td>
            <td>${fmt(sub.amount, sub.currency || 'CAD')}</td>
            <td>${escapeHtml(sub.startDate || '-')}</td>
            <td>${escapeHtml(sub.lastInjected || 'Never')}</td>
            <td><button class="btn tx" onclick="removeRecurring(${i})">Remove</button></td>
        </tr>
      `).join('') || `<tr><td colspan="5" class="r" style="text-align:center;">No active subscriptions</td></tr>`;
  }
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
              <div style="display:flex;gap:18px;flex-wrap:wrap;">
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
        ? `<select onchange="changeExpenseCategory('${item.itemId}', this.value)" style="font-size:11px;padding:2px 4px;background:transparent;color:inherit;border:1px solid rgba(255,255,255,.15);border-radius:4px;max-width:170px;" title="Change category">
              ${TC_CATEGORIES.map(c => `<option value="${c.replace(/"/g, '&quot;')}"${c === item.cat ? ' selected' : ''}>${c}</option>`).join('')}
              ${TC_CATEGORIES.includes(item.cat) ? '' : `<option value="${(item.cat || '').replace(/"/g, '&quot;')}" selected>${item.cat || ''}</option>`}
            </select>`
        : item.cat;

      let descCell = item.desc || '';
      if (item.sourceType === 'businessExpense') {
        const tripPill = item.trip
          ? `<span onclick="event.stopPropagation();openEditTrip('${item.itemId}')" style="display:inline-block;margin-top:3px;font-size:10px;background:var(--gold-bg);color:var(--gold);border:1px solid var(--gold-line);border-radius:10px;padding:1px 8px;cursor:pointer;" title="Edit trip">✈ ${item.trip}</span>`
          : `<span onclick="event.stopPropagation();openEditTrip('${item.itemId}')" style="display:inline-block;margin-top:3px;font-size:10px;color:var(--text3);border:1px dashed var(--border);border-radius:10px;padding:1px 8px;cursor:pointer;" title="Assign to a trip">+ trip</span>`;
        descCell = `<div>${item.desc || ''}</div>${tripPill}`;
      }

      return `
        <tr style="color:${item.isIncome ? 'var(--green)' : 'var(--red)'};transition:all 0.2s;" ondragover="tcExpenseRowDragOver(event, this)" ondragleave="tcExpenseRowDragLeave(event, this)" ondrop="tcExpenseRowDrop(event, this, '${item.sourceType || ''}', '${item.sourceId || ''}', '${item.itemId || ''}')">
            <td style="font-size:12px;">${item.date || '—'}</td>
            <td><span class="tag ${item.isIncome ? 'green' : 'amber'}">${item.type}</span></td>
            <td style="font-size:12px;">${descCell}</td>
            <td style="font-size:12px;">${catCell}</td>
            <td style="font-size:12px;">${refCell}</td>
            <td class="r" style="font-size:12px;">${origDisplay}</td>
            <td class="r" style="font-weight:600;">${cadDisplay}</td>
            <td class="r">
              ${(item.sourceType === 'businessExpense' || item.sourceType === 'bookExpense')
          ? `<button class="btn-icon" aria-label="Edit entry" onclick="openEditExpense('${item.sourceType}', '${item.sourceId || ''}', '${item.itemId}')" title="Edit entry" style="margin-right:4px;">✏️</button>`
          : (item.sourceType === 'sale'
            ? `<button class="btn-icon" aria-label="Edit entry" onclick="openEditSale('${item.sourceId || ''}', '${item.itemId}')" title="Edit entry" style="margin-right:4px;">✏️</button>`
            : (item.sourceType === 'artistPayout'
              ? `<button class="btn-icon" aria-label="Edit entry" onclick="openEditArtistPayout('${item.sourceId || ''}', '${item.itemId}')" title="Edit entry" style="margin-right:4px;">✏️</button>`
              : ''
            )
          )
        }
              ${item.itemId ? `<button class="btn-icon" aria-label="Delete entry" onclick="removeLedgerEntry('${item.sourceType}', '${item.sourceId || ''}', '${item.itemId}')" title="Delete entry">🗑️</button>` : ''}
            </td>
        </tr>`;
    }).join('') || `<tr><td colspan="8" style="text-align:center;padding:1rem;color:var(--text3);">${(_tcLedgerSearch.trim() || _tcLedgerType !== 'all') ? 'No entries match your filter' : 'No data for selected period'}</td></tr>`;
  }
}

function _tcRenderCategoryPanel(allLedger, baseCurrency) {
  const catBody = $('tc-category-body');
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

    catBody.innerHTML = catList.map(c => `
          <tr onclick="showCategoryDetail(this.dataset.cat)" data-cat="${escapeHtml(c.name)}" style="cursor:pointer;" title="Click to view ${c.count} transaction${c.count === 1 ? '' : 's'}">
            <td style="color:var(--gold3);text-decoration:underline;">${escapeHtml(c.name)}</td>
            <td class="r">${c.count}</td>
            <td class="r" style="font-weight:bold;color:var(--red);">- ${fmt(c.total, baseCurrency)}</td>
          </tr>
      `).join('') || `<tr><td colspan="3" class="r" style="text-align:center;">No deductible expenses recorded</td></tr>`;
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
  const remote = [];
  const local = [];
  items.forEach(item => {
    const files = (Array.isArray(item.receiptFiles) && item.receiptFiles.length)
      ? item.receiptFiles
      : (item.receipt ? [item.receipt] : []);
    files.forEach(r => {
      if (typeof r !== 'string' || !r) return;
      if (r.startsWith('local://')) local.push({ name: r.replace('local://', '').split('/').pop(), desc: item.desc || '' });
      else if (/^https?:\/\//i.test(r)) remote.push({ url: r, desc: item.desc || '', date: item.date || '' });
    });
  });
  return { remote, local };
}

function exportTripPDF(tripName) {
  const name = (tripName || _tcOpenTripName || '').trim();
  const detail = window._tcTripDetail;
  if (!name || !detail || !detail.byName || !detail.byName[name]) {
    showToast('⚠ Trip details not found', 'warn');
    return;
  }

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

  const { remote, local } = _tcTripReportReceipts(sorted);
  const thumbs = remote.map(r => `<figure class="thumb">
      <img src="${escapeHtml(r.url)}" alt="${escapeHtml(r.desc)}">
      <figcaption>${escapeHtml([r.date, r.desc].filter(Boolean).join(' · '))}</figcaption>
    </figure>`).join('');
  const localList = local.length
    ? `<div class="local-note"><b>${local.length} receipt${local.length === 1 ? '' : 's'} stored in your local receipt folder</b> (not embedded):
        ${local.map(l => escapeHtml(l.name)).join(', ')}</div>`
    : '';
  const receiptsSection = (thumbs || localList)
    ? `<h2>Receipts</h2>${thumbs ? `<div class="thumbs">${thumbs}</div>` : ''}${localList}`
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

  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) {
    showToast('Pop-up blocked — allow pop-ups to print the trip report', 'warn');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give embedded receipt images a moment to load, or they print blank.
  setTimeout(() => { try { win.print(); } catch (e) { } }, remote.length ? 900 : 350);
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
        <div style="grid-column:1/-1;text-align:center;padding:40px 20px;background:rgba(28,25,23,0.4);border:1px dashed rgba(255,255,255,0.1);border-radius:12px;">
          <div style="font-size:28px;margin-bottom:8px;">✈</div>
          <div style="font-size:14px;font-weight:600;color:var(--text2);margin-bottom:4px;">No business trips logged yet</div>
          <div style="font-size:12px;color:var(--text3);max-width:380px;margin:0 auto 14px;">Create a trip (e.g. "Toronto Book Fair") and every travel, lodging and booth expense you assign to it totals here, ready for your tax return.</div>
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
    // Keep consignment Sale mirrors pointed at their live invoice number so a
    // rename reflects in this ledger's Receipt/Ref column.
    reconcileConsignmentInvoiceLinks(s);

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
        cat: e.cat || 'Project Expense',
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
      cat: e.cat || 'Other',
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
      setInline('Storage: <strong>Cloud (Firestore)</strong> — pick a local folder to save receipts as files', 'var(--text3)', false);
      return;
    }
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      // Use a chevron between the chosen folder and the sub-path so a
      // folder that happens to be named "receipts" doesn't read as the
      // confusing "receipts/receipts/General/".
      setInline(`Saving to: <strong>${escapeHtml(handle.name)}</strong> › receipts/General`, 'var(--green)', false);
    } else {
      setInline(`⚠ Access needed for folder: <strong>${escapeHtml(handle.name)}</strong>`, 'var(--amber)', true);
    }
  });
}

function renderTaxCenter() {
  if (isAuthor()) return;
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

async function removeRecurring(idx) {
  const itemToRemove = TAX_CENTER.recurring[idx];
  if (!itemToRemove) return;

  await loadTaxCenter();

  const freshIdx = TAX_CENTER.recurring.findIndex(sub =>
    sub.desc === itemToRemove.desc &&
    sub.amount === itemToRemove.amount &&
    sub.startDate === itemToRemove.startDate &&
    sub.cat === itemToRemove.cat
  );

  if (freshIdx !== -1) {
    TAX_CENTER.recurring.splice(freshIdx, 1);
  } else {
    TAX_CENTER.recurring.splice(idx, 1);
  }
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
  exportTripPDF,
  _tcTripReportReceipts,
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
  removeRecurring,
  downloadTaxLedgerCSV,
};
